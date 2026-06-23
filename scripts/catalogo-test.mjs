// Test de integración del catálogo (UC-503/504/505).
// AC-09 CRUD servicios · AC-10 cambio de tarifa auditado · proveedores duplicado · sectores.
import { config } from "dotenv";
config({ path: ".env.local" });
import pg from "pg";

const url = process.env.SUPABASE_DB_URL;
if (!url) { console.error("✗ Falta SUPABASE_DB_URL"); process.exit(1); }
const client = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
const q = (s, p) => client.query(s, p);
let pass = 0, fail = 0;
const check = (n, c) => (c ? (pass++, console.log(`  ✓ ${n}`)) : (fail++, console.log(`  ✗ ${n}`)));
const cif = "B" + Math.floor(10000000 + Math.random() * 89999999);

try {
  await client.connect();
  await q("begin");

  // AC-09: alta servicio
  const s = await q(`insert into public.servicios (nombre, categoria, precio_base, condiciones_default)
                     values ('Constitución SL','Mercantil',350,'50% anticipo') returning id, precio_base`);
  const servicioId = s.rows[0].id;
  check("AC-09 · alta de servicio con precio y categoría", Number(s.rows[0].precio_base) === 350);

  // AC-10: cambio de tarifa → auditado con timestamp + nuevo valor
  await q(`update public.servicios set precio_base = 420 where id = $1`, [servicioId]);
  const cur = await q(`select precio_base from public.servicios where id=$1`, [servicioId]);
  check("AC-10 · catálogo devuelve la tarifa más reciente (420)", Number(cur.rows[0].precio_base) === 420);
  const aud = await q(
    `select diff, ts from public.auditoria where tabla='servicios' and operacion='UPDATE'
     and (diff->'new'->>'id') = $1 order by ts desc limit 1`, [servicioId]);
  check("AC-10 · cambio de tarifa registrado en auditoría con timestamp",
    aud.rowCount === 1 && Number(aud.rows[0].diff.new.precio_base) === 420 && Boolean(aud.rows[0].ts));

  // Helper: ejecuta un insert que se espera que falle, sin abortar la transacción.
  async function expectFail(sql, params) {
    await q("savepoint sp");
    try { await q(sql, params); await q("release savepoint sp"); return null; }
    catch (e) { await q("rollback to savepoint sp"); return e.code; }
  }

  // UC-504: proveedor + duplicado
  await q(`insert into public.proveedores (cif, nombre, subcuenta_habitual, iva_default)
           values ($1,'Proveedor Test','600',21)`, [cif]);
  const dup = await expectFail(`insert into public.proveedores (cif, nombre) values ($1,'Dup')`, [cif]);
  check("UC-504 · proveedor duplicado por CIF rechazado (23505)", dup === "23505");

  // UC-505: sector + unicidad
  const secName = "Sector-" + cif;
  await q(`insert into public.sectores (nombre) values ($1)`, [secName]);
  const dupSec = await expectFail(`insert into public.sectores (nombre) values ($1)`, [secName]);
  check("UC-505 · sector con nombre único", dupSec === "23505");

  await q("rollback");
  console.log(`\n${fail === 0 ? "✓" : "✗"} catálogo: ${pass} ok, ${fail} fallidos`);
  process.exitCode = fail === 0 ? 0 : 1;
} catch (err) {
  try { await q("rollback"); } catch {}
  console.error("\n✗ Error:", err.message);
  process.exitCode = 1;
} finally {
  await client.end();
}
