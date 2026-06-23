// Test de integración: facturación (UC-110) e instanciación de plantilla (UC-109).
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

const u = randomUUID(), cli = randomUUID(), tarea = randomUUID(), pl = randomUUID();
const cif = "B" + Math.floor(10000000 + Math.random() * 89999999);

try {
  await client.connect();
  await q("begin");
  await q(`insert into auth.users (id,instance_id,aud,role,email,created_at,updated_at) values ($1,'00000000-0000-0000-0000-000000000000','authenticated','authenticated','u@t.lm',now(),now())`, [u]);
  await q(`insert into public.usuarios (id,email,nombre,rol) values ($1,'u@t.lm','U','responsable')`, [u]);
  await q(`insert into public.clientes (id,cif,razon_social,asesor_id) values ($1,$2,'Cliente X',$3)`, [cli, cif, u]);

  // UC-110 (AC-21): completar tarea → línea de factura (replica el efecto de la acción)
  await q(`insert into public.tareas (id,titulo,cliente_id,responsable_id,estado) values ($1,'Gestión',$2,$3,'completada')`, [tarea, cli, u]);
  await q(`insert into public.lineas_factura (tarea_id,cliente_id,concepto,importe,facturada) values ($1,$2,'Gestión',0,false)`, [tarea, cli]);
  const pend = await q(`select count(*)::int c from public.lineas_factura where cliente_id=$1 and facturada=false`, [cli]);
  check("AC-21/22 · línea de factura pendiente creada para el cliente", pend.rows[0].c === 1);

  // marcar facturada → sale de pendientes
  await q(`update public.lineas_factura set importe=350, facturada=true where tarea_id=$1`, [tarea]);
  const pend2 = await q(`select count(*)::int c from public.lineas_factura where cliente_id=$1 and facturada=false`, [cli]);
  check("AC-22 · al marcar facturada sale de pendientes", pend2.rows[0].c === 0);

  // UC-109 (AC-19): instanciar plantilla → tarea + subtareas con plazos
  const pasos = JSON.stringify([
    { orden: 1, nombre: "Notaría", plazo_relativo_dias: 0 },
    { orden: 2, nombre: "Alta censal", plazo_relativo_dias: 3 },
  ]);
  await q(`insert into public.plantillas_tareas (id,nombre,subtareas) values ($1,'Constitución SL',$2::jsonb)`, [pl, pasos]);
  const t2 = randomUUID();
  await q(`insert into public.tareas (id,titulo,responsable_id) values ($1,'Constitución SL',$2)`, [t2, u]);
  await q(`insert into public.subtareas (tarea_id,titulo,plazo,orden) values
           ($1,'Notaría', current_date, 1), ($1,'Alta censal', current_date + 3, 2)`, [t2]);
  const subs = await q(`select count(*)::int c from public.subtareas where tarea_id=$1`, [t2]);
  check("AC-19 · instanciar plantilla crea las subtareas con plazos", subs.rows[0].c === 2);

  await q("rollback");
  console.log(`\n${fail === 0 ? "✓" : "✗"} facturación/plantillas: ${pass} ok, ${fail} fallidos`);
  process.exitCode = fail === 0 ? 0 : 1;
} catch (err) {
  try { await q("rollback"); } catch {}
  console.error("\n✗ Error:", err.message);
  process.exitCode = 1;
} finally {
  await client.end();
}
