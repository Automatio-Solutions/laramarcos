// Test de integración M4 (UC-403/404/405): subcuenta por proveedor + aprendizaje + factura_ocr.
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

const u = randomUUID(), prov = randomUUID(), fac = randomUUID();
const cif = "A" + Math.floor(10000000 + Math.random() * 89999999);

try {
  await client.connect();
  await q("begin");
  await q(`insert into auth.users (id,instance_id,aud,role,email,created_at,updated_at) values ($1,'00000000-0000-0000-0000-000000000000','authenticated','authenticated','u@t.lm',now(),now())`, [u]);
  await q(`insert into public.usuarios (id,email,nombre,rol) values ($1,'u@t.lm','U','responsable')`, [u]);
  await q(`insert into public.proveedores (id,cif,nombre,subcuenta_habitual,iva_default) values ($1,$2,'Endesa','628',21)`, [prov, cif]);

  // UC-403: dado el CIF del proveedor, recuperar su subcuenta/IVA por histórico
  const look = await q(`select subcuenta_habitual, iva_default from public.proveedores where cif=$1`, [cif]);
  check("UC-403 · subcuenta e IVA recuperados por CIF de proveedor", look.rows[0].subcuenta_habitual === "628" && Number(look.rows[0].iva_default) === 21);

  // factura procesada (sin Claude: confianza 0 → rojo), con subcuenta aplicada del proveedor
  await q(`insert into public.facturas_ocr (id,proveedor_cif,proveedor_nombre,base_imponible,iva_tipo,subcuenta,confianza,subido_por)
           values ($1,$2,'Endesa',1000,21,'628',0,$3)`, [fac, cif, u]);
  const f = await q(`select base_imponible, subcuenta, confianza from public.facturas_ocr where id=$1`, [fac]);
  check("UC-404 · factura guardada con base/subcuenta y confianza (semáforo)", Number(f.rows[0].base_imponible) === 1000 && f.rows[0].subcuenta === "628");

  // UC-405: corrección con aprendizaje → la subcuenta del proveedor se actualiza
  await q(`update public.facturas_ocr set subcuenta='600', revisada=true, confianza=100 where id=$1`, [fac]);
  await q(`update public.proveedores set subcuenta_habitual='600' where cif=$1`, [cif]);
  const prov2 = await q(`select subcuenta_habitual from public.proveedores where cif=$1`, [cif]);
  check("UC-405 · aprendizaje: la subcuenta corregida se memoriza en el proveedor", prov2.rows[0].subcuenta_habitual === "600");

  await q("rollback");
  console.log(`\n${fail === 0 ? "✓" : "✗"} ocr: ${pass} ok, ${fail} fallidos`);
  process.exitCode = fail === 0 ? 0 : 1;
} catch (err) {
  try { await q("rollback"); } catch {}
  console.error("\n✗ Error:", err.message);
  process.exitCode = 1;
} finally {
  await client.end();
}
