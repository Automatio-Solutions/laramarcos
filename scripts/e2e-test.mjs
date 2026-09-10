// Test E2E de navegación de cliente (Playwright) — cosas que el smoke por HTTP
// NO puede cazar porque solo ocurren al pulsar en el navegador (interceptores,
// rutas modales). Regresión del bug del botón "Nueva tarea" (el interceptor
// (.)tareas/[id] capturaba /tareas/nuevo → 404).
//
// Requiere el servidor en :3000 y el chromium de Playwright instalado.
//   node scripts/e2e-test.mjs
import { chromium } from "playwright";
import { readFileSync } from "node:fs";

const env = Object.fromEntries(readFileSync(".env.local", "utf8").split("\n").filter((l) => l.includes("=")).map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1).trim()]));
const BASE = env.E2E_BASE_URL || "http://localhost:3000";
const EMAIL = env.E2E_EMAIL || "antonio@laramarcosasesores.es";
const PASS = env.E2E_PASSWORD || "laramarcos2026";

let pass = 0, fail = 0;
const check = (n, c) => { console.log(`  ${c ? "✓" : "✗"} ${n}`); c ? pass++ : fail++; };

// Un 404 REAL de Next muestra su heading/título visible. El string "404" suelto
// aparece en el payload RSC de casi cualquier página → no vale como señal.
async function muestra404Real(page) {
  return (await page.locator('text=/This page could not be found|no se ha encontrado la página|404: This page could not be found/i').count()) > 0;
}

const browser = await chromium.launch();
const page = await browser.newPage();
const errores = [];
page.on("pageerror", (e) => errores.push(e.message));

try {
  // --- Login por el formulario real ---
  await page.goto(BASE + "/login");
  await page.fill('input[name="email"]', EMAIL);
  await page.fill('input[name="password"]', PASS);
  await Promise.all([
    page.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 20000 }).catch(() => {}),
    page.click('button[type="submit"]'),
  ]);
  check("login entra en la app (sale de /login)", !page.url().includes("/login"));

  // --- REGRESIÓN: 'Nueva tarea' abre el formulario (antes daba 404) ---
  await page.goto(BASE + "/tareas");
  await page.click("text=Nueva tarea");
  await page.waitForTimeout(1200);
  check("'Nueva tarea' → URL /tareas/nuevo", new URL(page.url()).pathname === "/tareas/nuevo");
  check("'Nueva tarea' NO muestra 404", !(await muestra404Real(page)));
  check("'Nueva tarea' muestra el formulario", (await page.locator('h1:has-text("Nueva tarea")').count()) > 0 && (await page.locator("form").count()) > 0);

  // --- Los botones 'nuevo' de los demás módulos también navegan bien ---
  for (const [ruta, texto, urlEsperada, heading] of [
    ["/clientes", "Nuevo cliente", "/clientes/nuevo", "Nuevo cliente"],
    ["/servicios", "Nuevo servicio", "/servicios/nuevo", "Nuevo servicio"],
    ["/proveedores", "Nuevo proveedor", "/proveedores/nuevo", "Nuevo proveedor"],
  ]) {
    await page.goto(BASE + ruta);
    const link = page.locator(`a:has-text("${texto}"), button:has-text("${texto}")`).first();
    if (await link.count() === 0) { check(`'${texto}' existe en ${ruta}`, false); continue; }
    await link.click();
    await page.waitForTimeout(900);
    const okUrl = new URL(page.url()).pathname === urlEsperada;
    const okForm = (await page.locator(`h1:has-text("${heading}")`).count()) > 0 && (await page.locator("form").count()) > 0;
    check(`'${texto}' → ${urlEsperada} con formulario, sin 404`, okUrl && okForm && !(await muestra404Real(page)));
  }

  check("sin errores de JavaScript en el navegador", errores.length === 0);
  if (errores.length) errores.forEach((e) => console.log("     [pageerror]", e));
} finally {
  await browser.close();
}

console.log(`\n${fail === 0 ? "✓" : "✗"} E2E navegación: ${pass} ok, ${fail} fallidos`);
process.exit(fail === 0 ? 0 : 1);
