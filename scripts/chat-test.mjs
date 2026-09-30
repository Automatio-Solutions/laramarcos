// Test del chat interno (US-06 · UC-601..UC-609) — migraciones 0020, 0021 y 0022.
// Verifica visibilidad por tipo de conversación (general / oficina / directo /
// cliente), directorio de compañeros, apertura idempotente de directos, RLS de
// escritura de mensajes, contador de no leídos y trigger de actividad.
// Fase 2 (0021): miembros de una conversación, apertura del hilo de cliente,
// cambio de oficina y visibilidad de comentarios de tareas.
// 0022: escritura de comentarios solo si se ve la tarea y tarea_quienes_ven.
// Fase 3 (0023): adjuntos (checks + bucket 'chat'), búsqueda sin tildes
// (chat_buscar), edición/borrado (política + trigger + auditoría) y canales
// privados de Realtime (presencia / escribiendo).
// 0024: un adjunto (ruta de Storage) pertenece a un solo mensaje y su nombre
// termina en una extensión admitida.
//
// Todo ocurre en UNA transacción que SIEMPRE se revierte. Las migraciones del
// chat que aún no figuren en public._migrations se ejecutan dentro de esa misma
// transacción (y también se revierten), así se pueden validar antes de aplicarlas.
//
// Uso: npm run db:chat-test   (requiere SUPABASE_DB_URL en .env.local)
import { config } from 'dotenv';
config({ path: '.env.local' });
config(); // fallback a .env
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import pg from 'pg';

const __dirname = dirname(fileURLToPath(import.meta.url));
const MIGRACIONES = [
  '0020_chat.sql', '0021_chat_fase2.sql', '0022_comentarios_insert.sql', '0023_chat_fase3.sql',
  '0024_chat_adjuntos_unicos.sql',
];
const rutaMigracion = (f) => join(__dirname, '..', 'supabase', 'migrations', f);

const url = process.env.SUPABASE_DB_URL;
if (!url) {
  console.error('✗ Falta SUPABASE_DB_URL en .env.local');
  process.exit(1);
}

const client = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
const q = (sql, params) => client.query(sql, params);

let pass = 0, fail = 0;
function check(name, cond) {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.log(`  ✗ ${name}`); }
}

async function asUser(id) {
  await q('set local role authenticated');
  await q(`set local request.jwt.claims = '${JSON.stringify({ sub: id, role: 'authenticated' })}'`);
}
async function asSuperuser() {
  await q('reset role');
  await q(`set local request.jwt.claims = ''`);
}
/** Como falla(), pero devuelve el SQLSTATE del error (o null si no falló). */
async function codigoError(sql, params) {
  await q('savepoint sp');
  try {
    await q(sql, params);
    await q('release savepoint sp');
    return null;
  } catch (e) {
    await q('rollback to savepoint sp');
    return e.code ?? 'desconocido';
  }
}
/** Ejecuta una sentencia que DEBE fallar sin abortar la transacción (savepoint). */
async function falla(sql, params) {
  await q('savepoint sp');
  try {
    await q(sql, params);
    await q('release savepoint sp');
    return false;
  } catch {
    await q('rollback to savepoint sp');
    return true;
  }
}
const ids = (res) => res.rows.map((r) => r.id);

const resp = randomUUID();
const asesorBdj = randomUUID();
const asesorCas = randomUUID();
const inactivo = randomUUID();
const clienteBdj = randomUUID();
const fixtures = [resp, asesorBdj, asesorCas, inactivo];

