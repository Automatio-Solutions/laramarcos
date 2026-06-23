// Test del canal de notificaciones in-app (UC-103/104/105/107).
// Verifica crear_notificacion (SECURITY DEFINER) + dedupe diario + RLS por usuario.
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

const u1 = randomUUID(), u2 = randomUUID();
const asUser = async (id) => { await q("set local role authenticated"); await q(`set local request.jwt.claims = '${JSON.stringify({ sub: id, role: "authenticated" })}'`); };
const asSuper = async () => { await q("reset role"); await q(`set local request.jwt.claims = ''`); };

try {
  await client.connect();
  await q("begin");
  for (const [id, e] of [[u1, "u1@t.lm"], [u2, "u2@t.lm"]]) {
    await q(`insert into auth.users (id,instance_id,aud,role,email,created_at,updated_at) values ($1,'00000000-0000-0000-0000-000000000000','authenticated','authenticated',$2,now(),now())`, [id, e]);
    await q(`insert into public.usuarios (id,email,nombre,rol) values ($1,$2,'U','asesor')`, [id, e]);
  }

  // crear_notificacion + dedupe
  await q(`select public.crear_notificacion($1,'alerta_7d','Vence en 7 días: X','/tareas/x')`, [u1]);
  await q(`select public.crear_notificacion($1,'alerta_7d','Vence en 7 días: X','/tareas/x')`, [u1]); // dup mismo día
  const n = await q(`select count(*)::int c from public.notificaciones where usuario_id=$1`, [u1]);
  check("crear_notificacion crea y deduplica (1 sola)", n.rows[0].c === 1);

  // RLS: u1 ve la suya
  await asUser(u1);
  const v1 = await q(`select count(*)::int c from public.notificaciones`);
  check("RLS · destinatario ve su notificación", v1.rows[0].c === 1);
  await asSuper();

  // RLS: u2 no ve la de u1
  await asUser(u2);
  const v2 = await q(`select count(*)::int c from public.notificaciones`);
  check("RLS · otro usuario NO ve notificaciones ajenas", v2.rows[0].c === 0);
  await asSuper();

  await q("rollback");
  console.log(`\n${fail === 0 ? "✓" : "✗"} alertas/notif: ${pass} ok, ${fail} fallidos`);
  process.exitCode = fail === 0 ? 0 : 1;
} catch (err) {
  try { await q("rollback"); } catch {}
  console.error("\n✗ Error:", err.message);
  process.exitCode = 1;
} finally {
  await client.end();
}
