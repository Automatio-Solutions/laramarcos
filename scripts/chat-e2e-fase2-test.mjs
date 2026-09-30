// Test E2E del chat, fase 2 (UC-605..UC-609) — Playwright con varios navegadores.
// Crea datos temporales etiquetados QAE2E y los borra SIEMPRE al terminar:
//   · asesores A y B (Badajoz), C (Castuera) y un responsable R
//   · un cliente de Badajoz y una tarea suya con una subtarea asignada a B
// Las menciones y los enlaces se prueban en mensajes DIRECTOS (invisibles para el
// resto). El hilo del cliente temporal sí lo ve brevemente la gente de Badajoz y
// los responsables, igual que el resto de datos QAE2E de scripts/e2e-test.mjs.
//
// Requiere la app levantada (E2E_BASE_URL) y las migraciones 0020 y 0021.
// Uso: npm run e2e:chat-fase2
import { chromium } from "playwright";
import { createClient } from "@supabase/supabase-js";
import ws from "ws"; // Node 20 no trae WebSocket nativo
import { randomUUID } from "node:crypto";
import { readFileSync, mkdirSync } from "node:fs";

const env = Object.fromEntries(readFileSync(".env.local", "utf8").split("\n").filter((l) => l.includes("=")).map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1).trim()]));
const B = env.E2E_BASE_URL || process.env.E2E_BASE_URL || "http://localhost:3000";
const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false }, realtime: { transport: ws } });
const EVID = ".quality/evidence/chat-interno-fase-2/e2e";
mkdirSync(EVID, { recursive: true });

let pass = 0, fail = 0;
const chk = (n, c, extra = "") => { console.log(`  ${c ? "✓" : "✗"} ${n}${extra ? ` (${extra})` : ""}`); c ? pass++ : fail++; };
const section = (t) => console.log(`\n── ${t} ──`);
const espera = (ms) => new Promise((r) => setTimeout(r, ms));
async function hasta(cond, ms = 5000) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    if (await cond().catch(() => false)) return Date.now() - t0;
    await espera(50);
  }
  return null;
}

// CIF de empresa válido (letra B + 7 dígitos + control), único.
function genCif() {
  const d = Array.from({ length: 7 }, () => Math.floor(Math.random() * 10)).join("");
  let odd = 0, even = 0;
  for (let i = 0; i < 7; i++) { const n = +d[i]; if (i % 2 === 0) { const x = n * 2; odd += Math.floor(x / 10) + (x % 10); } else even += n; }
  return "B" + d + ((10 - ((odd + even) % 10)) % 10);
}

const sufijo = randomUUID().slice(0, 6);
const password = `chat-e2e-${randomUUID()}`;
const usuariosCreados = [];
let clienteId = null, tareaId = null;

async function crearUsuario(clave, nombre, rol, oficina) {
  const email = `chat-e2e2-${clave}-${sufijo}@test.laramarcos.invalid`;
  const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (error) throw new Error(`createUser ${clave}: ${error.message}`);
  usuariosCreados.push(data.user.id);
  const { error: e2 } = await admin.from("usuarios").insert({ id: data.user.id, email, nombre, rol, oficina, activo: true });
  if (e2) throw new Error(`usuarios ${clave}: ${e2.message}`);
  return { id: data.user.id, email, nombre };
}
async function login(p, email) {
  await p.goto(B + "/login");
  await p.fill('input[name="email"]', email);
  await p.fill('input[name="password"]', password);
  await Promise.all([p.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 30000 }), p.click('button[type="submit"]')]);
}
async function abrirDirecto(p, otro) {
  await p.goto(B + "/chat");
  await p.waitForURL(/\/chat\/[0-9a-f-]{36}/, { timeout: 20000 });
  await p.getByRole("button", { name: /Nuevo mensaje/ }).click();
  await p.getByLabel("Buscar compañero por nombre").fill(sufijo);
  await p.getByRole("button", { name: `Enviar mensaje a ${otro.nombre}` }).click();
  await p.getByRole("region", { name: `Conversación: ${otro.nombre}` }).waitFor({ timeout: 20000 });
  return p.url();
}
const titulosLista = async (p) => (await p.getByRole("navigation", { name: "Lista de conversaciones" }).getByRole("link").allTextContents()).map((t) => t.trim());

