// Test de integración de la capa de datos de clientes (UC-502 · AC-05 / AC-08).
// Verifica contra la BBDD real: alta con datos fiscales + sectores, y rechazo de CIF duplicado.
// Transacción siempre revertida.
import { config } from "dotenv";
config({ path: ".env.local" });
import { randomUUID } from "node:crypto";
import pg from "pg";

const url = process.env.SUPABASE_DB_URL;
if (!url) { console.error("✗ Falta SUPABASE_DB_URL"); process.exit(1); }

const client = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
const q = (s, p) => client.query(s, p);
let pass = 0, fail = 0;
const check = (n, c) => (c ? (pass++, console.log(`  ✓ ${n}`)) : (fail++, console.log(`  ✗ ${n}`)));

const asesor = randomUUID();
const sectorId = randomUUID();
const cif = "B" + Math.floor(10000000 + Math.random() * 89999999); // CIF-like único

try {
  await client.connect();
  await q("begin");

  await q(`insert into auth.users (id, instance_id, aud, role, email, created_at, updated_at)
           values ($1,'00000000-0000-0000-0000-000000000000','authenticated','authenticated','a@test.lm',now(),now())`, [asesor]);
  await q(`insert into public.usuarios (id,email,nombre,rol) values ($1,'a@test.lm','Asesor',$2)`, [asesor, "asesor"]);
  await q(`insert into public.sectores (id,nombre) values ($1,$2)`, [sectorId, "Test-" + cif]);

  // AC-05: alta con datos fiscales + asesor + sector
  const ins = await q(
    `insert into public.clientes (cif, razon_social, direccion, email, iban, condiciones_pago, asesor_id)
     values ($1,'Cliente Test','C/ Mayor 1','c@test.lm','ES9121000418450200051332','30 días', $2) returning id`,
    [cif, asesor],
  );
  const clienteId = ins.rows[0].id;
  await q(`insert into public.cliente_sectores (cliente_id, sector_id) values ($1,$2)`, [clienteId, sectorId]);

  const row = await q(`select cif, razon_social, iban, asesor_id from public.clientes where id=$1`, [clienteId]);
  check("AC-05 · alta persiste datos fiscales + asesor", row.rowCount === 1 && row.rows[0].cif === cif && row.rows[0].asesor_id === asesor);
  const rel = await q(`select 1 from public.cliente_sectores where cliente_id=$1 and sector_id=$2`, [clienteId, sectorId]);
  check("AC-05 · asociación de sector (N:M)", rel.rowCount === 1);

  // AC-08: CIF duplicado → unique violation (23505)
  let dupCode = null;
  try {
    await q(`insert into public.clientes (cif, razon_social, asesor_id) values ($1,'Duplicado',$2)`, [cif, asesor]);
  } catch (e) { dupCode = e.code; }
  check("AC-08 · CIF duplicado rechazado (23505)", dupCode === "23505");

  await q("rollback");
  console.log(`\n${fail === 0 ? "✓" : "✗"} clientes data: ${pass} ok, ${fail} fallidos`);
  process.exitCode = fail === 0 ? 0 : 1;
} catch (err) {
  try { await q("rollback"); } catch {}
  console.error("\n✗ Error:", err.message);
  process.exitCode = 1;
} finally {
  await client.end();
}
