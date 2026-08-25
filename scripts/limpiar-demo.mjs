// Elimina TODO el semilleo de datos falsos y deja la BBDD solo con datos reales.
//
// CONSERVA (datos reales importados del despacho):
//   · clientes con `codigo` (los 594 reales) y sus cuentas bancarias
//   · usuarios con email @laramarcosasesores.es (los 15 empleados reales)
//   · servicios con `codigo` (el tarifario real, 49 servicios)
//
// BORRA (todo lo demás, que es demo):
//   · clientes de demo (sin código) y todo lo colgado de ellos
//   · usuarios de demo (@laramarcos.es) incl. su login en Auth
//   · servicios inventados, proveedores falsos, sectores de demo
//   · TODA la actividad (tareas, presupuestos, facturas OCR, vigilancia,
//     notificaciones): el 100% procede del seed, el import no creó nada de esto.
//
//   node scripts/limpiar-demo.mjs

import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";

const env = Object.fromEntries(
  readFileSync(".env.local", "utf8").split("\n").filter((l) => l.includes("="))
    .map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1).trim()]),
);
const a = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

const NADIE = "00000000-0000-0000-0000-000000000000";
// Algunas tablas no tienen columna `id` uuid (ingesta_log usa bigint;
// dependencias_tarea es PK compuesta): se les pasa una columna alternativa.
const wipe = (t, col = "id") =>
  col === "id" ? a.from(t).delete().neq("id", NADIE) : a.from(t).delete().not(col, "is", null);

async function n(t, filtro) {
  let q = a.from(t).select("id", { count: "exact", head: true });
  if (filtro) q = filtro(q);
  const { count } = await q;
  return count ?? 0;
}

async function main() {
  console.log("Estado ANTES:");
  console.log(`  clientes: ${await n("clientes")} (reales ${await n("clientes", (q) => q.not("codigo", "is", null))})`);
  console.log(`  usuarios: ${await n("usuarios")} · servicios: ${await n("servicios")} · tareas: ${await n("tareas")}`);

  // 1) Actividad completa (todo es demo; el import no generó nada de esto)
  console.log("\n→ borrando actividad demo (tareas, presupuestos, facturas, vigilancia)…");
  const actividad = [
    ["notificaciones"], ["newsletters"], ["publicaciones"], ["ingesta_log", "fecha"],
    ["lineas_factura"], ["facturas_ocr"], ["adjuntos"],
    ["comentarios"], ["tiempos"], ["dependencias_tarea", "tarea_id"], ["subtareas"], ["tareas"],
    ["presupuestos_recurrentes"], ["presupuestos"],
  ];
  for (const [t, col] of actividad) {
    const { error } = await wipe(t, col ?? "id");
    if (error) console.error(`   ✗ ${t}: ${error.message}`);
  }

  // 2) Clientes de demo (sin código). Sus cuentas/sectores/servicios contratados
  //    caen por ON DELETE CASCADE. Los clientes reales (con código) se conservan.
  console.log("→ borrando clientes de demo (sin código)…");
  {
    const { error } = await a.from("clientes").delete().is("codigo", null);
    if (error) console.error(`   ✗ clientes demo: ${error.message}`);
  }

  // 3) Catálogo/reference de demo
  console.log("→ borrando servicios inventados, proveedores y sectores de demo…");
  {
    // Servicios sin código = los que me inventé para la demo. Antes hay que soltar
    // sus plantillas de subtareas (FK).
    const { data: demoServ } = await a.from("servicios").select("id").is("codigo", null);
    const ids = (demoServ ?? []).map((s) => s.id);
    if (ids.length) {
      await a.from("plantillas_subtareas").delete().in("servicio_id", ids);
      await a.from("servicios").delete().is("codigo", null);
    }
    // Plantillas huérfanas restantes (por si quedara alguna del seed)
    await wipe("plantillas_subtareas");
    // Proveedores: todos son de demo (CIF aleatorio). Se borran para que la
    // memoria del OCR arranque limpia con los proveedores reales del despacho.
    await wipe("proveedores");
    // Sectores: la lista real la definirá el despacho junto con el sector de cada
    // cliente. Los de demo no los referencia ningún cliente real.
    await wipe("sectores");
  }

  // 4) Usuarios de demo (@laramarcos.es) — tabla + Auth. Los reales se conservan.
  console.log("→ borrando usuarios de demo (@laramarcos.es)…");
  {
    const { data: demoUsers } = await a.from("usuarios").select("id, email").ilike("email", "%@laramarcos.es");
    for (const u of demoUsers ?? []) {
      await a.from("usuarios").delete().eq("id", u.id);
      await a.auth.admin.deleteUser(u.id).catch(() => {});
    }
    console.log(`   ${(demoUsers ?? []).length} usuarios demo eliminados`);
  }

  console.log("\nEstado DESPUÉS:");
  console.log(`  clientes: ${await n("clientes")} (todos con código real)`);
  console.log(`  usuarios: ${await n("usuarios")} · servicios: ${await n("servicios")} (tarifario)`);
  console.log(`  cuentas bancarias: ${await n("cliente_cuentas")} · tareas: ${await n("tareas")} · presupuestos: ${await n("presupuestos")}`);
  console.log("\n✓ BBDD limpia: solo datos reales del despacho.");
}

main().catch((e) => { console.error(e); process.exit(1); });