const browser = await chromium.launch();
try {
  const A = await crearUsuario("a", `Alba Prueba ${sufijo}`, "asesor", "Badajoz");
  const Bu = await crearUsuario("b", `Bruno Prueba ${sufijo}`, "asesor", "Badajoz");
  const C = await crearUsuario("c", `Carla Prueba ${sufijo}`, "asesor", "Castuera");
  const R = await crearUsuario("r", `Rocío Prueba ${sufijo}`, "responsable", "Badajoz");

  const { data: cli, error: eCli } = await admin.from("clientes").insert({ cif: genCif(), razon_social: `QAE2E Chat ${sufijo} SL`, oficina: "Badajoz", activo: true }).select("id").single();
  if (eCli) throw new Error(`cliente: ${eCli.message}`);
  clienteId = cli.id;
  const { data: tar, error: eTar } = await admin.from("tareas").insert({ titulo: `QAE2E Chat tarea ${sufijo}`, cliente_id: clienteId, responsable_id: A.id, estado: "pendiente" }).select("id").single();
  if (eTar) throw new Error(`tarea: ${eTar.message}`);
  tareaId = tar.id;
  const { error: eSub } = await admin.from("subtareas").insert({ tarea_id: tareaId, titulo: "QAE2E subtarea", asignado_id: Bu.id });
  if (eSub) throw new Error(`subtarea: ${eSub.message}`);

  const nuevo = async () => { const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } }); const p = await ctx.newPage(); return { ctx, p }; };
  const { p: pA } = await nuevo();
  const { p: pB } = await nuevo();
  const { p: pC } = await nuevo();
  const { p: pR } = await nuevo();
  const errores = [];
  for (const p of [pA, pB, pC, pR]) p.on("pageerror", (e) => errores.push(e.message));
  await login(pA, A.email);
  await login(pB, Bu.email);
  await login(pC, C.email);
  await login(pR, R.email);

  section("UC-609 · Canales por oficina");
  await pA.goto(B + "/chat"); await pA.waitForURL(/\/chat\/[0-9a-f-]{36}/, { timeout: 20000 });
  let tA = await titulosLista(pA);
  chk("Asesor de Badajoz ve el canal de su oficina (AC-01)", tA.some((t) => /Badajoz/.test(t)));
  chk("…y no los de las demás oficinas (AC-01)", !tA.some((t) => /Castuera|Don Benito|Orellana/.test(t)), tA.join(" | ").slice(0, 80));
  await pR.goto(B + "/chat"); await pR.waitForURL(/\/chat\/[0-9a-f-]{36}/, { timeout: 20000 });
  const tR = await titulosLista(pR);
  chk("El responsable ve los 4 canales de oficina (AC-03)", ["Badajoz", "Castuera", "Don Benito", "Orellana"].every((o) => tR.some((t) => t.includes(o))));
  await admin.from("usuarios").update({ oficina: "Castuera" }).eq("id", A.id);
  await pA.goto(B + "/chat"); await pA.waitForURL(/\/chat\/[0-9a-f-]{36}/, { timeout: 20000 });
  tA = await titulosLista(pA);
  chk("Al cambiarla de oficina, entra en el canal nuevo y sale del anterior (AC-02)", tA.some((t) => /Castuera/.test(t)) && !tA.some((t) => /Badajoz/.test(t)), tA.join(" | ").slice(0, 80));
  await pA.screenshot({ path: `${EVID}/UC-609_cambio_oficina.png` });
  await admin.from("usuarios").update({ oficina: "Badajoz" }).eq("id", A.id);

  section("UC-605 · @menciones");
  const urlAB = await abrirDirecto(pA, Bu);
  const composerA = pA.getByRole("textbox", { name: "Escribe un mensaje" });
  await composerA.fill("");
  await composerA.pressSequentially("Hola @bru", { delay: 40 });
  const picker = pA.getByRole("listbox", { name: "Mencionar a un compañero" });
  chk("Al teclear «@bru» aparece la lista de compañeros de la conversación (AC-01)", (await hasta(() => picker.isVisible(), 5000)) !== null);
  const opciones = await picker.getByRole("option").allTextContents().catch(() => []);
  chk("La lista ofrece a Bruno y no al propio autor", opciones.some((o) => o.includes(Bu.nombre)) && !opciones.some((o) => o.includes(A.nombre)), opciones.join(" | "));
  await pA.screenshot({ path: `${EVID}/UC-605_picker.png` });
  await composerA.press("Enter"); // elige la opción resaltada
  await composerA.pressSequentially("revisa esto", { delay: 20 });
  const textoCompuesto = await composerA.inputValue();
  chk("Elegir inserta «@Nombre completo»", textoCompuesto.includes(`@${Bu.nombre}`), textoCompuesto);
  await composerA.press("Enter");
  let mensajeMencion = null;
  await hasta(async () => {
    const { data } = await admin.from("mensajes").select("id, menciones").eq("conversacion_id", urlAB.split("/chat/")[1]).order("created_at", { ascending: false }).limit(1);
    mensajeMencion = data?.[0] ?? null;
    return mensajeMencion?.menciones?.includes(Bu.id);
  }, 8000);
  chk("El mensaje guarda la mención de Bruno", !!mensajeMencion?.menciones?.includes(Bu.id));
  let notifs = [];
  await hasta(async () => {
    ({ data: notifs } = await admin.from("notificaciones").select("tipo, enlace, mensaje").eq("usuario_id", Bu.id).eq("tipo", "mencion_chat"));
    return (notifs ?? []).length > 0;
  }, 8000);
  chk("Bruno recibe una notificación de mención (AC-02)", (notifs ?? []).length === 1, (notifs ?? [])[0]?.mensaje);
  chk("El aviso enlaza a la conversación en ese mensaje", (notifs ?? [])[0]?.enlace === `/chat/${urlAB.split("/chat/")[1]}?m=${mensajeMencion?.id}`);
  const otra = pA.locator('span[data-mencion="otra"]').first();
  chk("En la vista del autor la mención aparece resaltada (AC-03)", (await hasta(() => otra.isVisible(), 5000)) !== null);
  await pB.goto(B + "/dashboard");
  await pB.getByRole("button", { name: "Notificaciones" }).click();
  await pB.getByText(/te ha mencionado/).first().click();
  await pB.waitForURL(/\?m=/, { timeout: 20000 });
  const destacado = pB.locator(`li#mensaje-${mensajeMencion?.id}`);
  chk("Al pulsar el aviso se abre la conversación en ese mensaje (AC-02)", (await hasta(async () => (await destacado.getAttribute("aria-current")) === "true", 6000)) !== null);
  chk("Para el mencionado el resaltado es más fuerte (AC-03)", await pB.locator('span[data-mencion="propia"]').first().isVisible().catch(() => false));
  await pB.screenshot({ path: `${EVID}/UC-605_mencion_propia.png` });

  section("UC-608 · Enlaces a tareas y clientes");
  await composerA.fill(`Mira la tarea ${B}/tareas/${tareaId} y el cliente /clientes/${clienteId}`);
  await composerA.press("Enter");
  const cardTarea = pA.locator('[data-enlace="tarea"]').first();
  const cardCliente = pA.locator('[data-enlace="cliente"]').first();
  chk("El enlace de tarea se muestra como tarjeta con título y estado (AC-01)", (await hasta(() => cardTarea.isVisible(), 6000)) !== null && ((await cardTarea.getAttribute("aria-label")) ?? "").includes(`QAE2E Chat tarea ${sufijo}`), (await cardTarea.getAttribute("aria-label").catch(() => "")) ?? "");
  chk("El enlace de cliente se muestra como tarjeta con nombre y estado (AC-01)", (await hasta(() => cardCliente.isVisible(), 6000)) !== null && ((await cardCliente.getAttribute("aria-label")) ?? "").includes(`QAE2E Chat ${sufijo}`));
  await pA.screenshot({ path: `${EVID}/UC-608_tarjetas.png` });
  await cardTarea.click();
  chk("Al pulsar la tarjeta abre la página de la tarea (AC-01)", (await hasta(async () => new URL(pA.url()).pathname === `/tareas/${tareaId}`, 8000)) !== null);
  const urlAC = await abrirDirecto(pA, C);
  const composerA2 = pA.getByRole("textbox", { name: "Escribe un mensaje" });
  await composerA2.fill(`Carla, ¿ves este cliente? /clientes/${clienteId}`);
  await composerA2.press("Enter");
  await pC.goto(urlAC);
  const noDisp = pC.getByRole("note", { name: "Elemento no disponible" });
  chk("Quien no tiene permiso ve «Elemento no disponible» (AC-02)", (await hasta(() => noDisp.isVisible(), 8000)) !== null);
  chk("…sin el nombre del cliente", (await pC.getByText(`QAE2E Chat ${sufijo}`).count()) === 0);
  await pC.screenshot({ path: `${EVID}/UC-608_no_disponible.png` });

  section("UC-606 · Conversación en la ficha de cliente");
  await pA.goto(`${B}/clientes/${clienteId}`);
  await pB.goto(`${B}/clientes/${clienteId}`);
  const secA = pA.locator("section#conversacion");
  const secB = pB.locator("section#conversacion");
  chk("La ficha tiene la sección Conversación (AC-01)", (await hasta(() => secA.getByRole("textbox", { name: "Escribe un mensaje" }).isVisible(), 10000)) !== null);
  await hasta(() => secB.getByRole("textbox", { name: "Escribe un mensaje" }).isVisible(), 10000);
  await espera(1500);
  await secA.getByRole("textbox", { name: "Escribe un mensaje" }).fill("Nota interna sobre este cliente");
  await secA.getByRole("textbox", { name: "Escribe un mensaje" }).press("Enter");
  const msFicha = await hasta(async () => (await secB.textContent())?.includes("Nota interna sobre este cliente"), 6000);
  chk("Otro usuario con acceso lo ve en tiempo real en la ficha (AC-01)", msFicha !== null && msFicha < 2000, msFicha !== null ? `${msFicha} ms` : "no llegó");
  await pA.screenshot({ path: `${EVID}/UC-606_ficha.png` });
  const { data: convCli } = await admin.from("conversaciones").select("id").eq("cliente_id", clienteId).single();
  await pR.goto(`${B}/chat/${convCli.id}`);
  chk("El responsable también la ve (otra vía de acceso)", (await hasta(async () => (await pR.textContent("body"))?.includes("Nota interna sobre este cliente"), 8000)) !== null);
  await pC.goto(`${B}/chat/${convCli.id}`);
  await espera(2000);
  chk("Un asesor de otra oficina no ve ningún mensaje del hilo (AC-02)", !((await pC.textContent("body")) ?? "").includes("Nota interna sobre este cliente"));
  await pC.goto(`${B}/clientes/${clienteId}`);
  await espera(2000);
  chk("…ni desde la ficha", !((await pC.textContent("body")) ?? "").includes("Nota interna sobre este cliente"));
  await pB.goto(`${B}/dashboard`);
  await espera(2000);
  await secA.getByRole("textbox", { name: "Escribe un mensaje" }).fill("Segunda nota");
  await secA.getByRole("textbox", { name: "Escribe un mensaje" }).press("Enter");
  await espera(1500);
  await pB.goto(B + "/chat"); await pB.waitForURL(/\/chat\/[0-9a-f-]{36}/, { timeout: 20000 });
  const itemCliente = pB.getByRole("link", { name: new RegExp(`QAE2E Chat ${sufijo}.*sin leer`) });
  chk("En la lista del chat aparece el hilo con el nombre del cliente y no leídos (AC-03)", (await hasta(() => itemCliente.isVisible(), 6000)) !== null);
  await pB.getByRole("button", { name: "Clientes" }).click();
  chk("El filtro «Clientes» lo muestra", await itemCliente.isVisible().catch(() => false));
  await pB.screenshot({ path: `${EVID}/UC-606_lista_clientes.png` });

  section("UC-607 · Comentarios de tarea en tiempo real");
  await pA.goto(`${B}/tareas/${tareaId}`);
  await pB.goto(`${B}/tareas/${tareaId}`);
  await espera(2500);
  const comentariosB = pB.getByLabel("Comentarios de la tarea");
  await pA.locator('input[name="texto"]').fill(`Comentario en vivo @${Bu.nombre}`);
  const t0 = Date.now();
  await pA.locator('input[name="texto"]').press("Enter");
  const msCom = await hasta(async () => (await comentariosB.textContent())?.includes("Comentario en vivo"), 6000);
  chk("El otro usuario ve el comentario en < 2 s sin recargar (AC-01)", msCom !== null && msCom < 2000, msCom !== null ? `${msCom} ms (total ${Date.now() - t0} ms)` : "no llegó");
  await pB.screenshot({ path: `${EVID}/UC-607_comentario_vivo.png` });
  let nCom = [];
  await hasta(async () => {
    ({ data: nCom } = await admin.from("notificaciones").select("tipo").eq("usuario_id", Bu.id).eq("tipo", "mencion"));
    return (nCom ?? []).length > 0;
  }, 8000);
  chk("La @mención de un asesor en un comentario avisa en la campana (AC-02)", (nCom ?? []).length >= 1);
  await pC.goto(`${B}/tareas/${tareaId}`);
  await espera(1500);
  chk("Un asesor ajeno a la tarea no ve sus comentarios", !((await pC.textContent("body")) ?? "").includes("Comentario en vivo"));

  chk("Sin errores de JavaScript en las páginas", errores.length === 0, errores.slice(0, 2).join(" | "));
} catch (e) {
  fail++;
  console.log(`  ✗ Error: ${e.message.split("\n")[0]}`);
} finally {
  await browser.close();
  if (tareaId) await admin.from("tareas").delete().eq("id", tareaId);
  if (clienteId) await admin.from("clientes").delete().eq("id", clienteId);
  for (const id of usuariosCreados) {
    const { error } = await admin.auth.admin.deleteUser(id);
    if (error) console.log(`  ! No se pudo borrar el usuario temporal ${id}: ${error.message}`);
  }
  const { count: quedanU } = await admin.from("usuarios").select("id", { count: "exact", head: true }).in("id", usuariosCreados.length ? usuariosCreados : [randomUUID()]);
  const { count: quedanC } = await admin.from("clientes").select("id", { count: "exact", head: true }).ilike("razon_social", `QAE2E Chat ${sufijo}%`);
  console.log(quedanU === 0 && quedanC === 0 ? "\n  · Datos temporales borrados" : `\n  ! Quedan ${quedanU} usuarios / ${quedanC} clientes temporales`);
}

console.log(`\n${fail === 0 ? "✓" : "✗"} Chat E2E fase 2: ${pass} ok, ${fail} fallidos · capturas en ${EVID}/`);
process.exit(fail === 0 ? 0 : 1);
