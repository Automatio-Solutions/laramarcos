// Test de aislamiento RLS (UC-501 · AC-02 / AC-03).
// Crea fixtures (responsable + 2 asesores + 1 cliente por asesor) dentro de una
// transacción que SIEMPRE se revierte, y verifica la visibilidad/escritura por rol
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

// Asume la identidad de un usuario autenticado para la siguiente query
async function asUser(id) {
  await q('set local role authenticated');
  await q(`set local request.jwt.claims = '${JSON.stringify({ sub: id, role: 'authenticated' })}'`);
}
async function asSuperuser() {
  await q('reset role');
  await q(`set local request.jwt.claims = ''`);
}

const resp = randomUUID();
const asesor1 = randomUUID();
const asesor2 = randomUUID();
const c1 = randomUUID();
const c2 = randomUUID();

try {
  await client.connect();
  await q('begin');

  // --- Fixtures (como superusuario / owner, RLS no aplica) ---
  for (const [id, email] of [[resp, 'resp@test.lm'], [asesor1, 'a1@test.lm'], [asesor2, 'a2@test.lm']]) {
    await q(
      `insert into auth.users (id, instance_id, aud, role, email, created_at, updated_at)
       values ($1, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', $2, now(), now())`,
      [id, email],
    );
  }
  await q(`insert into public.usuarios (id, email, nombre, rol) values
           ($1,'resp@test.lm','Resp','responsable'),
           ($2,'a1@test.lm','Asesor 1','asesor'),
           ($3,'a2@test.lm','Asesor 2','asesor')`, [resp, asesor1, asesor2]);
  await q(`insert into public.clientes (id, cif, razon_social, asesor_id) values
           ($1,'B11111111','Cliente A1', $3),
           ($2,'B22222222','Cliente A2', $4)`, [c1, c2, asesor1, asesor2]);

  // --- AC-02: asesor1 solo ve su cliente ---
  await asUser(asesor1);
  const a1All = await q('select id from public.clientes');
  check('AC-02 · asesor1 ve exactamente 1 cliente (el suyo)', a1All.rowCount === 1 && a1All.rows[0].id === c1);
  const a1Other = await q('select id from public.clientes where id = $1', [c2]);
  check('AC-02 · asesor1 NO ve el cliente de asesor2', a1Other.rowCount === 0);
  const a1Upd = await q('update public.clientes set razon_social = $1 where id = $2', ['hack', c2]);
  check('AC-02 · asesor1 NO puede modificar cliente ajeno (0 filas)', a1Upd.rowCount === 0);
  const a1UpdOwn = await q('update public.clientes set razon_social = $1 where id = $2', ['propio-ok', c1]);
  check('AC-02 · asesor1 SÍ puede modificar su cliente (1 fila)', a1UpdOwn.rowCount === 1);
  await asSuperuser();

  // --- asesor2 solo ve el suyo ---
  await asUser(asesor2);
  const a2All = await q('select id from public.clientes');
  check('AC-02 · asesor2 ve exactamente 1 cliente (el suyo)', a2All.rowCount === 1 && a2All.rows[0].id === c2);
  await asSuperuser();

  // --- AC-03: responsable ve toda la cartera ---
  await asUser(resp);
  const respAll = await q('select id from public.clientes where id in ($1,$2)', [c1, c2]);
  check('AC-03 · responsable ve ambos clientes', respAll.rowCount === 2);
  const respUpd = await q('update public.clientes set razon_social = $1 where id = $2', ['resp-ok', c2]);
  check('AC-03 · responsable puede modificar cualquier cliente', respUpd.rowCount === 1);
  await asSuperuser();

  // --- Auditoría: las mutaciones quedaron registradas ---
  const audit = await q(`select count(*)::int as n from public.auditoria where tabla = 'clientes'`);
  check('Auditoría · hay registros de mutaciones sobre clientes', audit.rows[0].n > 0);

  await q('rollback');  // nada de esto persiste
  console.log(`\n${fail === 0 ? '✓' : '✗'} RLS isolation: ${pass} ok, ${fail} fallidos`);
  process.exitCode = fail === 0 ? 0 : 1;
} catch (err) {
  try { await q('rollback'); } catch { /* noop */ }
  console.error('\n✗ Error ejecutando el test:', err.message);
  process.exitCode = 1;
} finally {
  await client.end();
}
