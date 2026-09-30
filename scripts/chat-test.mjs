// Test del chat interno (US-06 · UC-601..UC-604) — migración 0020.
// Verifica visibilidad por tipo de conversación (general / oficina / directo /
// cliente), directorio de compañeros, apertura idempotente de directos, RLS de
// escritura de mensajes, contador de no leídos y trigger de actividad.
//
// Todo ocurre en UNA transacción que SIEMPRE se revierte. Si la migración 0020
// aún no está aplicada, se ejecuta dentro de esa misma transacción (y también se
// revierte), así se puede validar antes de aplicarla.
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
const MIGRACION = join(__dirname, '..', 'supabase', 'migrations', '0020_chat.sql');

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

  const existe = await q(`select to_regclass('public.mensajes') as t`);
  if (!existe.rows[0].t) {
    console.log('  · 0020 no aplicada: se ejecuta dentro de la transacción (se revertirá)');
    await q(readFileSync(MIGRACION, 'utf8'));
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
