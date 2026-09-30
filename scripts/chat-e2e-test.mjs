// Test E2E del chat (Playwright, dos navegadores) — Fase 1 de US-06 (UC-601..UC-604).
// Crea dos asesores temporales de Badajoz y SOLO se escriben por mensaje directo
// (invisible para el resto del despacho: no se publica nada en General ni en canales).
// Al terminar borra siempre los usuarios; conversaciones y mensajes caen en cascada.
//
// Requiere la app levantada (E2E_BASE_URL, por defecto http://localhost:3000)
// y la migración 0020 aplicada.   Uso: npm run e2e:chat
import { chromium } from "playwright";
import { createClient } from "@supabase/supabase-js";
import ws from "ws"; // Node 20 no trae WebSocket nativo
import { randomUUID } from "node:crypto";
import { readFileSync, mkdirSync } from "node:fs";

const env = Object.fromEntries(readFileSync(".env.local", "utf8").split("\n").filter((l) => l.includes("=")).map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1).trim()]));
const B = env.E2E_BASE_URL || process.env.E2E_BASE_URL || "http://localhost:3000";
const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false }, realtime: { transport: ws } });
const EVID = ".quality/evidence/chat-interno/e2e";
mkdirSync(EVID, { recursive: true });

let pass = 0, fail = 0;
const chk = (n, c, extra = "") => { console.log(`  ${c ? "✓" : "✗"} ${n}${extra ? ` (${extra})` : ""}`); c ? pass++ : fail++; };
const espera = (ms) => new Promise((r) => setTimeout(r, ms));

const sufijo = randomUUID().slice(0, 6);
const password = `chat-e2e-${randomUUID()}`;
const nombreA = `Ándrés Prueba ${sufijo}`;
const nombreB = `Beñat Prueba ${sufijo}`;
const creados = [];

async function crearUsuario(nombre, clave) {
  const email = `chat-e2e-${clave}-${sufijo}@test.laramarcos.invalid`;
  const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (error) throw new Error(`createUser: ${error.message}`);
  creados.push(data.user.id);
  const { error: e2 } = await admin.from("usuarios").insert({ id: data.user.id, email, nombre, rol: "asesor", oficina: "Badajoz", activo: true });
  if (e2) throw new Error(`usuarios: ${e2.message}`);
  return { id: data.user.id, email };
}

async function login(p, email) {
  await p.goto(B + "/login");
  await p.fill('input[name="email"]', email);
  await p.fill('input[name="password"]', password);
  await Promise.all([p.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 30000 }), p.click('button[type="submit"]')]);
}

/** Espera hasta `ms` a que la condición sea cierta; devuelve los ms tardados o null. */
async function hasta(cond, ms = 5000) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    if (await cond().catch(() => false)) return Date.now() - t0;
    await espera(50);
  }
  return null;
}

