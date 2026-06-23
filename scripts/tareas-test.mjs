// Test de integración de tareas (UC-101 · AC-02 visibilidad · AC-03 estado persiste).
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

const a1 = randomUUID(), a2 = randomUUID(), tarea = randomUUID();
const asUser = async (id) => {
  await q("set local role authenticated");
  await q(`set local request.jwt.claims = '${JSON.stringify({ sub: id, role: "authenticated" })}'`);
};
const asSuper = async () => { await q("reset role"); await q(`set local request.jwt.claims = ''`); };

try {
  await client.connect();
  await q("begin");
  for (const [id, email] of [[a1, "a1@t.lm"], [a2, "a2@t.lm"]]) {
    await q(`insert into auth.users (id,instance_id,aud,role,email,created_at,updated_at) values ($1,'00000000-0000-0000-0000-000000000000','authenticated','authenticated',$2,now(),now())`, [id, email]);
    await q(`insert into public.usuarios (id,email,nombre,rol) values ($1,$2,'A','asesor')`, [id, email]);
  }
  await q(`insert into public.tareas (id, titulo, estado, responsable_id) values ($1,'Cierre IVA','pendiente',$2)`, [tarea, a1]);

  // AC-02: asesor1 (responsable) ve su tarea; asesor2 no
  await asUser(a1);
  const v1 = await q(`select count(*)::int n from public.tareas where id=$1`, [tarea]);
  check("AC-02 · responsable ve su tarea", v1.rows[0].n === 1);
  // AC-03: arrastre → cambia estado y persiste
  const upd = await q(`update public.tareas set estado='en_curso' where id=$1`, [tarea]);
  check("AC-03 · responsable mueve la tarea (1 fila)", upd.rowCount === 1);
  await asSuper();

  await asUser(a2);
  const v2 = await q(`select count(*)::int n from public.tareas where id=$1`, [tarea]);
  check("AC-02 · asesor ajeno NO ve la tarea", v2.rows[0].n === 0);
  await asSuper();

  // Persistencia (AC-03): el estado quedó guardado
  const fin = await q(`select estado from public.tareas where id=$1`, [tarea]);
  check("AC-03 · el nuevo estado persiste (en_curso)", fin.rows[0].estado === "en_curso");

  await q("rollback");
  console.log(`\n${fail === 0 ? "✓" : "✗"} tareas: ${pass} ok, ${fail} fallidos`);
  process.exitCode = fail === 0 ? 0 : 1;
} catch (err) {
  try { await q("rollback"); } catch {}
  console.error("\n✗ Error:", err.message);
  process.exitCode = 1;
} finally {
  await client.end();
}
