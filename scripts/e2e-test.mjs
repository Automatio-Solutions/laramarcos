// Test E2E completo (Playwright) — ejercita las interacciones de cliente que el
// smoke por HTTP NO puede cazar: crear/editar/arrastrar/adjuntar, rutas tras clic,
// modales, filtros. Crea datos etiquetados "QAE2E" y los purga al final.
//
//   node scripts/e2e-test.mjs           (todo salvo IA de presupuestos)
//   E2E_IA=1 node scripts/e2e-test.mjs  (incluye la generación IA — consume API)
import { chromium } from "playwright";
import { createClient } from "@supabase/supabase-js";
import { readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const env = Object.fromEntries(readFileSync(".env.local", "utf8").split("\n").filter((l) => l.includes("=")).map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1).trim()]));
const B = env.E2E_BASE_URL || "http://localhost:3000";
const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const TAG = "QAE2E";

let pass = 0, fail = 0;
const chk = (n, c) => { console.log(`  ${c ? "✓" : "✗"} ${n}`); c ? pass++ : fail++; };
const section = (t) => console.log(`\n── ${t} ──`);

// CIF de empresa válido (letra B + 7 dígitos + control), único.
function genCif() {
  const d = Array.from({ length: 7 }, () => Math.floor(Math.random() * 10)).join("");
  let odd = 0, even = 0;
  for (let i = 0; i < 7; i++) { const n = +d[i]; if (i % 2 === 0) { const x = n * 2; odd += Math.floor(x / 10) + (x % 10); } else even += n; }
  return "B" + d + ((10 - ((odd + even) % 10)) % 10);
}

async function login(p) {
  await p.goto(B + "/login");
  await p.fill('input[name="email"]', env.E2E_EMAIL || "antonio@laramarcosasesores.es");
  await p.fill('input[name="password"]', env.E2E_PASSWORD || "laramarcos2026");
  await Promise.all([p.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 20000 }).catch(() => {}), p.click('button[type="submit"]')]);
}

async function purgar() {
  const { data: ts } = await admin.from("tareas").select("id").ilike("titulo", `%${TAG}%`);
  const ids = (ts ?? []).map((t) => t.id);
  if (ids.length) {
    // lineas_factura ANTES que tareas: la FK es "on delete set null", así que
    // si se borra la tarea primero, la línea sobrevive huérfana y se queda
    // para siempre en la pantalla de Facturación pendiente.
    await admin.from("lineas_factura").delete().in("tarea_id", ids);
    for (const tb of ["dependencias_tarea", "comentarios", "tiempos", "subtareas", "adjuntos"]) await admin.from(tb).delete().in("tarea_id", ids);
    await admin.from("dependencias_tarea").delete().in("depende_de_id", ids);
    await admin.from("tareas").delete().in("id", ids);
  }
  // Red de seguridad: barre también las que ya quedaron huérfanas de
  // ejecuciones anteriores, que no tienen tarea a la que apuntar.
  await admin.from("lineas_factura").delete().ilike("concepto", `%${TAG}%`);
  const { data: cs } = await admin.from("clientes").select("id").ilike("razon_social", `%${TAG}%`);
  const cids = (cs ?? []).map((c) => c.id);
  if (cids.length) {
    const { data: css } = await admin.from("cliente_servicios").select("id").in("cliente_id", cids);
    if (css?.length) await admin.from("cliente_servicio_cuotas").delete().in("cliente_servicio_id", css.map((x) => x.id));
    await admin.from("cliente_servicios").delete().in("cliente_id", cids);
    await admin.from("cliente_cuentas").delete().in("cliente_id", cids);
    await admin.from("cliente_sectores").delete().in("cliente_id", cids);
    await admin.from("clientes").delete().in("id", cids);
  }
  await admin.from("presupuestos").delete().ilike("condiciones", `%${TAG}%`);
  await admin.from("servicios").delete().ilike("nombre", `%${TAG}%`);
  await admin.from("proveedores").delete().ilike("nombre", `%${TAG}%`);
  await admin.from("sectores").delete().ilike("nombre", `%${TAG}%`);
}

const IBAN1 = "ES9121000418450200051332", IBAN2 = "ES7100302053091234567895";
const browser = await chromium.launch();
const p = await browser.newPage();
const errs = [];
p.on("pageerror", (e) => errs.push(e.message));