const browser = await chromium.launch();
try {
  const uA = await crearUsuario(nombreA, "a");
  const uB = await crearUsuario(nombreB, "b");
  const ctxA = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const ctxB = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const pA = await ctxA.newPage();
  const pB = await ctxB.newPage();
  const errores = [];
  for (const p of [pA, pB]) p.on("pageerror", (e) => errores.push(e.message));

  console.log("\n── UC-602 · Canal General ──");
  await login(pA, uA.email);
  await pA.getByRole("link", { name: /Chat/ }).first().click();
  await pA.waitForURL(/\/chat\/[0-9a-f-]{36}/, { timeout: 20000 });
  const lista = pA.getByRole("navigation", { name: "Lista de conversaciones" });
  const primero = (await lista.getByRole("link").first().textContent()) ?? "";
  chk("/chat abre una conversación y General es la primera de la lista (AC-01)", /General/.test(primero), primero.trim().slice(0, 30));
  chk("Un usuario recién creado ya ve General sin que nadie le añada (AC-02)", (await lista.getByRole("link", { name: /General/ }).count()) > 0);
  await pA.screenshot({ path: `${EVID}/UC-602_general.png` });

  console.log("\n── UC-601 · Directorio y directos ──");
  await pA.getByRole("button", { name: /Nuevo mensaje/ }).click();
  const buscador = pA.getByLabel("Buscar compañero por nombre");
  await buscador.fill(`benat prueba ${sufijo}`);
  const botonB = pA.getByRole("button", { name: `Enviar mensaje a ${nombreB}` });
  chk("El buscador encuentra sin mayúsculas ni tildes («benat» → «Beñat») (AC-02)", (await hasta(() => botonB.isVisible(), 5000)) !== null);
  await buscador.fill(sufijo);
  chk("El directorio no incluye al propio usuario", (await pA.getByRole("button", { name: `Enviar mensaje a ${nombreA}` }).count()) === 0);
  await pA.screenshot({ path: `${EVID}/UC-601_directorio.png` });
  await botonB.click();
  await pA.waitForURL((u) => /\/chat\/[0-9a-f-]{36}/.test(u.pathname) && !u.pathname.endsWith(primero), { timeout: 20000 });
  await pA.getByRole("region", { name: `Conversación: ${nombreB}` }).waitFor({ timeout: 20000 }).catch(() => {});
  const urlDirecto = pA.url();
  chk("«Enviar mensaje» abre la conversación directa (AC-03)", await pA.getByRole("region", { name: new RegExp(`Conversación: ${nombreB}`) }).isVisible().catch(() => false));

  console.log("\n── UC-604 · No leídos (B en otra pantalla) ──");
  await login(pB, uB.email);
  await pB.goto(B + "/dashboard");
  await espera(2500); // margen para que el badge se suscriba
  const composerA = pA.getByRole("textbox", { name: "Escribe un mensaje" });
  await composerA.fill("Hola B, primera línea\nsegunda línea");
  const t0 = Date.now();
  await composerA.press("Enter");
  const badgeB = pB.getByLabel(/mensajes sin leer/);
  const msBadge = await hasta(() => badgeB.isVisible(), 5000);
  chk("El menú de B muestra el total de no leídos en < 2 s sin recargar (UC-604 AC-02)", msBadge !== null && Date.now() - t0 < 2000 + 500 && msBadge < 2000, msBadge !== null ? `${msBadge} ms` : "no apareció");
  chk("El badge indica 1", ((await badgeB.getAttribute("aria-label").catch(() => "")) ?? "").startsWith("1 "));
  await pB.screenshot({ path: `${EVID}/UC-604_badge.png` });

  await pB.goto(B + "/chat");
  await pB.waitForURL(/\/chat\/[0-9a-f-]{36}/, { timeout: 20000 });
  const itemA = pB.getByRole("link", { name: `${nombreA}, 1 sin leer` });
  chk("En la lista de B el directo aparece con «1 sin leer» (UC-604 AC-01)", (await hasta(() => itemA.isVisible(), 5000)) !== null);
  await pB.screenshot({ path: `${EVID}/UC-604_lista.png` });
  await itemA.click();
  await pB.waitForURL(urlDirecto.replace(B, "") === "" ? /./ : new RegExp(urlDirecto.split("/chat/")[1]), { timeout: 20000 });
  const msgs = pB.getByRole("log", { name: "Mensajes" }).or(pB.locator('[aria-label="Mensajes"]'));
  chk("B ve el mensaje con el nombre de A (UC-603 AC-02)", (await hasta(async () => (await msgs.textContent())?.includes(nombreA) && (await msgs.textContent())?.includes("primera línea"), 5000)) !== null);
  const textoPre = await pB.getByText("Hola B, primera línea").first().evaluate((el) => getComputedStyle(el).whiteSpace).catch(() => "");
  chk("El texto respeta los saltos de línea (UC-603 AC-02)", /pre/.test(textoPre), textoPre);
  chk("Al abrirla, el badge del menú desaparece (UC-604 AC-03)", (await hasta(async () => !(await badgeB.isVisible()), 5000)) !== null);
  chk("Al abrirla, su contador en la lista pasa a 0 (UC-604 AC-03)", (await hasta(async () => (await pB.getByRole("link", { name: `${nombreA}, 1 sin leer` }).count()) === 0, 5000)) !== null);

  console.log("\n── UC-603 · Tiempo real con los dos dentro ──");
  await espera(1500);
  await composerA.fill("¿Me lees en directo?");
  const t1 = Date.now();
  await composerA.press("Enter");
  const msVivo = await hasta(async () => (await msgs.textContent())?.includes("¿Me lees en directo?"), 5000);
  chk("B ve el mensaje aparecer en < 2 s sin recargar (AC-01)", msVivo !== null && msVivo < 2000, msVivo !== null ? `${msVivo} ms (total ${Date.now() - t1} ms)` : "no llegó");
  chk("Con la conversación abierta no se acumulan no leídos", (await badgeB.count()) === 0 || !(await badgeB.isVisible()));
  await pB.screenshot({ path: `${EVID}/UC-603_tiempo_real.png` });

  console.log("\n── UC-603 · Sin conexión ──");
  await ctxA.setOffline(true);
  await composerA.fill("Mensaje sin red");
  await composerA.press("Enter");
  const noEnviado = pA.getByRole("button", { name: "Reintentar el envío del mensaje" });
  chk("Sin conexión el mensaje queda «No enviado» con Reintentar (AC-03)", (await hasta(() => noEnviado.isVisible(), 8000)) !== null);
  chk("El texto no se pierde", await pA.getByText("Mensaje sin red").first().isVisible().catch(() => false));
  await pA.screenshot({ path: `${EVID}/UC-603_no_enviado.png` });
  await ctxA.setOffline(false);
  await espera(1000);
  await noEnviado.click();
  chk("Al reintentar con red, B lo recibe", (await hasta(async () => (await msgs.textContent())?.includes("Mensaje sin red"), 8000)) !== null);
  chk("Tras reintentar ya no aparece «No enviado»", (await hasta(async () => (await noEnviado.count()) === 0, 5000)) !== null);

  console.log("\n── UC-601 · Reabrir el directo no duplica ──");
  await pA.getByRole("button", { name: /Nuevo mensaje/ }).click();
  await pA.getByLabel("Buscar compañero por nombre").fill(sufijo);
  await pA.getByRole("button", { name: `Enviar mensaje a ${nombreB}` }).click();
  await espera(2500);
  chk("Vuelve a la misma conversación (AC-03)", pA.url() === urlDirecto);
  const { count: nDirectos } = await admin.from("conversaciones").select("id", { count: "exact", head: true }).eq("tipo", "directo").or(`usuario_a.eq.${uA.id},usuario_b.eq.${uA.id}`);
  chk("Solo existe una conversación directa entre A y B", nDirectos === 1, `${nDirectos}`);

  console.log("\n── UC-602 · Paginación de 50 en 50 ──");
  const convId = urlDirecto.split("/chat/")[1];
  const base = Date.now() - 3 * 86400000; // hace 3 días, antes de los mensajes de la prueba
  const lote = Array.from({ length: 60 }, (_, i) => ({
    id: randomUUID(), conversacion_id: convId, autor_id: uA.id, texto: `Histórico ${i + 1}`,
    created_at: new Date(base + i * 60000).toISOString(),
  }));
  const { error: eLote } = await admin.from("mensajes").insert(lote);
  chk("Se cargan 60 mensajes antiguos en el directo", !eLote, eLote?.message);
  const { count: totalMsgs } = await admin.from("mensajes").select("id", { count: "exact", head: true }).eq("conversacion_id", convId);
  await pA.goto(urlDirecto);
  const filas = pA.locator('[aria-label="Mensajes"] li.chat-entra');
  await hasta(async () => (await filas.count()) > 0, 10000);
  chk("Al abrir se muestran los 50 más recientes (AC-03)", (await filas.count()) === 50, `${await filas.count()}`);
  chk("El más reciente está visible y el primero histórico no", (await pA.getByText("Mensaje sin red").count()) > 0 && (await pA.getByText("Histórico 1", { exact: true }).count()) === 0);
  await pA.locator('[aria-label="Mensajes"]').evaluate((el) => { el.scrollTop = 0; el.dispatchEvent(new Event("scroll")); });
  const msPag = await hasta(async () => (await filas.count()) === totalMsgs, 8000);
  chk("Al llegar arriba carga los anteriores hasta completar (AC-03)", msPag !== null, `${await filas.count()}/${totalMsgs}`);
  await pA.screenshot({ path: `${EVID}/UC-602_paginacion.png` });

  chk("Sin errores de JavaScript en las páginas", errores.length === 0, errores.slice(0, 2).join(" | "));
  await ctxA.close();
  await ctxB.close();
} catch (e) {
  fail++;
  console.log(`  ✗ Error: ${e.message.split("\n")[0]}`);
} finally {
  await browser.close();
  for (const id of creados) {
    const { error } = await admin.auth.admin.deleteUser(id);
    if (error) console.log(`  ! No se pudo borrar el usuario temporal ${id}: ${error.message}`);
  }
  const { count } = await admin.from("usuarios").select("id", { count: "exact", head: true }).in("id", creados.length ? creados : [randomUUID()]);
  console.log(count === 0 ? "\n  · Usuarios temporales borrados" : `\n  ! Quedan ${count} usuarios temporales`);
}

console.log(`\n${fail === 0 ? "✓" : "✗"} Chat E2E: ${pass} ok, ${fail} fallidos · capturas en ${EVID}/`);
process.exit(fail === 0 ? 0 : 1);
