// Test E2E del chat, fase 3 (UC-610..UC-613) — Playwright con varios navegadores.
// Datos temporales (siempre se borran al terminar, incluidos los ficheros del almacén):
//   · asesores A y B (Badajoz), C (Castuera) y un responsable R (Badajoz)
//   · un cliente QAE2E de Badajoz (su hilo lo ve brevemente la gente de Badajoz)
// Adjuntos, búsqueda, edición y "escribiendo…" se prueban en un DIRECTO A–B.
//
// Requiere la app levantada (E2E_BASE_URL) y las migraciones 0020–0023.
// Uso: npm run e2e:chat-fase3
import { chromium } from "playwright";
import { createClient } from "@supabase/supabase-js";
import ws from "ws"; // Node 20 no trae WebSocket nativo
import { randomUUID } from "node:crypto";
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const env = Object.fromEntries(readFileSync(".env.local", "utf8").split("\n").filter((l) => l.includes("=")).map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1).trim()]));
const B = env.E2E_BASE_URL || process.env.E2E_BASE_URL || "http://localhost:3000";
const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false }, realtime: { transport: ws } });
const EVID = ".quality/evidence/chat-interno-fase-3/e2e";
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
function genCif() {
  const d = Array.from({ length: 7 }, () => Math.floor(Math.random() * 10)).join("");
  let odd = 0, even = 0;
  for (let i = 0; i < 7; i++) { const n = +d[i]; if (i % 2 === 0) { const x = n * 2; odd += Math.floor(x / 10) + (x % 10); } else even += n; }
  return "B" + d + ((10 - ((odd + even) % 10)) % 10);
}

// Ficheros de prueba
const dir = tmpdir();
const pdfPath = join(dir, `informe-e2e-${randomUUID().slice(0, 4)}.pdf`);
const PDF = "%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj 2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj 3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 200 200]>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n";
writeFileSync(pdfPath, PDF);
const grandePath = join(dir, "grande-e2e.pdf");
writeFileSync(grandePath, Buffer.alloc(21 * 1024 * 1024, 0x20));
const exePath = join(dir, "programa-e2e.exe");
writeFileSync(exePath, "MZ fake");

const sufijo = randomUUID().slice(0, 6);
const password = `chat-e2e-${randomUUID()}`;
const usuariosCreados = [];
let clienteId = null;
const convsCreadas = new Set();

async function crearUsuario(clave, nombre, rol, oficina) {
  const email = `chat-e2e3-${clave}-${sufijo}@test.laramarcos.invalid`;
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
  const url = p.url();
  convsCreadas.add(url.split("/chat/")[1].split("?")[0]);
  return url;
}
async function ultimoMensaje(convId) {
  const { data } = await admin.from("mensajes").select("id, texto, adjunto_path, adjunto_nombre, borrado, editado_at").eq("conversacion_id", convId).order("created_at", { ascending: false }).limit(1);
  return data?.[0] ?? null;
}

