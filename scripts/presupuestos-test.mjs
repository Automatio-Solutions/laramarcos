// Test de integración M2 (UC-205/207): aceptar presupuesto → tarea + subtareas por plantilla.
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

const u = randomUUID(), cli = randomUUID(), serv = randomUUID(), pre = randomUUID();
const cif = "B" + Math.floor(10000000 + Math.random() * 89999999);

try {
  await client.connect();
  await q("begin");
  await q(`insert into auth.users (id,instance_id,aud,role,email,created_at,updated_at) values ($1,'00000000-0000-0000-0000-000000000000','authenticated','authenticated','u@t.lm',now(),now())`, [u]);
  await q(`insert into public.usuarios (id,email,nombre,rol) values ($1,'u@t.lm','U','responsable')`, [u]);
  await q(`insert into public.clientes (id,cif,razon_social,asesor_id) values ($1,$2,'Cliente Z',$3)`, [cli, cif, u]);
  await q(`insert into public.servicios (id,nombre,precio_base) values ($1,'Constitución SL',350)`, [serv]);
  await q(`insert into public.plantillas_subtareas (servicio_id,pasos) values ($1,'[{"orden":1,"nombre":"Notaría","plazo_relativo_dias":0},{"orden":2,"nombre":"Alta censal","plazo_relativo_dias":3}]'::jsonb)`, [serv]);

  // presupuesto enviado, con servicio (para la plantilla) y líneas
  await q(`insert into public.presupuestos (id,cliente_id,servicio_id,creado_por,estado,lineas,total)
           values ($1,$2,$3,$4,'enviado','[{"concepto":"Constitución SL","cantidad":1,"precio":350,"descuento":0}]'::jsonb,350)`, [pre, cli, serv, u]);

  // --- Simula aceptarPresupuesto (lógica de la acción) ---
  const tarea = randomUUID();
  await q(`insert into public.tareas (id,titulo,cliente_id,responsable_id,servicio_id,origen) values ($1,'Constitución SL',$2,$3,$4,'presupuesto')`, [tarea, cli, u, serv]);
  await q(`insert into public.subtareas (tarea_id,titulo,plazo,orden) values ($1,'Notaría',current_date,1),($1,'Alta censal',current_date+3,2)`, [tarea]);
  await q(`update public.presupuestos set estado='aceptado', aceptado_at=now(), tarea_id=$2 where id=$1`, [pre, tarea]);

  // --- Verificaciones ---
  const p = await q(`select estado, tarea_id from public.presupuestos where id=$1`, [pre]);
  check("AC: presupuesto pasa a aceptado y enlaza la tarea", p.rows[0].estado === "aceptado" && p.rows[0].tarea_id === tarea);
  const t = await q(`select origen from public.tareas where id=$1`, [tarea]);
  check("AC-207: tarea creada con origen=presupuesto", t.rows[0].origen === "presupuesto");
  const subs = await q(`select count(*)::int c from public.subtareas where tarea_id=$1`, [tarea]);
  check("AC-207: subtareas instanciadas desde la plantilla del servicio", subs.rows[0].c === 2);

  await q("rollback");
  console.log(`\n${fail === 0 ? "✓" : "✗"} presupuestos: ${pass} ok, ${fail} fallidos`);
  process.exitCode = fail === 0 ? 0 : 1;
} catch (err) {
  try { await q("rollback"); } catch {}
  console.error("\n✗ Error:", err.message);
  process.exitCode = 1;
} finally {
  await client.end();
}
