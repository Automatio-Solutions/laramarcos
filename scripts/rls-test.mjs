// Test de aislamiento RLS (UC-501 · AC-02 / AC-03) — MODELO POR OFICINA.
// Desde la migración 0013 la visibilidad de clientes es por SEDE, no por asesor_id:
// un asesor ve y edita TODA la cartera de su oficina (para cubrirse entre compañeros);
// responsable/admin ven las cuatro sedes.
//
// Crea fixtures (responsable + 2 asesores en oficinas distintas + 3 clientes) dentro
// de una transacción que SIEMPRE se revierte, y verifica visibilidad/escritura por rol
// asumiendo la identidad de cada usuario (set role authenticated + jwt claims).
//
// Uso: npm run db:rls-test   (requiere SUPABASE_DB_URL en .env.local)
import { config } from 'dotenv';
config({ path: '.env.local' });
config(); // fallback a .env
import { randomUUID } from 'node:crypto';
import pg from 'pg';

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

const resp = randomUUID();
const asesorBdj = randomUUID();   // asesor de Badajoz
const asesorCas = randomUUID();   // asesor de Castuera
const cA = randomUUID();          // cliente Badajoz (de asesorBdj)
const cB = randomUUID();          // cliente Castuera (de asesorCas)
const cC = randomUUID();          // cliente Badajoz SIN asesor (para probar visibilidad intra-oficina)

try {
  await client.connect();
  await q('begin');

  // --- Fixtures (como owner, RLS no aplica) ---
  for (const [id, email] of [[resp, 'resp@test.lm'], [asesorBdj, 'abdj@test.lm'], [asesorCas, 'acas@test.lm']]) {
    await q(
      `insert into auth.users (id, instance_id, aud, role, email, created_at, updated_at)
       values ($1, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', $2, now(), now())`,
      [id, email],
    );
  }
  await q(`insert into public.usuarios (id, email, nombre, rol, oficina) values
           ($1,'resp@test.lm','Resp','responsable','Badajoz'),
           ($2,'abdj@test.lm','Asesor Badajoz','asesor','Badajoz'),
           ($3,'acas@test.lm','Asesor Castuera','asesor','Castuera')`, [resp, asesorBdj, asesorCas]);
  await q(`insert into public.clientes (id, cif, razon_social, asesor_id, oficina) values
           ($1,'B11111111','Cliente Badajoz A', $4, 'Badajoz'),
           ($2,'B22222222','Cliente Castuera', $5, 'Castuera'),
           ($3,'B33333333','Cliente Badajoz sin asesor', null, 'Badajoz')`,
          [cA, cB, cC, asesorBdj, asesorCas]);

  // --- AC-02: el asesor de Badajoz ve TODA la cartera de Badajoz (cA + cC), no la de Castuera ---
  await asUser(asesorBdj);
  const bdjAll = await q('select id from public.clientes where id in ($1,$2,$3)', [cA, cB, cC]);
  check('AC-02 · asesor Badajoz ve los 2 clientes de su oficina', bdjAll.rowCount === 2);
  const bdjSeesC = await q('select id from public.clientes where id = $1', [cC]);
  check('AC-02 · ve un cliente de su oficina aunque no sea "suyo" (intra-oficina)', bdjSeesC.rowCount === 1);
  const bdjNotCas = await q('select id from public.clientes where id = $1', [cB]);
  check('AC-02 · NO ve el cliente de otra oficina (Castuera)', bdjNotCas.rowCount === 0);
  const updAjeno = await q('update public.clientes set razon_social = $1 where id = $2', ['hack', cB]);
  check('AC-02 · NO puede modificar cliente de otra oficina (0 filas)', updAjeno.rowCount === 0);
  const updPropio = await q('update public.clientes set razon_social = $1 where id = $2', ['ok', cC]);
  check('AC-02 · SÍ puede editar un cliente de su oficina (1 fila)', updPropio.rowCount === 1);
  await asSuperuser();

  // --- El asesor de Castuera solo ve el suyo ---
  await asUser(asesorCas);
  const casAll = await q('select id from public.clientes where id in ($1,$2,$3)', [cA, cB, cC]);
  check('AC-02 · asesor Castuera ve solo el cliente de Castuera', casAll.rowCount === 1 && casAll.rows[0].id === cB);
  await asSuperuser();

  // --- AC-03: responsable ve las tres (dos oficinas) ---
  await asUser(resp);
  const respAll = await q('select id from public.clientes where id in ($1,$2,$3)', [cA, cB, cC]);
  check('AC-03 · responsable ve toda la cartera (las 2 oficinas)', respAll.rowCount === 3);
  const respUpd = await q('update public.clientes set razon_social = $1 where id = $2', ['resp-ok', cB]);
  check('AC-03 · responsable puede modificar cualquier cliente', respUpd.rowCount === 1);
  await asSuperuser();

  // --- Auditoría: las mutaciones quedaron registradas ---
  const audit = await q(`select count(*)::int as n from public.auditoria where tabla = 'clientes'`);
  check('Auditoría · hay registros de mutaciones sobre clientes', audit.rows[0].n > 0);

  await q('rollback');  // nada de esto persiste
  console.log(`\n${fail === 0 ? '✓' : '✗'} RLS isolation (por oficina): ${pass} ok, ${fail} fallidos`);
  process.exitCode = fail === 0 ? 0 : 1;
} catch (err) {
  try { await q('rollback'); } catch { /* noop */ }
  console.error('\n✗ Error ejecutando el test:', err.message);
  process.exitCode = 1;
} finally {
  await client.end();
}