try {
  await client.connect();
  await q('begin');

  const hayRegistro = (await q(`select to_regclass('public._migrations') as t`)).rows[0].t;
  const aplicadas = hayRegistro
    ? new Set((await q('select name from public._migrations')).rows.map((r) => r.name))
    : new Set();
  for (const f of MIGRACIONES) {
    if (!aplicadas.has(f)) {
      console.log(`  · ${f} no aplicada: se ejecuta dentro de la transacción (se revertirá)`);
      await q(readFileSync(rutaMigracion(f), 'utf8'));
    }
  }

  // --- Fixtures (como owner, RLS no aplica). Alta "ayer" para que los mensajes
  //     de hoy cuenten como no leídos desde el alta.
  for (const [id, email] of [
    [resp, 'chat-resp@test.lm'], [asesorBdj, 'chat-abdj@test.lm'],
    [asesorCas, 'chat-acas@test.lm'], [inactivo, 'chat-inac@test.lm'],
  ]) {
    await q(
      `insert into auth.users (id, instance_id, aud, role, email, created_at, updated_at)
       values ($1, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', $2, now(), now())`,
      [id, email],
    );
  }
  await q(`insert into public.usuarios (id, email, nombre, rol, oficina, activo, created_at) values
           ($1,'chat-resp@test.lm','ZZ Chat Resp','responsable','Badajoz', true,  now() - interval '1 day'),
           ($2,'chat-abdj@test.lm','ZZ Chat Asesor Badajoz','asesor','Badajoz', true,  now() - interval '1 day'),
           ($3,'chat-acas@test.lm','ZZ Chat Asesor Castuera','asesor','Castuera', true,  now() - interval '1 day'),
           ($4,'chat-inac@test.lm','ZZ Chat Inactivo','asesor','Badajoz', false, now() - interval '1 day')`,
          [resp, asesorBdj, asesorCas, inactivo]);
  await q(`insert into public.clientes (id, cif, razon_social, oficina)
           values ($1, 'B99999990', 'Cliente Chat Badajoz', 'Badajoz')`, [clienteBdj]);

  const canales = await q(`select id, tipo, oficina from public.conversaciones where tipo in ('general','oficina')`);
  const general = canales.rows.find((r) => r.tipo === 'general')?.id;
  const canal = (o) => canales.rows.find((r) => r.tipo === 'oficina' && r.oficina === o)?.id;
  check('Seed · existe el canal General y los 4 de oficina',
    !!general && ['Badajoz', 'Castuera', 'Don Benito', 'Orellana'].every((o) => !!canal(o)));

  // --- Directorio ---
  await asUser(asesorBdj);
  const dir = await q('select * from public.chat_directorio()');
  const dirFix = dir.rows.filter((r) => fixtures.includes(r.id));
  check('Directorio · asesor ve a los 3 compañeros activos (aunque RLS de usuarios no se lo permita)',
    dirFix.length === 3 && [resp, asesorBdj, asesorCas].every((id) => dirFix.some((r) => r.id === id)));
  check('Directorio · NO incluye al usuario inactivo', !dirFix.some((r) => r.id === inactivo));
  const filaCas = dirFix.find((r) => r.id === asesorCas);
  check('Directorio · devuelve nombre, oficina y rol',
    filaCas?.nombre === 'ZZ Chat Asesor Castuera' && filaCas?.oficina === 'Castuera' && filaCas?.rol === 'asesor');
  const noms = await q('select * from public.chat_nombres($1::uuid[])', [[inactivo, asesorCas]]);
  check('chat_nombres · resuelve también a usuarios inactivos',
    noms.rowCount === 2 && noms.rows.some((r) => r.id === inactivo && r.nombre === 'ZZ Chat Inactivo'));

  // --- Canales por oficina ---
  const vistosBdj = ids(await q(`select id from public.conversaciones where tipo in ('general','oficina')`));
  check('Canales · asesor Badajoz ve General', vistosBdj.includes(general));
  check('Canales · asesor Badajoz ve el canal de Badajoz', vistosBdj.includes(canal('Badajoz')));
  check('Canales · asesor Badajoz NO ve el canal de Castuera', !vistosBdj.includes(canal('Castuera')));
  await q('insert into public.mensajes (conversacion_id, autor_id, texto) values ($1,$2,$3)',
    [canal('Badajoz'), asesorBdj, 'Hola Badajoz']);
  await asSuperuser();

  await asUser(resp);
  const vistosResp = ids(await q(`select id from public.conversaciones where tipo = 'oficina'`));
  check('Canales · responsable ve los 4 canales de oficina',
    ['Badajoz', 'Castuera', 'Don Benito', 'Orellana'].every((o) => vistosResp.includes(canal(o))));
  await asSuperuser();

  await asUser(asesorCas);
  const msgBdjCas = await q('select id from public.mensajes where conversacion_id = $1', [canal('Badajoz')]);
  check('Canales · asesor Castuera NO ve mensajes del canal de Badajoz', msgBdjCas.rowCount === 0);
  const fallaCanal = await falla('insert into public.mensajes (conversacion_id, autor_id, texto) values ($1,$2,$3)',
    [canal('Badajoz'), asesorCas, 'intruso']);
  check('Canales · asesor Castuera NO puede escribir en el canal de Badajoz', fallaCanal);
  await asSuperuser();
  await asUser(asesorBdj);
  const msgBdjBdj = await q('select id from public.mensajes where conversacion_id = $1', [canal('Badajoz')]);
  check('Canales · asesor Badajoz SÍ ve mensajes de su canal', msgBdjBdj.rowCount === 1);

  // --- Directos ---
  const d1 = (await q('select public.chat_abrir_directo($1) as id', [asesorCas])).rows[0].id;
  const d2 = (await q('select public.chat_abrir_directo($1) as id', [asesorCas])).rows[0].id;
  check('Directo · abrirlo dos veces devuelve la misma conversación', !!d1 && d1 === d2);
  check('Directo · no se puede abrir con uno mismo',
    await falla('select public.chat_abrir_directo($1)', [asesorBdj]));
  check('Directo · no se puede abrir con un usuario inactivo',
    await falla('select public.chat_abrir_directo($1)', [inactivo]));
  check('Directo · no se crean conversaciones directamente (sin política INSERT)',
    await falla(`insert into public.conversaciones (tipo, nombre) values ('general','pirata')`));

  // Mensaje con id del cliente (UI optimista) y fecha manipulada → la fija el servidor.
  const mOpt = randomUUID();
  await q(`insert into public.mensajes (id, conversacion_id, autor_id, texto, created_at)
           values ($1,$2,$3,$4,'2000-01-01')`, [mOpt, d1, asesorBdj, 'Hola Castuera']);
  const mOptRow = await q('select id, created_at > now() - interval \'1 hour\' as reciente from public.mensajes where id = $1', [mOpt]);
  check('Mensaje · se inserta con el id aportado por el cliente', mOptRow.rowCount === 1);
  check('Mensaje · la hora la pone el servidor (ignora created_at del cliente)', mOptRow.rows[0]?.reciente === true);
  await q('insert into public.mensajes (conversacion_id, autor_id, texto) values ($1,$2,$3)',
    [d1, asesorBdj, 'Segundo mensaje']);
  check('Mensaje · NO puede firmar como otro usuario',
    await falla('insert into public.mensajes (conversacion_id, autor_id, texto) values ($1,$2,$3)',
      [d1, asesorCas, 'suplantación']));
  check('Mensaje · NO puede insertarse ya borrado/editado',
    await falla('insert into public.mensajes (conversacion_id, autor_id, texto, borrado) values ($1,$2,$3,true)',
      [d1, asesorBdj, 'x']));
  check('Mensaje · máximo 5000 caracteres',
    await falla('insert into public.mensajes (conversacion_id, autor_id, texto) values ($1,$2,$3)',
      [d1, asesorBdj, 'a'.repeat(5001)]));
  const propios = await q('select * from public.chat_no_leidos() where conversacion_id = $1', [d1]);
  check('No leídos · los mensajes propios nunca cuentan', propios.rowCount === 0);
  await asSuperuser();

  await asUser(asesorCas);
  const d3 = (await q('select public.chat_abrir_directo($1) as id', [asesorBdj])).rows[0].id;
  check('Directo · el otro participante obtiene la misma conversación', d3 === d1);
  const nl = await q('select no_leidos from public.chat_no_leidos() where conversacion_id = $1', [d1]);
  check('No leídos · asesor Castuera tiene 2 sin leer en el directo', nl.rows[0]?.no_leidos === 2);
  await q('select public.chat_marcar_leida($1)', [d1]);
  const nl2 = await q('select no_leidos from public.chat_no_leidos() where conversacion_id = $1', [d1]);
  check('No leídos · tras marcar leída no hay fila', nl2.rowCount === 0);
  const lect = await q('select 1 from public.chat_lecturas where conversacion_id = $1', [d1]);
  check('No leídos · la lectura queda registrada para el usuario', lect.rowCount === 1);
  await asSuperuser();

  // Mensaje posterior a la lectura (insertado como owner con hora futura) → vuelve a contar.
  await q(`insert into public.mensajes (conversacion_id, autor_id, texto, created_at)
           values ($1,$2,'Tercero', now() + interval '1 minute')`, [d1, asesorBdj]);
  await asUser(asesorCas);
  const nl3 = await q('select no_leidos from public.chat_no_leidos() where conversacion_id = $1', [d1]);
  check('No leídos · un mensaje posterior a la lectura vuelve a contar (1)', nl3.rows[0]?.no_leidos === 1);
  await asSuperuser();

  await asUser(resp);
  const respDir = await q('select id from public.conversaciones where id = $1', [d1]);
  check('Directo · el responsable NO ve la conversación ajena', respDir.rowCount === 0);
  const respMsg = await q('select id from public.mensajes where conversacion_id = $1', [d1]);
  check('Directo · el responsable NO ve sus mensajes', respMsg.rowCount === 0);
  check('Directo · el responsable NO puede escribir en él',
    await falla('insert into public.mensajes (conversacion_id, autor_id, texto) values ($1,$2,$3)',
      [d1, resp, 'hola']));
  await asSuperuser();

  // --- Conversación de cliente ---
  const cc = (await q(`insert into public.conversaciones (tipo, cliente_id) values ('cliente', $1) returning id`,
    [clienteBdj])).rows[0].id;
  for (const [quien, nombre, esperado] of [
    [asesorBdj, 'asesor Badajoz', 1], [resp, 'responsable', 1], [asesorCas, 'asesor Castuera', 0],
  ]) {
    await asUser(quien);
    const r = await q('select id from public.conversaciones where id = $1', [cc]);
    check(`Cliente · ${nombre} ${esperado ? 'SÍ' : 'NO'} ve la conversación del cliente de Badajoz`, r.rowCount === esperado);
    await asSuperuser();
  }

  // --- Fase 2 · Miembros de una conversación (chat_miembros) ---
  const miembros = async (conv) =>
    ids(await q('select id from public.chat_miembros($1)', [conv])).filter((id) => fixtures.includes(id));
  await asUser(asesorBdj);
  const mGen = await miembros(general);
  check('Miembros · General devuelve los 3 activos',
    mGen.length === 3 && [resp, asesorBdj, asesorCas].every((id) => mGen.includes(id)));
  check('Miembros · General NO incluye al inactivo', !mGen.includes(inactivo));
  const mBdj = await miembros(canal('Badajoz'));
  check('Miembros · canal Badajoz → responsable + asesor Badajoz',
    mBdj.length === 2 && mBdj.includes(resp) && mBdj.includes(asesorBdj));
  check('Miembros · canal Badajoz NO incluye al asesor de Castuera ni al inactivo',
    !mBdj.includes(asesorCas) && !mBdj.includes(inactivo));
  const mDir = await miembros(d1);
  check('Miembros · directo → exactamente los 2 participantes',
    mDir.length === 2 && mDir.includes(asesorBdj) && mDir.includes(asesorCas));
  const mCli = await miembros(cc);
  check('Miembros · cliente de Badajoz → responsable + asesor Badajoz, no Castuera',
    mCli.length === 2 && mCli.includes(resp) && mCli.includes(asesorBdj) && !mCli.includes(asesorCas));
  const ordenGen = (await q('select id from public.chat_miembros($1)', [general])).rows.map((r) => r.id);
  await asSuperuser();
  const ordenEsperado = ids(await q('select id from public.usuarios where activo order by nombre'));
  check('Miembros · General: todos los activos, ordenados por nombre',
    JSON.stringify(ordenGen) === JSON.stringify(ordenEsperado));
  await asUser(asesorCas);
  const mAjeno = await q('select id from public.chat_miembros($1)', [canal('Badajoz')]);
  check('Miembros · quien no ve la conversación recibe 0 filas', mAjeno.rowCount === 0);
  await asSuperuser();
  await asUser(inactivo);
  const mInac = await q('select id from public.chat_miembros($1)', [general]);
  check('Miembros · un usuario inactivo recibe 0 filas', mInac.rowCount === 0);
  await asSuperuser();

  // --- Fase 2 · Abrir hilo de cliente (chat_abrir_cliente) ---
  await asUser(asesorBdj);
  const ac1 = (await q('select public.chat_abrir_cliente($1) as id', [clienteBdj])).rows[0].id;
  const ac2 = (await q('select public.chat_abrir_cliente($1) as id', [clienteBdj])).rows[0].id;
  check('Abrir cliente · asesor Badajoz obtiene el hilo del cliente', !!ac1 && ac1 === cc);
  check('Abrir cliente · abrirlo dos veces devuelve el mismo id', ac1 === ac2);
  await asSuperuser();
  await asUser(asesorCas);
  check('Abrir cliente · asesor Castuera → 42501 (no autorizado)',
    (await codigoError('select public.chat_abrir_cliente($1)', [clienteBdj])) === '42501');
  await asSuperuser();
  await asUser(resp);
  const ac3 = (await q('select public.chat_abrir_cliente($1) as id', [clienteBdj])).rows[0].id;
  check('Abrir cliente · el responsable obtiene el mismo id', ac3 === ac1);
  await asSuperuser();
  // Cliente sin hilo previo → se crea uno nuevo (una sola vez).
  const clienteBdj2 = randomUUID();
  await q(`insert into public.clientes (id, cif, razon_social, oficina)
           values ($1, 'B99999991', 'Cliente Chat Badajoz 2', 'Badajoz')`, [clienteBdj2]);
  await asUser(asesorBdj);
  const nuevo1 = (await q('select public.chat_abrir_cliente($1) as id', [clienteBdj2])).rows[0].id;
  const nuevo2 = (await q('select public.chat_abrir_cliente($1) as id', [clienteBdj2])).rows[0].id;
  const nuevoVis = await q('select tipo from public.conversaciones where id = $1', [nuevo1]);
  check('Abrir cliente · crea el hilo si no existía y es visible como tipo cliente',
    !!nuevo1 && nuevo1 === nuevo2 && nuevoVis.rows[0]?.tipo === 'cliente');
  await asSuperuser();
  await asUser(inactivo);
  check('Abrir cliente · usuario inactivo → 42501',
    (await codigoError('select public.chat_abrir_cliente($1)', [clienteBdj])) === '42501');
  await asSuperuser();

  // --- Fase 2 · Comentarios de tareas (UC-607) ---
  // Visibilidad vigente de tareas (0002/0003): staff, responsable de la tarea,
  // asesor_id del cliente (si el cliente le es visible) o asignado de alguna subtarea.
  const asesorResp = randomUUID(); // asesor (no staff) responsable de la tarea
  await q(`insert into auth.users (id, instance_id, aud, role, email, created_at, updated_at)
           values ($1, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'chat-arsp@test.lm', now(), now())`,
          [asesorResp]);
  await q(`insert into public.usuarios (id, email, nombre, rol, oficina, activo)
           values ($1, 'chat-arsp@test.lm', 'ZZ Chat Asesor Responsable', 'asesor', 'Don Benito', true)`, [asesorResp]);
  const tarea = randomUUID(), sub = randomUUID();
  await q(`insert into public.tareas (id, titulo, responsable_id) values ($1, 'Tarea chat fase 2', $2)`, [tarea, asesorResp]);
  await q(`insert into public.subtareas (id, tarea_id, titulo, asignado_id) values ($1, $2, 'Subtarea chat', $3)`,
    [sub, tarea, asesorBdj]);
  const cTareaResp = randomUUID(), cSubResp = randomUUID(), cTareaArsp = randomUUID(), cSubBdj = randomUUID();
  await q(`insert into public.comentarios (id, tarea_id, subtarea_id, autor_id, texto) values
           ($1, $5, null, $7, 'Resp en tarea'),
           ($2, null, $6, $7, 'Resp en subtarea'),
           ($3, $5, null, $8, 'Responsable de tarea en tarea'),
           ($4, null, $6, $9, 'Asignado en subtarea')`,
    [cTareaResp, cSubResp, cTareaArsp, cSubBdj, tarea, sub, resp, asesorResp, asesorBdj]);
  const todos = [cTareaResp, cSubResp, cTareaArsp, cSubBdj];
  const comentariosVistos = async (quien) => {
    await asUser(quien);
    const r = ids(await q('select id from public.comentarios where id = any($1::uuid[])', [todos]));
    await asSuperuser();
    return r;
  };
  const vBdj = await comentariosVistos(asesorBdj);
  check('Comentarios · el asignado ve el comentario del responsable en la tarea', vBdj.includes(cTareaResp));
  check('Comentarios · el asignado ve el comentario del responsable en la subtarea', vBdj.includes(cSubResp));
  check('Comentarios · el asignado ve los 4 comentarios de la tarea', vBdj.length === 4);
  const vCas = await comentariosVistos(asesorCas);
  check('Comentarios · un asesor ajeno no ve ninguno', vCas.length === 0);
  const vArsp = await comentariosVistos(asesorResp);
  check('Comentarios · el responsable de la tarea (no staff) ve todos', vArsp.length === 4);
  const vResp = await comentariosVistos(resp);
  check('Comentarios · el staff ve todos', vResp.length === 4);

  // fn_puede_ver_tarea replica exactamente la RLS de SELECT de tareas.
  const tareaCliCas = randomUUID(), tareaCliBdj = randomUUID();
  await q(`update public.clientes set asesor_id = $1 where id = $2`, [asesorBdj, clienteBdj]);
  await q(`update public.clientes set asesor_id = $1 where id = $2`, [asesorCas, clienteBdj2]);
  await q(`insert into public.tareas (id, titulo, cliente_id) values ($1, 'T cliente asesor Bdj', $2), ($3, 'T cliente asesor Cas', $4)`,
    [tareaCliBdj, clienteBdj, tareaCliCas, clienteBdj2]);
  let coherente = true;
  for (const quien of [resp, asesorBdj, asesorCas, asesorResp, inactivo]) {
    await asUser(quien);
    for (const t of [tarea, tareaCliBdj, tareaCliCas]) {
      const rls = (await q('select count(*)::int as n from public.tareas where id = $1', [t])).rows[0].n === 1;
      const fn = (await q('select public.fn_puede_ver_tarea($1) as v', [t])).rows[0].v;
      if (rls !== fn) { coherente = false; console.log(`    · discrepancia usuario=${quien} tarea=${t} rls=${rls} fn=${fn}`); }
    }
    await asSuperuser();
  }
  check('Comentarios · fn_puede_ver_tarea coincide con la RLS de tareas (5 usuarios × 3 tareas)', coherente);
  await asUser(asesorCas);
  const casCli = await q('select public.fn_puede_ver_tarea($1) as v', [tareaCliCas]);
  check('Comentarios · asesor_id de un cliente de OTRA sede no da acceso (igual que la RLS)', casCli.rows[0].v === false);
  await asSuperuser();

  // --- 0022 · Escritura de comentarios: solo quien ve la tarea ---
  const insCom = (tareaId, subId, autor) => codigoError(
    'insert into public.comentarios (tarea_id, subtarea_id, autor_id, texto) values ($1, $2, $3, $4)',
    [tareaId, subId, autor, 'comentario de prueba']);
  await asUser(asesorCas);
  check('Comentarios · un asesor ajeno NO puede comentar en una tarea que no ve (42501)',
    (await insCom(tarea, null, asesorCas)) === '42501');
  check('Comentarios · un asesor ajeno NO puede comentar en una subtarea de una tarea que no ve (42501)',
    (await insCom(null, sub, asesorCas)) === '42501');
  check('Comentarios · asesor_id de un cliente de OTRA sede NO puede comentar en su tarea',
    (await insCom(tareaCliCas, null, asesorCas)) === '42501');
  await asSuperuser();
  await asUser(asesorBdj);
  check('Comentarios · el asignado de una subtarea SÍ puede comentar en la tarea',
    (await insCom(tarea, null, asesorBdj)) === null);
  check('Comentarios · el asignado SÍ puede comentar en su subtarea',
    (await insCom(null, sub, asesorBdj)) === null);
  check('Comentarios · asesor_id de un cliente de su sede SÍ puede comentar en su tarea',
    (await insCom(tareaCliBdj, null, asesorBdj)) === null);
  check('Comentarios · NO se puede comentar firmando como otro usuario',
    (await insCom(tarea, null, resp)) === '42501');
  await asSuperuser();
  await asUser(asesorResp);
  check('Comentarios · el responsable de la tarea (no staff) SÍ puede comentar',
    (await insCom(tarea, null, asesorResp)) === null);
  await asSuperuser();
  await asUser(resp);
  check('Comentarios · el staff SÍ puede comentar en cualquier tarea',
    (await insCom(tareaCliCas, null, resp)) === null);
  await asSuperuser();

  // --- 0022 · tarea_quienes_ven = usuarios activos que pasan la RLS de tareas ---
  const activos = ids(await q('select id from public.usuarios where activo'));
  let quienesOk = true;
  for (const t of [tarea, tareaCliBdj, tareaCliCas]) {
    const esperados = [];
    for (const u of activos) {
      await asUser(u);
      if ((await q('select 1 from public.tareas where id = $1', [t])).rowCount === 1) esperados.push(u);
      await asSuperuser();
    }
    await asUser(resp);
    const devueltos = ids(await q('select id from public.tarea_quienes_ven($1)', [t]));
    await asSuperuser();
    const a = [...esperados].sort(), b = [...devueltos].sort();
    if (JSON.stringify(a) !== JSON.stringify(b)) {
      quienesOk = false;
      console.log(`    · discrepancia tarea=${t} rls=${a.length} fn=${b.length}`);
    }
  }
  check(`tarea_quienes_ven · coincide con la RLS de tareas por usuario (${activos.length} activos × 3 tareas)`, quienesOk);
  await asUser(asesorBdj);
  const qvBdj = ids(await q('select id from public.tarea_quienes_ven($1)', [tarea]));
  check('tarea_quienes_ven · incluye responsable, asignado y staff; excluye al ajeno y al inactivo',
    [asesorResp, asesorBdj, resp].every((id) => qvBdj.includes(id)) &&
    !qvBdj.includes(asesorCas) && !qvBdj.includes(inactivo));
  await asSuperuser();
  await asUser(asesorCas);
  check('tarea_quienes_ven · quien no ve la tarea recibe 0 filas',
    (await q('select id from public.tarea_quienes_ven($1)', [tarea])).rowCount === 0);
  check('fn_usuario_ve_tarea · no se puede llamar desde la API (42501)',
    (await codigoError('select public.fn_usuario_ve_tarea($1, $2)', [asesorBdj, tarea])) === '42501');
  await asSuperuser();
  await asUser(inactivo);
  check('tarea_quienes_ven · un usuario inactivo recibe 0 filas',
    (await q('select id from public.tarea_quienes_ven($1)', [tarea])).rowCount === 0);
  await asSuperuser();
  await asUser(resp);
  check('tarea_quienes_ven · tarea inexistente → 0 filas',
    (await q('select id from public.tarea_quienes_ven($1)', [randomUUID()])).rowCount === 0);
  await asSuperuser();

  const pubCom = await q(`select 1 from pg_publication_tables
                           where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'comentarios'`);
  const hayPub = (await q(`select 1 from pg_publication where pubname = 'supabase_realtime'`)).rowCount === 1;
  check('Realtime · comentarios publicado en supabase_realtime', !hayPub || pubCom.rowCount === 1);

  // --- Fase 2 · Cambio de oficina (UC-609 · AC-26) ---
  await asUser(asesorCas);
  await q('insert into public.mensajes (conversacion_id, autor_id, texto) values ($1,$2,$3)',
    [canal('Castuera'), asesorCas, 'Hola Castuera']);
  await asSuperuser();
  await q(`update public.usuarios set oficina = 'Castuera' where id = $1`, [asesorBdj]);
  await asUser(asesorBdj);
  const trasCambio = ids(await q(`select id from public.conversaciones where tipo = 'oficina'`));
  check('Cambio de oficina · deja de ver el canal de Badajoz', !trasCambio.includes(canal('Badajoz')));
  const msgViejos = await q('select id from public.mensajes where conversacion_id = $1', [canal('Badajoz')]);
  check('Cambio de oficina · deja de ver los mensajes de Badajoz', msgViejos.rowCount === 0);
  check('Cambio de oficina · pasa a ver el canal de Castuera', trasCambio.includes(canal('Castuera')));
  const msgNuevos = await q('select id from public.mensajes where conversacion_id = $1', [canal('Castuera')]);
  check('Cambio de oficina · pasa a ver los mensajes de Castuera', msgNuevos.rowCount >= 1);
  const mCas = (await miembros(canal('Castuera')));
  check('Cambio de oficina · figura como miembro del canal de Castuera', mCas.includes(asesorBdj));
  await asSuperuser();

  // --- Usuario inactivo ---
  await asUser(inactivo);
  const inac = await q('select public.chat_puede_ver($1) as v', [general]);
  check('Inactivo · chat_puede_ver(General) = false', inac.rows[0].v === false);
  const inacConv = await q('select id from public.conversaciones');
  check('Inactivo · no ve ninguna conversación', inacConv.rowCount === 0);
  const inacDir = await q('select * from public.chat_directorio()');
  check('Inactivo · directorio vacío', inacDir.rowCount === 0);
  await asSuperuser();

  // --- Trigger de actividad ---
  const act = await q(`select ultimo_mensaje_at > now() as futuro, ultimo_mensaje_at is not null as tiene
                         from public.conversaciones where id = $1`, [d1]);
  check('Trigger · ultimo_mensaje_at se actualiza con el último mensaje', act.rows[0].tiene && act.rows[0].futuro);
  const actCanal = await q('select ultimo_mensaje_at from public.conversaciones where id = $1', [canal('Badajoz')]);
  check('Trigger · el canal de Badajoz registra actividad', actCanal.rows[0].ultimo_mensaje_at !== null);

  // --- Auditoría ---
  const audit = await q(`select count(*)::int as n from public.auditoria where tabla = 'mensajes' and registro_id = $1`, [mOpt]);
  check('Auditoría · el mensaje queda registrado', audit.rows[0].n === 1);

  // ==========================================================================
  // Fase 3 (0023) · UC-610..UC-613
  // ==========================================================================
  // El asesor de Badajoz vuelve a su sede (la sección de cambio de oficina lo movió).
  await q(`update public.usuarios set oficina = 'Badajoz' where id = $1`, [asesorBdj]);
  const cBdj = canal('Badajoz'), cCas = canal('Castuera');
  const insMsg = (cols, vals) => codigoError(
    `insert into public.mensajes (${cols.join(', ')}) values (${cols.map((_, i) => `$${i + 1}`).join(', ')})`, vals);
  const PDF = 'application/pdf';

  // --- UC-610 · Adjuntos ---
  await asUser(asesorBdj);
  const colsAdj = ['conversacion_id', 'autor_id', 'texto', 'adjunto_path', 'adjunto_nombre', 'adjunto_mime', 'adjunto_size'];
  const pathOk = `${cBdj}/${randomUUID()}/Nomina_enero.pdf`;
  check('Adjuntos · tipo MIME no permitido → rechazado (23514)',
    (await insMsg(colsAdj, [cBdj, asesorBdj, '', `${cBdj}/${randomUUID()}/x.zip`, 'x.zip', 'application/zip', 100])) === '23514');
  check('Adjuntos · más de 20 MB → rechazado (23514)',
    (await insMsg(colsAdj, [cBdj, asesorBdj, '', `${cBdj}/${randomUUID()}/g.pdf`, 'g.pdf', PDF, 20971521])) === '23514');
  check('Adjuntos · ruta fuera de la carpeta de su conversación → rechazado (23514)',
    (await insMsg(colsAdj, [cBdj, asesorBdj, '', `${cCas}/${randomUUID()}/x.pdf`, 'x.pdf', PDF, 100])) === '23514');
  check('Adjuntos · ruta con ".." → rechazado (23514)',
    (await insMsg(colsAdj, [cBdj, asesorBdj, '', `${cBdj}/../${cCas}/x.pdf`, 'x.pdf', PDF, 100])) === '23514');
  check('Adjuntos · adjunto incompleto (sin mime ni tamaño) → rechazado (23514)',
    (await insMsg(['conversacion_id', 'autor_id', 'texto', 'adjunto_path', 'adjunto_nombre'],
      [cBdj, asesorBdj, '', pathOk, 'Nomina_enero.pdf'])) === '23514');
  const mAdj = randomUUID();
  check('Adjuntos · texto vacío + adjunto válido (20 MB justos) → permitido',
    (await insMsg(['id', ...colsAdj], [mAdj, cBdj, asesorBdj, '', pathOk, 'Nomina enero.pdf', PDF, 20971520])) === null);
  check('Adjuntos · texto vacío (solo espacios) sin adjunto → rechazado (23514)',
    (await insMsg(['conversacion_id', 'autor_id', 'texto'], [cBdj, asesorBdj, '   '])) === '23514');
  check('Adjuntos · Excel y Word también se admiten',
    (await insMsg(colsAdj, [cBdj, asesorBdj, 'hoja', `${cBdj}/${randomUUID()}/a.xlsx`, 'a.xlsx',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 10])) === null &&
    (await insMsg(colsAdj, [cBdj, asesorBdj, 'doc', `${cBdj}/${randomUUID()}/a.doc`, 'a.doc', 'application/msword', 10])) === null);
  // 0024 · integridad de los adjuntos
  check('Adjuntos · reutilizar la ruta de otro mensaje → rechazado (23505)',
    (await insMsg(colsAdj, [cBdj, asesorBdj, 'copia', pathOk, 'Copia.pdf', PDF, 100])) === '23505');
  check('Adjuntos · nombre con extensión no admitida ("x.exe") → rechazado (23514)',
    (await insMsg(colsAdj, [cBdj, asesorBdj, '', `${cBdj}/${randomUUID()}/x.pdf`, 'x.exe', PDF, 100])) === '23514');
  check('Adjuntos · nombre sin extensión → rechazado (23514)',
    (await insMsg(colsAdj, [cBdj, asesorBdj, '', `${cBdj}/${randomUUID()}/factura`, 'factura', PDF, 100])) === '23514');
  check('Adjuntos · extensión en mayúsculas ("SCAN.JPG") → permitido',
    (await insMsg(colsAdj, [cBdj, asesorBdj, '', `${cBdj}/${randomUUID()}/SCAN.JPG`, 'SCAN.JPG', 'image/jpeg', 100])) === null);
  await asSuperuser();
  const bucket = (await q(`select public, file_size_limit, allowed_mime_types from storage.buckets where id = 'chat'`)).rows[0];
  check('Adjuntos · bucket "chat" existe, privado, 20 MB y 9 tipos MIME',
    !!bucket && bucket.public === false && Number(bucket.file_size_limit) === 20971520 &&
    bucket.allowed_mime_types?.length === 9 && bucket.allowed_mime_types.includes(PDF));
  const polObj = await q(`select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects'
                           and (qual ilike '%''chat''%' or with_check ilike '%''chat''%')`);
  check('Adjuntos · sin políticas de storage.objects para el bucket "chat" (solo servidor)', polObj.rowCount === 0);

  // --- UC-611 · Búsqueda ---
  // Como owner (sin auth.uid()) para fijar created_at y probar el orden.
  const [mA, mB, mC, mDel] = [randomUUID(), randomUUID(), randomUUID(), randomUUID()];
  await q(`insert into public.mensajes (id, conversacion_id, autor_id, texto, created_at) values
           ($1, $5, $6, 'Revisar la facturación de marzo', now() - interval '3 minutes'),
           ($2, $5, $6, 'Otra FACTURACIÓN pendiente',      now() - interval '1 minute'),
           ($3, $7, $8, 'Facturación de Castuera',         now() - interval '2 minutes'),
           ($4, $5, $6, 'Facturación que se borrará',      now() - interval '30 seconds')`,
    [mA, mB, mC, mDel, cBdj, asesorBdj, cCas, asesorCas]);
  await q('update public.mensajes set borrado = true where id = $1', [mDel]);
  const buscar = async (quien, texto, limite) => {
    await asUser(quien);
    const r = limite === undefined
      ? await q('select * from public.chat_buscar($1)', [texto])
      : await q('select * from public.chat_buscar($1, $2)', [texto, limite]);
    await asSuperuser();
    return r.rows;
  };
  const rBdj = (await buscar(asesorBdj, 'facturacion')).map((r) => r.id);
  check('Búsqueda · "facturacion" encuentra "facturación"/"FACTURACIÓN" (sin tildes ni mayúsculas)',
    rBdj.includes(mA) && rBdj.includes(mB));
  check('Búsqueda · más recientes primero', rBdj.indexOf(mB) >= 0 && rBdj.indexOf(mB) < rBdj.indexOf(mA));
  check('Búsqueda · un mensaje borrado no aparece', !rBdj.includes(mDel));
  check('Búsqueda · asesor Badajoz NO obtiene resultados del canal de Castuera', !rBdj.includes(mC));
  const rCas = (await buscar(asesorCas, 'facturación')).map((r) => r.id);
  check('Búsqueda · asesor Castuera NO obtiene resultados del canal de Badajoz',
    rCas.includes(mC) && !rCas.includes(mA) && !rCas.includes(mB));
  const rResp = (await buscar(resp, 'Facturacion')).map((r) => r.id);
  check('Búsqueda · el responsable encuentra en todas las oficinas', [mA, mB, mC].every((id) => rResp.includes(id)));
  const rAdj = await buscar(asesorBdj, 'nomina');
  check('Búsqueda · encuentra por el nombre del adjunto y devuelve adjunto_nombre',
    rAdj.some((r) => r.id === mAdj && r.adjunto_nombre === 'Nomina enero.pdf'));
  const cols = Object.keys((await buscar(asesorBdj, 'facturacion'))[0] ?? {}).sort().join(',');
  check('Búsqueda · columnas del contrato (id, conversacion_id, autor_id, texto, created_at, adjunto_nombre)',
    cols === 'adjunto_nombre,autor_id,conversacion_id,created_at,id,texto');
  check('Búsqueda · consulta en blanco o de 1 carácter → 0 filas',
    (await buscar(asesorBdj, '   ')).length === 0 && (await buscar(asesorBdj, 'f')).length === 0 &&
    (await buscar(asesorBdj, null)).length === 0);
  check('Búsqueda · respeta el límite', (await buscar(asesorBdj, 'facturacion', 1)).length === 1);
  check('Búsqueda · usuario inactivo → 0 filas', (await buscar(inactivo, 'facturacion')).length === 0);
  const idxBus = await q(`select 1 from pg_indexes where schemaname = 'public' and tablename = 'mensajes' and indexname = 'idx_mensajes_busqueda'`);
  check('Búsqueda · índice GIN sobre mensajes.busqueda', idxBus.rowCount === 1);
  await asUser(asesorBdj);
  check('Búsqueda · anon no puede ejecutar chat_buscar',
    (await q(`select has_function_privilege('anon', 'public.chat_buscar(text,int)', 'execute') as v`)).rows[0].v === false);
  await asSuperuser();

  // --- UC-612 · Editar / borrar ---
  const mE = randomUUID(), mG = randomUUID();
  await asUser(asesorBdj);
  await q(`insert into public.mensajes (id, conversacion_id, autor_id, texto, menciones) values ($1,$2,$3,'Texto original', $4::uuid[])`,
    [mE, cBdj, asesorBdj, [resp]]);
  await q(`insert into public.mensajes (id, conversacion_id, autor_id, texto, menciones) values ($1,$2,$3,'Mensaje en General', $4::uuid[])`,
    [mG, general, asesorBdj, [asesorCas]]);
  const upd = await q(`update public.mensajes set texto = 'Texto editado' where id = $1 returning texto, editado_at`, [mE]);
  check('Editar · el autor edita su mensaje: texto actualizado y editado_at marcado',
    upd.rowCount === 1 && upd.rows[0].texto === 'Texto editado' && upd.rows[0].editado_at !== null);
  const antes = upd.rows[0].editado_at;
  const upd2 = await q(`update public.mensajes set editado_at = '2000-01-01' where id = $1 returning editado_at`, [mE]);
  check('Editar · editado_at no lo fija el cliente', upd2.rows[0].editado_at.getTime() === antes.getTime());
  check('Editar · no se puede dejar sin texto un mensaje sin adjunto (23514)',
    (await codigoError(`update public.mensajes set texto = '  ' where id = $1`, [mE])) === '23514');
  check('Editar · no se puede cambiar de conversación (42501)',
    (await codigoError('update public.mensajes set conversacion_id = $2 where id = $1', [mE, general])) === '42501');
  check('Editar · no se pueden cambiar las menciones (42501)',
    (await codigoError(`update public.mensajes set menciones = '{}' where id = $1`, [mE])) === '42501');
  check('Editar · no se puede cambiar la fecha (42501)',
    (await codigoError(`update public.mensajes set created_at = now() - interval '1 day' where id = $1`, [mE])) === '42501');
  check('Editar · no se puede cambiar el adjunto (42501)',
    (await codigoError(`update public.mensajes set adjunto_nombre = 'otro.pdf' where id = $1`, [mAdj])) === '42501');
  const rEd = ids(await q('select id from public.chat_buscar($1)', ['editado']));
  check('Editar · la búsqueda refleja el texto editado', rEd.includes(mE) &&
    !ids(await q('select id from public.chat_buscar($1)', ['original'])).includes(mE));
  await asSuperuser();

  await asUser(asesorCas);  // ve General, no es autor ni staff
  const ajeno = await q(`update public.mensajes set texto = 'hackeado' where id = $1`, [mG]);
  check('Editar · un compañero (no autor, no staff) NO puede editar → 0 filas', ajeno.rowCount === 0);
  const ajenoBorra = await q(`update public.mensajes set borrado = true where id = $1`, [mG]);
  check('Borrar · un compañero (no autor, no staff) NO puede borrar → 0 filas', ajenoBorra.rowCount === 0);
  const noVe = await q(`update public.mensajes set borrado = true where id = $1`, [mE]);
  check('Borrar · quien no ve la conversación NO puede borrar → 0 filas', noVe.rowCount === 0);
  await asSuperuser();

  await asUser(resp);
  check('Editar · el staff NO puede editar el texto de otro (42501)',
    (await codigoError(`update public.mensajes set texto = 'moderado' where id = $1`, [mG])) === '42501');
  check('Editar · el staff NO puede reasignar el autor (42501)',
    (await codigoError('update public.mensajes set autor_id = $2 where id = $1', [mG, resp])) === '42501');
  const mod = await q(`update public.mensajes set borrado = true where id = $1
                       returning texto, menciones, borrado, editado_at`, [mG]);
  check('Borrar · el staff SÍ puede borrar un mensaje ajeno: texto y menciones vaciados, editado_at intacto',
    mod.rowCount === 1 && mod.rows[0].borrado && mod.rows[0].texto === '' &&
    mod.rows[0].menciones.length === 0 && mod.rows[0].editado_at === null);
  await asSuperuser();

  await asUser(asesorBdj);
  const delAdj = await q(`update public.mensajes set borrado = true where id = $1
                          returning texto, adjunto_path, adjunto_nombre, adjunto_mime, adjunto_size`, [mAdj]);
  const d = delAdj.rows[0];
  check('Borrar · el autor borra su mensaje con adjunto: texto y adjunto_* vaciados',
    delAdj.rowCount === 1 && d.texto === '' && d.adjunto_path === null && d.adjunto_nombre === null &&
    d.adjunto_mime === null && d.adjunto_size === null);
  check('Borrar · no se puede des-borrar (42501)',
    (await codigoError('update public.mensajes set borrado = false where id = $1', [mAdj])) === '42501');
  check('Borrar · un mensaje borrado no se puede editar (42501)',
    (await codigoError(`update public.mensajes set texto = 'resucitado' where id = $1`, [mAdj])) === '42501');
  check('Borrar · el adjunto borrado ya no aparece en la búsqueda',
    !ids(await q('select id from public.chat_buscar($1)', ['nomina'])).includes(mAdj));
  await asSuperuser();

  const audE = await q(`select diff from public.auditoria
                         where tabla = 'mensajes' and registro_id = $1 and operacion = 'UPDATE'
                         order by id`, [mE]);
  check('Auditoría · la edición queda registrada con el texto anterior y el nuevo',
    audE.rows.some((r) => r.diff?.old?.texto === 'Texto original' && r.diff?.new?.texto === 'Texto editado'));
  const audG = await q(`select usuario_id, diff from public.auditoria
                         where tabla = 'mensajes' and registro_id = $1 and operacion = 'UPDATE'`, [mG]);
  check('Auditoría · el borrado queda registrado con el texto anterior y quién lo hizo',
    audG.rows.some((r) => r.usuario_id === resp && r.diff?.old?.texto === 'Mensaje en General' && r.diff?.new?.borrado === true));

  // ON DELETE SET NULL de usuarios sigue funcionando pese al trigger de inmutabilidad.
  const efimero = randomUUID(), mEf = randomUUID();
  await q(`insert into auth.users (id, instance_id, aud, role, email, created_at, updated_at)
           values ($1, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'chat-efim@test.lm', now(), now())`, [efimero]);
  await q(`insert into public.usuarios (id, email, nombre, rol, oficina, activo) values ($1,'chat-efim@test.lm','ZZ Chat Efímero','asesor','Badajoz', true)`, [efimero]);
  await q(`insert into public.mensajes (id, conversacion_id, autor_id, texto) values ($1,$2,$3,'adiós')`, [mEf, general, efimero]);
  const errBaja = await codigoError('delete from public.usuarios where id = $1', [efimero]);
  const trasBaja = await q('select autor_id from public.mensajes where id = $1', [mEf]);
  check('Editar · borrar un usuario deja sus mensajes con autor_id null (FK SET NULL permitido)',
    errBaja === null && trasBaja.rows[0]?.autor_id === null);

  const pubUpd = await q(`select pubupdate from pg_publication where pubname = 'supabase_realtime'`);
  check('Realtime · la publicación emite UPDATE (ediciones y borrados en vivo)',
    pubUpd.rowCount === 0 || pubUpd.rows[0].pubupdate === true);

  // --- UC-613 · Canales privados de Realtime (presencia / escribiendo) ---
  const canalOk = async (quien, topic) => {
    await asUser(quien);
    const v = (await q('select public.chat_puede_usar_canal($1) as v', [topic])).rows[0].v;
    await asSuperuser();
    return v;
  };
  check('Realtime · miembro puede usar chat:<su canal>', (await canalOk(asesorBdj, `chat:${cBdj}`)) === true);
  check('Realtime · miembro puede usar chat:<directo propio>', (await canalOk(asesorCas, `chat:${d1}`)) === true);
  check('Realtime · NO miembro NO puede usar chat:<canal ajeno>', (await canalOk(asesorCas, `chat:${cBdj}`)) === false);
  check('Realtime · staff NO puede usar chat:<directo ajeno>', (await canalOk(resp, `chat:${d1}`)) === false);
  check('Realtime · topic mal formado → false (sin error)',
    (await canalOk(asesorBdj, 'chat:no-es-un-uuid')) === false &&
    (await canalOk(asesorBdj, `chat:${cBdj}' or 1=1`)) === false &&
    (await canalOk(asesorBdj, 'chat:')) === false);
  check('Realtime · topic desconocido o nulo → false',
    (await canalOk(asesorBdj, 'otro')) === false && (await canalOk(asesorBdj, null)) === false);
  check('Realtime · conversación inexistente → false', (await canalOk(asesorBdj, `chat:${randomUUID()}`)) === false);
  check('Realtime · presencia: usuario activo → true', (await canalOk(asesorCas, 'presencia')) === true);
  check('Realtime · presencia y chat: usuario inactivo → false',
    (await canalOk(inactivo, 'presencia')) === false && (await canalOk(inactivo, `chat:${general}`)) === false);

  const polRt = await q(`select policyname, cmd from pg_policies
                          where schemaname = 'realtime' and tablename = 'messages'
                            and policyname in ('chat_realtime_select', 'chat_realtime_insert')`);
  check('Realtime · políticas select/insert creadas en realtime.messages', polRt.rowCount === 2);
  // Política real: insertar/leer en realtime.messages con realtime.topic() fijado.
  const rtIns = async (quien, topic, extension = 'broadcast') => {
    await asUser(quien);
    await q(`select set_config('realtime.topic', $1, true)`, [topic]);
    const err = await codigoError(
      `insert into realtime.messages (topic, extension, event, payload, private)
       values ($1, $2, 'escribiendo', '{}'::jsonb, true)`, [topic, extension]);
    const vistos = err === null
      ? (await q(`select count(*)::int as n from realtime.messages where topic = $1`, [topic])).rows[0].n : 0;
    await q(`select set_config('realtime.topic', '', true)`);
    await asSuperuser();
    return { err, vistos };
  };
  const rtMiembro = await rtIns(asesorBdj, `chat:${cBdj}`);
  check('Realtime · miembro puede emitir y leer broadcast en chat:<su canal>',
    rtMiembro.err === null && rtMiembro.vistos >= 1);
  const rtAjeno = await rtIns(asesorCas, `chat:${cBdj}`);
  check('Realtime · NO miembro NO puede emitir en chat:<canal ajeno> (42501)', rtAjeno.err === '42501');
  const rtPres = await rtIns(asesorCas, 'presencia', 'presence');
  check('Realtime · usuario activo puede usar presencia', rtPres.err === null);
  const rtInac = await rtIns(inactivo, 'presencia', 'presence');
  check('Realtime · usuario inactivo NO puede usar presencia (42501)', rtInac.err === '42501');
  await asUser(asesorCas);
  await q(`select set_config('realtime.topic', $1, true)`, [`chat:${cBdj}`]);
  const leeAjeno = (await q(`select count(*)::int as n from realtime.messages where topic = $1`, [`chat:${cBdj}`])).rows[0].n;
  await q(`select set_config('realtime.topic', '', true)`);
  await asSuperuser();
  check('Realtime · NO miembro NO lee los broadcast de chat:<canal ajeno>', leeAjeno === 0);

  await q('rollback');  // nada de esto persiste
  console.log(`\n${fail === 0 ? '✓' : '✗'} Chat interno: ${pass} ok, ${fail} fallidos`);
  process.exitCode = fail === 0 ? 0 : 1;
} catch (err) {
  try { await q('rollback'); } catch { /* noop */ }
  console.error('\n✗ Error ejecutando el test:', err.message);
  process.exitCode = 1;
} finally {
  await client.end();
}