const browser = await chromium.launch();
try {
  const A = await crearUsuario("a", `Aitana Prueba ${sufijo}`, "asesor", "Badajoz");
  const Bu = await crearUsuario("b", `Bea Prueba ${sufijo}`, "asesor", "Badajoz");
  const C = await crearUsuario("c", `Celia Prueba ${sufijo}`, "asesor", "Castuera");
  const R = await crearUsuario("r", `Ramón Prueba ${sufijo}`, "responsable", "Badajoz");
  const { data: cli, error: eCli } = await admin.from("clientes").insert({ cif: genCif(), razon_social: `QAE2E Chat3 ${sufijo} SL`, oficina: "Badajoz", activo: true }).select("id").single();
  if (eCli) throw new Error(`cliente: ${eCli.message}`);
  clienteId = cli.id;

  const nuevo = async () => { const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, acceptDownloads: true }); const p = await ctx.newPage(); return { ctx, p }; };
  const { ctx: ctxA, p: pA } = await nuevo();
  const { ctx: ctxB, p: pB } = await nuevo();
  const { ctx: ctxC, p: pC } = await nuevo();
  const { p: pR } = await nuevo();
  const errores = [];
  for (const p of [pA, pB, pC, pR]) p.on("pageerror", (e) => errores.push(e.message));
  await login(pA, A.email); await login(pB, Bu.email); await login(pC, C.email); await login(pR, R.email);

  const urlAB = await abrirDirecto(pA, Bu);
  const convAB = urlAB.split("/chat/")[1];
  await pB.goto(urlAB);
  await pB.getByRole("region", { name: `Conversación: ${A.nombre}` }).waitFor({ timeout: 20000 });
  await espera(1500);

  section("UC-613 · Presencia y «escribiendo…»");
  const puntoEnB = pB.locator("[data-conectado]").first();
  chk("B ve a A conectada (punto verde) en el directo (AC-02)", (await hasta(() => puntoEnB.isVisible(), 10000)) !== null);
  const composerA = pA.getByRole("textbox", { name: "Escribe un mensaje" });
  await composerA.pressSequentially("Estoy escribiendo algo", { delay: 60 });
  const escribiendo = pB.locator("[data-escribiendo]");
  chk("B ve «A está escribiendo…» (AC-01)", (await hasta(async () => (await escribiendo.textContent())?.includes("Aitana") && /escribiendo/.test((await escribiendo.textContent()) ?? ""), 5000)) !== null, (await escribiendo.textContent().catch(() => "")) ?? "");
  await pB.screenshot({ path: `${EVID}/UC-613_escribiendo.png` });
  const t0 = Date.now();
  const msDesaparece = await hasta(async () => !((await escribiendo.textContent().catch(() => "")) ?? "").includes("Aitana"), 9000);
  chk("El aviso desaparece a los ~5 s sin teclear (AC-01)", msDesaparece !== null && Date.now() - t0 <= 7500, msDesaparece !== null ? `${Date.now() - t0} ms` : "no desapareció");
  await composerA.pressSequentially(" más", { delay: 60 });
  await hasta(async () => ((await escribiendo.textContent().catch(() => "")) ?? "").includes("Aitana"), 4000);
  await composerA.fill("");

  section("UC-610 · Adjuntos");
  await pA.locator('[data-testid="chat-adjunto-input"]').setInputFiles(pdfPath);
  const chip = pA.locator("[data-adjunto-chip]");
  chk("Al adjuntar aparece el fichero listo para enviar", (await hasta(async () => (await chip.getAttribute("data-adjunto-chip")) === "listo", 15000)) !== null);
  await composerA.fill("Te paso el informe");
  await composerA.press("Enter");
  const tarjetaB = pB.locator('a[data-adjunto="pdf"]').first();
  chk("B recibe el mensaje con la tarjeta del adjunto (AC-01)", (await hasta(() => tarjetaB.isVisible(), 8000)) !== null);
  const etiqueta = (await tarjetaB.getAttribute("aria-label")) ?? "";
  chk("La tarjeta muestra nombre, tipo y tamaño (AC-01)", etiqueta.includes(pdfPath.split("/").pop()) && /PDF/.test(etiqueta) && /\d/.test(etiqueta), etiqueta);
  await pB.screenshot({ path: `${EVID}/UC-610_adjunto.png` });
  const msgAdj = await ultimoMensaje(convAB);
  const href = await tarjetaB.getAttribute("href");
  const resB = await ctxB.request.get(B + href, { maxRedirects: 0 });
  const destino = resB.headers()["location"] ?? "";
  chk("B puede descargarlo: la app redirige a un enlace temporal (AC-01)", resB.status() === 302 || resB.status() === 307, `${resB.status()}`);
  const descarga = destino ? await ctxB.request.get(destino) : null;
  const cuerpo = descarga ? await descarga.text() : "";
  chk("El fichero descargado es el que se subió", cuerpo.startsWith("%PDF-1.4"));
  let caducidad = null;
  try {
    const token = new URL(destino).searchParams.get("token");
    const payload = JSON.parse(Buffer.from(token.split(".")[1], "base64url").toString());
    caducidad = payload.exp - payload.iat;
  } catch { /* sin token legible */ }
  chk("El enlace temporal caduca a los 5 minutos (AC-02)", caducidad === 300, `${caducidad} s`);
  const publico = await ctxB.request.get(`${env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/chat/${msgAdj?.adjunto_path}`);
  chk("No existe enlace público al fichero (AC-02)", publico.status() >= 400, `${publico.status()}`);
  const resC = await ctxC.request.get(B + href, { maxRedirects: 0 });
  chk("Un no miembro con el enlace directo es rechazado (AC-04)", resC.status() === 404 || resC.status() === 403, `${resC.status()}`);
  const anon = await (await browser.newContext()).request.get(B + href, { maxRedirects: 0 });
  chk("Sin sesión también es rechazado", anon.status() === 401 || anon.status() === 404 || (anon.status() >= 300 && anon.status() < 400 && (anon.headers()["location"] ?? "").includes("/login")), `${anon.status()}`);
  await pA.locator('[data-testid="chat-adjunto-input"]').setInputFiles(grandePath);
  const errorComp = pA.locator("[data-error-composer]");
  chk("Un fichero de más de 20 MB se rechaza indicando el límite (AC-03)", (await hasta(async () => /20 MB/.test((await errorComp.textContent()) ?? ""), 5000)) !== null, (await errorComp.textContent().catch(() => "")) ?? "");
  await pA.locator('[data-testid="chat-adjunto-input"]').setInputFiles(exePath);
  chk("Un tipo no permitido se rechaza indicando el motivo (AC-03)", (await hasta(async () => /no permitido/i.test((await errorComp.textContent()) ?? ""), 5000)) !== null, (await errorComp.textContent().catch(() => "")) ?? "");
  await pA.screenshot({ path: `${EVID}/UC-610_rechazo.png` });
  const { data: objetos } = await admin.storage.from("chat").list(convAB, { limit: 100 });
  chk("Los ficheros rechazados no llegan al almacén", (objetos ?? []).length === 1, `${(objetos ?? []).length} carpeta(s)`);

  section("UC-611 · Búsqueda");
  await composerA.fill(`Revisión de facturación trimestral ${sufijo}`);
  await composerA.press("Enter");
  await hasta(async () => (await ultimoMensaje(convAB))?.texto?.includes("facturación"), 8000);
  const idFact = (await ultimoMensaje(convAB))?.id;
  const buscarB = pB.getByLabel("Buscar en los mensajes");
  await buscarB.fill(`facturacion ${sufijo}`);
  const tBus = Date.now();
  const resultado = pB.locator('ul[aria-label="Resultados de la búsqueda"] a[data-resultado-busqueda]').first();
  const msBus = await hasta(() => resultado.isVisible(), 5000);
  chk("Buscar sin tilde encuentra «facturación» (AC-01)", msBus !== null);
  chk("Resultados en < 1 s tras la pausa de escritura (AC-01)", msBus !== null && Date.now() - tBus - 300 < 1000, `${Date.now() - tBus} ms incl. 300 ms de pausa`);
  const txtRes = (await resultado.textContent()) ?? "";
  chk("El resultado indica la conversación y la fecha (AC-01)", txtRes.includes(A.nombre) && /\d{1,2}:\d{2}/.test(txtRes), txtRes.slice(0, 80));
  chk("La palabra buscada aparece resaltada", (await resultado.locator("mark").count()) > 0);
  await pB.screenshot({ path: `${EVID}/UC-611_busqueda.png` });
  await resultado.click();
  const destacado = pB.locator(`li#mensaje-${idFact}`);
  chk("Al pulsarlo abre la conversación en ese mensaje y resaltado (AC-02)", (await hasta(async () => (await destacado.getAttribute("aria-current")) === "true", 8000)) !== null);
  const buscarC = pC.getByLabel("Buscar en los mensajes");
  await pC.goto(B + "/chat"); await pC.waitForURL(/\/chat\/[0-9a-f-]{36}/, { timeout: 20000 });
  await buscarC.fill(`facturacion ${sufijo}`);
  await espera(2000);
  chk("Quien no es miembro no ve ese mensaje en los resultados (AC-03)", (await pC.locator("a[data-resultado-busqueda]").count()) === 0 && (await pC.getByText(/Sin resultados/).count()) > 0);

  section("UC-612 · Editar y borrar");
  const filaA = pA.locator(`li#mensaje-${idFact}`);
  await filaA.hover();
  await filaA.getByRole("button", { name: "Editar mensaje" }).click();
  const editor = pA.locator("[data-editor-mensaje] textarea");
  await editor.fill(`Revisión de facturación trimestral ${sufijo} (corregido)`);
  const tEd = Date.now();
  await editor.press("Enter");
  const filaB = pB.locator(`li#mensaje-${idFact}`);
  const msEd = await hasta(async () => (await filaB.textContent())?.includes("(corregido)") && (await filaB.locator("[data-editado]").count()) > 0, 6000);
  chk("B ve el texto nuevo con «(editado)» en < 2 s (AC-01)", msEd !== null && msEd < 2000, msEd !== null ? `${msEd} ms (total ${Date.now() - tEd} ms)` : "no llegó");
  await pB.screenshot({ path: `${EVID}/UC-612_editado.png` });
  await filaB.hover();
  chk("B no tiene opciones de editar ni borrar el mensaje de A (AC-03)", (await filaB.getByRole("button", { name: "Editar mensaje" }).count()) === 0 && (await filaB.getByRole("button", { name: "Borrar mensaje" }).count()) === 0);
  await filaA.hover();
  await filaA.getByRole("button", { name: "Borrar mensaje" }).click();
  await pA.getByRole("dialog", { name: "Borrar mensaje" }).getByRole("button", { name: "Borrar", exact: true }).click();
  chk("Tras confirmar, todos ven «Mensaje eliminado» (AC-02)", (await hasta(async () => (await filaB.locator("[data-borrado]").count()) > 0, 6000)) !== null);
  const { data: tras } = await admin.rpc("chat_buscar", { p_q: `facturacion ${sufijo}`, p_limite: 50 });
  await buscarB.fill(""); await buscarB.fill(`corregido ${sufijo}`);
  await espera(1500);
  chk("Su texto ya no aparece en las búsquedas (AC-02)", (await pB.locator("a[data-resultado-busqueda]").count()) === 0, `rpc admin: ${(tras ?? []).length}`);
  const { data: aud } = await admin.from("auditoria").select("usuario_id, operacion, diff, ts").eq("tabla", "mensajes").eq("registro_id", idFact).eq("operacion", "UPDATE").order("ts");
  const difs = JSON.stringify(aud ?? []);
  chk("La auditoría registra la edición y el borrado con quién, cuándo y el texto anterior (AC-04)", (aud ?? []).length >= 2 && (aud ?? []).every((r) => r.usuario_id === A.id && r.ts) && difs.includes("Revisión de facturación trimestral") && difs.includes("(corregido)"), `${(aud ?? []).length} registros`);
  // Moderación del staff en un hilo que puede ver (cliente de Badajoz)
  await pB.goto(`${B}/clientes/${clienteId}`);
  const secB = pB.locator("section#conversacion");
  await secB.getByRole("textbox", { name: "Escribe un mensaje" }).waitFor({ timeout: 15000 });
  await secB.getByRole("textbox", { name: "Escribe un mensaje" }).fill("Mensaje de Bea para moderar");
  await secB.getByRole("textbox", { name: "Escribe un mensaje" }).press("Enter");
  let convCli = null;
  await hasta(async () => { const { data } = await admin.from("conversaciones").select("id").eq("cliente_id", clienteId).maybeSingle(); convCli = data?.id; return !!convCli && !!(await ultimoMensaje(convCli)); }, 10000);
  const idModerar = (await ultimoMensaje(convCli))?.id;
  await pR.goto(`${B}/chat/${convCli}`);
  const filaR = pR.locator(`li#mensaje-${idModerar}`);
  await filaR.waitFor({ timeout: 15000 });
  await filaR.hover();
  chk("El responsable puede borrar el mensaje de otro pero no editarlo (AC-02/03)", (await filaR.getByRole("button", { name: "Borrar mensaje" }).count()) === 1 && (await filaR.getByRole("button", { name: "Editar mensaje" }).count()) === 0);
  await filaR.getByRole("button", { name: "Borrar mensaje" }).click();
  await pR.getByRole("dialog", { name: "Borrar mensaje" }).getByRole("button", { name: "Borrar", exact: true }).click();
  chk("…y al borrarlo desaparece para todos", (await hasta(async () => (await ultimoMensaje(convCli))?.borrado === true, 6000)) !== null);

  section("UC-610 · Borrar un adjunto limpia el almacén");
  const filaAdj = pA.locator(`li#mensaje-${msgAdj.id}`);
  await filaAdj.hover();
  await filaAdj.getByRole("button", { name: "Borrar mensaje" }).click();
  await pA.getByRole("dialog", { name: "Borrar mensaje" }).getByRole("button", { name: "Borrar", exact: true }).click();
  await hasta(async () => (await admin.from("mensajes").select("borrado").eq("id", msgAdj.id).single()).data?.borrado === true, 6000);
  // El servidor borra el fichero justo después de marcar el mensaje: se espera a que ocurra.
  let tras2 = [];
  await hasta(async () => {
    ({ data: tras2 } = await admin.storage.from("chat").list(msgAdj.adjunto_path.split("/").slice(0, 2).join("/")));
    return (tras2 ?? []).length === 0;
  }, 8000);
  chk("El fichero del mensaje borrado se elimina del almacén", (tras2 ?? []).length === 0, `${(tras2 ?? []).length}`);
  const resTras = await ctxB.request.get(B + href, { maxRedirects: 0 });
  chk("…y su enlace deja de funcionar", resTras.status() === 404, `${resTras.status()}`);

  section("UC-613 · Desconexión");
  await pB.goto(B + "/chat"); await pB.waitForURL(/\/chat\/[0-9a-f-]{36}/, { timeout: 20000 });
  await pB.getByRole("button", { name: /Nuevo mensaje/ }).click();
  await pB.getByLabel("Buscar compañero por nombre").fill(sufijo);
  const filaDirA = pB.locator("li", { hasText: A.nombre }).first();
  chk("En el directorio A aparece conectada (AC-02)", (await hasta(async () => (await filaDirA.locator("[data-conectado]").count()) > 0, 8000)) !== null);
  await pB.screenshot({ path: `${EVID}/UC-613_directorio.png` });
  await ctxA.close();
  const tCierre = Date.now();
  const msFuera = await hasta(async () => (await filaDirA.locator("[data-conectado]").count()) === 0, 40000);
  chk("Al cerrar A la plataforma, el punto desaparece en < 30 s (AC-02)", msFuera !== null && msFuera < 30000, msFuera !== null ? `${Date.now() - tCierre} ms` : "no desapareció");

  chk("Sin errores de JavaScript en las páginas", errores.length === 0, errores.slice(0, 2).join(" | "));
  await ctxB.close(); await ctxC.close();
} catch (e) {
  fail++;
  console.log(`  ✗ Error: ${e.message.split("\n")[0]}`);
} finally {
  await browser.close();
  // Ficheros del almacén de las conversaciones temporales
  for (const conv of convsCreadas) {
    const { data: carpetas } = await admin.storage.from("chat").list(conv, { limit: 100 });
    for (const c of carpetas ?? []) {
      const { data: fs } = await admin.storage.from("chat").list(`${conv}/${c.name}`, { limit: 100 });
      const rutas = (fs ?? []).map((f) => `${conv}/${c.name}/${f.name}`);
      if (rutas.length) await admin.storage.from("chat").remove(rutas);
    }
  }
  if (clienteId) await admin.from("clientes").delete().eq("id", clienteId);
  for (const id of usuariosCreados) {
    const { error } = await admin.auth.admin.deleteUser(id);
    if (error) console.log(`  ! No se pudo borrar el usuario temporal ${id}: ${error.message}`);
  }
  const { count: quedanU } = await admin.from("usuarios").select("id", { count: "exact", head: true }).in("id", usuariosCreados.length ? usuariosCreados : [randomUUID()]);
  console.log(quedanU === 0 ? "\n  · Datos temporales borrados" : `\n  ! Quedan ${quedanU} usuarios temporales`);
}

console.log(`\n${fail === 0 ? "✓" : "✗"} Chat E2E fase 3: ${pass} ok, ${fail} fallidos · capturas en ${EVID}/`);
process.exit(fail === 0 ? 0 : 1);
