// Test de integración de la ficha de tarea (UC-102/104/105/107/108).
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

const u = randomUUID(), t1 = randomUUID(), t2 = randomUUID();
const st1 = randomUUID(), st2 = randomUUID();

try {
  await client.connect();
  await q("begin");
  await q(`insert into auth.users (id,instance_id,aud,role,email,created_at,updated_at) values ($1,'00000000-0000-0000-0000-000000000000','authenticated','authenticated','u@t.lm',now(),now())`, [u]);
  await q(`insert into public.usuarios (id,email,nombre,rol) values ($1,'u@t.lm','Marta','responsable')`, [u]);
  await q(`insert into public.tareas (id,titulo,responsable_id) values ($1,'Constitución SL',$2),($3,'IVA trimestral',$2)`, [t1, u, t2]);

  // UC-102 (AC-04): subtareas con asignado, plazo y estado propios; una depende de la otra (AC-05)
  await q(`insert into public.subtareas (id,tarea_id,titulo,asignado_id,plazo,estado,orden) values ($1,$2,'Notaría',$3,'2026-02-01','completada',1)`, [st1, t1, u]);
  await q(`insert into public.subtareas (id,tarea_id,titulo,depende_de,orden) values ($1,$2,'Alta censal',$3,2)`, [st2, t1, st1]);
  const sub = await q(`select asignado_id, plazo, estado, depende_de from public.subtareas where tarea_id=$1 order by orden`, [t1]);
  check("AC-04 · subtarea con asignado/plazo/estado propios", sub.rows[0].asignado_id === u && sub.rows[0].estado === "completada");
  check("AC-05 · subtarea con dependencia propia (depende_de)", sub.rows[1].depende_de === st1);

  // UC-105: comentario con @menciones (array de ids)
  await q(`insert into public.comentarios (tarea_id,autor_id,texto,menciones) values ($1,$2,'@Marta revisa esto',$3)`, [t1, u, [u]]);
  const com = await q(`select menciones from public.comentarios where tarea_id=$1`, [t1]);
  check("UC-105 · comentario guarda menciones", com.rows[0].menciones.length === 1 && com.rows[0].menciones[0] === u);

  // UC-108: tiempo
  await q(`insert into public.tiempos (tarea_id,usuario_id,segundos,nota) values ($1,$2,5400,'modelo')`, [t1, u]);
  const ti = await q(`select sum(segundos)::int s from public.tiempos where tarea_id=$1`, [t1]);
  check("UC-108 · tiempo registrado (5400s)", ti.rows[0].s === 5400);

  // UC-107: dependencia entre tareas
  await q(`insert into public.dependencias_tarea (tarea_id,depende_de_id) values ($1,$2)`, [t2, t1]);
  const dep = await q(`select 1 from public.dependencias_tarea where tarea_id=$1 and depende_de_id=$2`, [t2, t1]);
  check("UC-107 · dependencia entre tareas creada", dep.rowCount === 1);

  // UC-104: bloqueo
  await q(`update public.tareas set bloqueada=true, motivo_bloqueo='bloqueada por cliente', estado='bloqueada' where id=$1`, [t1]);
  const bl = await q(`select bloqueada, estado from public.tareas where id=$1`, [t1]);
  check("UC-104 · bloqueo persiste con motivo y estado", bl.rows[0].bloqueada === true && bl.rows[0].estado === "bloqueada");

  await q("rollback");
  console.log(`\n${fail === 0 ? "✓" : "✗"} ficha: ${pass} ok, ${fail} fallidos`);
  process.exitCode = fail === 0 ? 0 : 1;
} catch (err) {
  try { await q("rollback"); } catch {}
  console.error("\n✗ Error:", err.message);
  process.exitCode = 1;
} finally {
  await client.end();
}
