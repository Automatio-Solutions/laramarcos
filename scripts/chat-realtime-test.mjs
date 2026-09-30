// Test de tiempo real del chat (UC-603 AC-01 / AC-04, UC-604 AC-02) contra Supabase.
// Crea 3 usuarios temporales (2 asesores de Badajoz + 1 de Castuera), abre un
// mensaje DIRECTO entre los dos primeros —invisible para el resto del despacho—
// y comprueba:
//   · el destinatario recibe el mensaje por Realtime en < 2 s
//   · un tercero NO recibe el evento (la RLS se aplica también al tiempo real)
//   · el contador de no leídos del destinatario sube a 1
// Al terminar borra SIEMPRE los usuarios; sus conversaciones y mensajes caen en cascada.
//
// Uso: npm run db:chat-realtime-test   (requiere la migración 0020 aplicada)
import { config } from "dotenv";
config({ path: ".env.local" });
import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import ws from "ws"; // Node 20 no trae WebSocket nativo

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !anonKey || !serviceKey) {
  console.error("✗ Faltan NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY o SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const opts = { auth: { autoRefreshToken: false, persistSession: false }, realtime: { transport: ws } };
const admin = createClient(url, serviceKey, opts);
const LATENCIA_MAX_MS = 2000;

let pass = 0, fail = 0;
function check(name, cond, extra = "") {
  if (cond) { pass++; console.log(`  ✓ ${name}${extra ? ` (${extra})` : ""}`); }
  else { fail++; console.log(`  ✗ ${name}${extra ? ` (${extra})` : ""}`); }
}
const espera = (ms) => new Promise((r) => setTimeout(r, ms));

const sufijo = randomUUID().slice(0, 8);
const password = `chat-test-${randomUUID()}`;
const fixtures = [
  { clave: "a", nombre: "Test Chat A", oficina: "Badajoz" },
  { clave: "b", nombre: "Test Chat B", oficina: "Badajoz" },
  { clave: "c", nombre: "Test Chat C", oficina: "Castuera" },
];
const creados = [];

async function crearUsuario(f) {
  const email = `chat-test-${f.clave}-${sufijo}@test.laramarcos.invalid`;
  const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (error) throw new Error(`createUser ${f.clave}: ${error.message}`);
  const id = data.user.id;
  creados.push(id);
  const { error: e2 } = await admin
    .from("usuarios")
    .insert({ id, email, nombre: `${f.nombre} ${sufijo}`, rol: "asesor", oficina: f.oficina, activo: true });
  if (e2) throw new Error(`usuarios ${f.clave}: ${e2.message}`);
  const cliente = createClient(url, anonKey, opts);
  const { data: s, error: e3 } = await cliente.auth.signInWithPassword({ email, password });
  if (e3) throw new Error(`login ${f.clave}: ${e3.message}`);
  cliente.realtime.setAuth(s.session.access_token);
  return { id, cliente };
}

function suscribir(cliente, nombre, filtro, alRecibir) {
  return new Promise((resolve, reject) => {
    const canal = cliente
      .channel(`${nombre}-${sufijo}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "mensajes", ...(filtro ? { filter: filtro } : {}) }, alRecibir)
      .subscribe((estado, err) => {
        if (estado === "SUBSCRIBED") resolve(canal);
        if (estado === "CHANNEL_ERROR" || estado === "TIMED_OUT") reject(new Error(`${nombre}: ${estado} ${err?.message ?? ""}`));
      });
  });
}

try {
  const usuarios = {};
  for (const f of fixtures) usuarios[f.clave] = await crearUsuario(f);
  const { a: ua, b: ub, c: uc } = usuarios;

  const { data: convId, error: eAbrir } = await ua.cliente.rpc("chat_abrir_directo", { p_otro: ub.id });
  check("A abre el directo con B", !eAbrir && !!convId, eAbrir?.message);

  const recibidosB = [];
  const recibidosBGlobal = [];
  const recibidosC = [];
  await suscribir(ub.cliente, "b-conv", `conversacion_id=eq.${convId}`, (p) => recibidosB.push({ t: Date.now(), row: p.new }));
  await suscribir(ub.cliente, "b-global", null, (p) => recibidosBGlobal.push(p.new));
  await suscribir(uc.cliente, "c-global", null, (p) => recibidosC.push(p.new));
  await espera(1000); // margen para que Realtime registre las suscripciones

  const idMensaje = randomUUID();
  const t0 = Date.now();
  const { error: eIns } = await ua.cliente
    .from("mensajes")
    .insert({ id: idMensaje, conversacion_id: convId, autor_id: ua.id, texto: "Hola B\nsegunda línea" });
  check("A envía el mensaje", !eIns, eIns?.message);

  while (Date.now() - t0 < 5000 && !recibidosB.some((r) => r.row.id === idMensaje)) await espera(25);
  const llegada = recibidosB.find((r) => r.row.id === idMensaje);
  const latencia = llegada ? llegada.t - t0 : null;
  check("B recibe el mensaje por Realtime", !!llegada);
  check(`B lo recibe en < ${LATENCIA_MAX_MS} ms (UC-603 AC-01)`, latencia !== null && latencia < LATENCIA_MAX_MS, latencia !== null ? `${latencia} ms` : "no llegó");
  check("El texto llega con los saltos de línea", llegada?.row.texto === "Hola B\nsegunda línea");

  await espera(2500); // tiempo de sobra para que un evento indebido llegara
  check("B también lo recibe en la suscripción global (badge del menú)", recibidosBGlobal.some((r) => r.id === idMensaje));
  check("C (otra oficina, ajeno al directo) NO recibe el evento (UC-603 AC-04)", !recibidosC.some((r) => r.id === idMensaje));

  const { data: nlB } = await ub.cliente.rpc("chat_no_leidos");
  check("No leídos de B en el directo = 1 (UC-604)", (nlB ?? []).find((r) => r.conversacion_id === convId)?.no_leidos === 1);
  const { data: nlC } = await uc.cliente.rpc("chat_no_leidos");
  check("C no tiene no leídos de ese directo", !(nlC ?? []).some((r) => r.conversacion_id === convId));
  const { data: msgsC } = await uc.cliente.from("mensajes").select("id").eq("conversacion_id", convId);
  check("C no puede leer los mensajes del directo", (msgsC ?? []).length === 0);

  for (const u of Object.values(usuarios)) await u.cliente.removeAllChannels();
} catch (e) {
  fail++;
  console.log(`  ✗ Error: ${e.message}`);
} finally {
  for (const id of creados) {
    const { error } = await admin.auth.admin.deleteUser(id);
    if (error) console.log(`  ! No se pudo borrar el usuario temporal ${id}: ${error.message}`);
  }
  const { count } = await admin.from("usuarios").select("id", { count: "exact", head: true }).in("id", creados.length ? creados : [randomUUID()]);
  console.log(count === 0 ? "  · Usuarios temporales borrados" : `  ! Quedan ${count} usuarios temporales`);
}

console.log(`\n${fail === 0 ? "✓" : "✗"} Chat en tiempo real: ${pass} ok, ${fail} fallidos`);
process.exit(fail === 0 ? 0 : 1);