try {
  await purgar();
  await login(p);
  const col = (label) => p.locator(`div.flex.flex-col:has(> div span:has-text("${label}"))`);

  // ============ M1 · TAREAS ============
  section("M1 · TAREAS (crear, editar, subtareas, adjuntar, flujo, arrastrar, archivar)");
  const TIT = `${TAG} tarea ${Date.now().toString().slice(-5)}`;
  await p.goto(B + "/tareas");
  await p.click("text=Nueva tarea"); await p.waitForTimeout(1000);
  chk("'Nueva tarea' abre el formulario sin 404", new URL(p.url()).pathname === "/tareas/nuevo" && (await p.locator('text=/This page could not be found/i').count()) === 0);
  await p.fill('input[name="titulo"]', TIT);
  await p.selectOption('select[name="cliente_id"]', { index: 1 }).catch(() => {});
  await p.selectOption('select[name="responsable_id"]', { index: 1 }).catch(() => {});
  await p.click('button:has-text("Crear tarea")'); await p.waitForTimeout(2500);
  chk("crear tarea → aparece en el tablero SIN recargar", (await p.locator(`text=${TIT}`).count()) > 0);

  await p.click(`text=${TIT}`); await p.waitForTimeout(1000);
  chk("abre el detalle en modal", (await p.locator("text=Descripción").count()) > 0 && (await p.locator("text=Subtareas").count()) > 0);
  await p.fill('textarea[name="descripcion"]', `${TAG} descripción editada`);
  await p.click('button:has-text("Guardar descripción")'); await p.waitForTimeout(1200);
  chk("editar descripción persiste", (await p.locator('textarea[name="descripcion"]').inputValue()).includes("descripción editada"));
  await p.fill('input[placeholder="Nueva subtarea"]', `${TAG} subtarea`);
  await p.click('form:has(input[placeholder="Nueva subtarea"]) button:has-text("Añadir")'); await p.waitForTimeout(1200);
  chk("añadir subtarea aparece al momento", (await p.locator(`text=${TAG} subtarea`).count()) > 0);
  await p.fill('input[placeholder*="comentario"]', `${TAG} comentario`);
  await p.click('button:has-text("Enviar")'); await p.waitForTimeout(1200);
  chk("añadir comentario aparece al momento", (await p.locator(`text=${TAG} comentario`).count()) > 0);
  await p.fill('input[name="minutos"]', "45");
  await p.click('button:has-text("Registrar")'); await p.waitForTimeout(1200);
  chk("registrar tiempo se refleja", (await p.locator("text=/45m|0h 45m/").count()) > 0);
  const adj = join(tmpdir(), "qae2e-adjunto.txt"); writeFileSync(adj, "adjunto de prueba QAE2E");
  await p.setInputFiles('input[type="file"]', adj);
  await p.click('button:has-text("Adjuntar")'); await p.waitForTimeout(1500);
  chk("adjuntar fichero a la tarjeta", (await p.locator("text=qae2e-adjunto.txt").count()) > 0);
  await p.keyboard.press("Escape"); await p.waitForTimeout(800);

  await p.locator(`article:has-text("${TIT}") button:has-text("Empezar tarea")`).click(); await p.waitForTimeout(1200);
  chk("botón 'Empezar tarea' mueve a En curso", (await col("En curso").locator(`text=${TIT}`).count()) > 0);
  await p.locator(`article:has-text("${TIT}")`).dragTo(col("Completada")); await p.waitForTimeout(1200);
  chk("arrastrar tarjeta a Completada", (await col("Completada").locator(`text=${TIT}`).count()) > 0);
  await p.locator(`article:has-text("${TIT}") button:has-text("Archivar")`).click(); await p.waitForTimeout(600);
  await p.locator('button:has-text("Archivar")').last().click(); await p.waitForTimeout(1500);
  chk("archivar (con confirmación) saca la tarjeta del tablero", (await p.locator(`article:has-text("${TIT}")`).count()) === 0);
  await p.goto(B + "/archivo"); await p.waitForTimeout(1000);
  chk("la tarea archivada aparece en /archivo", (await p.locator(`text=${TIT}`).count()) > 0);

  // ============ M1 · CLIENTES ============
  section("M1 · CLIENTES (crear con cuenta+oficina, editar cuentas y servicios, filtros)");
  const RS = `${TAG} Cliente ${Date.now().toString().slice(-4)}`;
  await p.goto(B + "/clientes/nuevo"); await p.waitForTimeout(600);
  await p.fill('input[name="cif"]', genCif());
  await p.fill('input[name="razon_social"]', RS);
  await p.selectOption('select[name="oficina"]', "Badajoz").catch(() => {});
  await p.locator('input[name="cuenta_iban"]').first().fill(IBAN1);
  await p.click('button:has-text("Añadir cuenta")'); await p.waitForTimeout(300);
  await p.locator('input[name="cuenta_iban"]').nth(1).fill(IBAN2);
  await p.click('button:has-text("Guardar")'); await p.waitForTimeout(2000);
  chk("crear cliente → aparece en el listado", (await p.locator(`text=${RS}`).count()) > 0);
  await p.click(`text=${RS}`); await p.waitForTimeout(1200);
  chk("ficha de cliente muestra las 2 cuentas bancarias", (await p.locator(`input[name="cuenta_iban"]`).count()) >= 2);
  // contratar un servicio con cuota
  await p.selectOption('select[name="servicio_id"]', { index: 1 }).catch(() => {});
  await p.locator('form:has(select[name="servicio_id"]) input[name="importe"]').fill("120");
  await p.click('button:has-text("Contratar")'); await p.waitForTimeout(1800);
  chk("contratar servicio con cuota se refleja en la ficha", (await p.locator("text=/Servicios contratados/").count()) > 0 && (await p.locator("text=/120,00|120.00/").count()) > 0);
  // filtro por búsqueda
  await p.goto(B + "/clientes"); await p.fill('input[name="q"]', RS.slice(0, 14)); await p.click('button:has-text("Filtrar")'); await p.waitForTimeout(1200);
  chk("filtro/búsqueda de clientes devuelve el cliente", (await p.locator(`text=${RS}`).count()) > 0);

  // ============ M5 · CATÁLOGOS ============
  section("M5 · CATÁLOGOS (crear servicio, proveedor, sector)");
  const SV = `${TAG} Servicio`, PV = `${TAG} Proveedor`, SC = `${TAG} Sector`;
  await p.goto(B + "/servicios/nuevo"); await p.fill('input[name="nombre"]', SV); await p.fill('input[name="precio_base"]', "50");
  await p.click('button:has-text("Guardar")'); await p.waitForTimeout(1800);
  chk("crear servicio → aparece en el catálogo", (await p.locator(`text=${SV}`).count()) > 0);
  await p.goto(B + "/proveedores/nuevo"); await p.fill('input[name="cif"]', genCif()); await p.fill('input[name="nombre"]', PV);
  await p.click('button:has-text("Guardar")'); await p.waitForTimeout(1800);
  chk("crear proveedor → aparece en el listado", (await p.locator(`text=${PV}`).count()) > 0);
  await p.goto(B + "/sectores"); await p.fill('input[name="nombre"]', SC); await p.click('button:has-text("Añadir")'); await p.waitForTimeout(1500);
  chk("crear sector → aparece en la lista", (await p.locator(`text=${SC}`).count()) > 0);

  // ============ DASHBOARD ============
  section("DASHBOARD (clic en empleado → sus tareas)");
  const { data: cli } = await admin.from("clientes").select("id").limit(1).single();
  const { data: resp } = await admin.from("usuarios").select("id, nombre").eq("rol", "responsable").limit(1).single();
  await admin.from("tareas").insert({ titulo: `${TAG} tarea dashboard`, cliente_id: cli.id, responsable_id: resp.id, estado: "pendiente" });
  await p.goto(B + "/dashboard"); await p.waitForTimeout(1200);
  const fila = p.locator(`tr:has-text("${resp.nombre}")`).first();
  if (await fila.count()) {
    await fila.click(); await p.waitForTimeout(1200);
    chk("clic en empleado → /tareas filtrado por responsable", new URL(p.url()).pathname === "/tareas" && p.url().includes("responsable="));
  } else chk("hay fila de empleado en el dashboard para pulsar", false);

  // ============ M2 · PRESUPUESTO (IA, opcional) ============
  if (process.env.E2E_IA === "1") {
    section("M2 · PRESUPUESTO (generación IA → editor con IVA)");
    await p.goto(B + "/presupuestos/nuevo"); await p.waitForTimeout(600);
    await p.selectOption('select[name="cliente_id"]', { index: 1 }).catch(() => {});
    await p.fill('textarea[name="texto"]', "Alta de autónomo y certificado digital para un nuevo negocio.");
    await p.click('button:has-text("Generar presupuesto")');
    await p.waitForTimeout(9000);
    const m = p.url().match(/\/presupuestos\/([0-9a-f-]{36})/);
    chk("generar presupuesto → abre el editor", !!m);
    chk("el editor muestra IVA y líneas", (await p.locator("text=/IVA/").count()) > 0 && (await p.locator('input[name="concepto"]').count()) > 0);
    // El presupuesto IA no lleva la etiqueta en condiciones → se borra por id.
    if (m) await admin.from("presupuestos").delete().eq("id", m[1]);
  }

  chk("sin errores de JavaScript en el navegador (toda la sesión)", errs.length === 0);
  if (errs.length) errs.slice(0, 6).forEach((e) => console.log("     [pageerror]", e));
} catch (e) {
  console.log("  ✗ EXCEPCIÓN:", e.message);
  fail++;
} finally {
  await purgar();
  await browser.close();
}

console.log(`\n${fail === 0 ? "✓" : "✗"} E2E completo: ${pass} ok, ${fail} fallidos`);
process.exit(fail === 0 ? 0 : 1);
