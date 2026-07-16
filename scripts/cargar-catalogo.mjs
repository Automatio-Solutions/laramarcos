// Carga el tarifario real de LaraMarcos Asesores en la tabla `servicios`.
// Fuente: hoja de tarifas aportada por el despacho (2026-07).
//
// Reglas de la hoja:
//  · La columna TOTAL es siempre BASE + 21% de IVA → aquí solo se guarda la BASE.
//  · Los marcados "POR HORA" salían con ▲ en el Excel (no se puede multiplicar
//    texto por 1,21): aquí van como unidad='hora' con su tarifa horaria.
//  · RSTS-006 (impresión) se confirmó a 0,15 € IVA INCLUIDO → base 0,1240.
//  · FSCL-013 se confirmó como tarifa horaria (90 €/hora).
//
// Idempotente: se puede ejecutar las veces que haga falta (upsert por código).
//   node scripts/cargar-catalogo.mjs

import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";

const env = Object.fromEntries(
  readFileSync(".env.local", "utf8").split("\n").filter((l) => l.includes("="))
    .map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1).trim()]),
);
const a = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

// [codigo, nombre, precio_base, unidad]
const CATALOGO = [
  // ---- Tareas fiscales ----
  ["FSCL-001", "Declaración censal Mod. 036/037", 50, "fijo"],
  ["FSCL-002", "Solicitud alta/baja R.O.I.", 30, "fijo"],
  ["FSCL-003", "Tramitación y obtención de certificado digital", 45, "fijo"],
  ["FSCL-004", "Visualización y atención de notificación AEAT", 50, "hora"],
  ["FSCL-005", "Obtención de carta de pago AEAT", 40, "fijo"],
  ["FSCL-006", "Solicitud de aplazamiento/fraccionamiento AEAT", 50, "fijo"],
  ["FSCL-007", "Representación ante inspección AEAT", 55, "hora"],
  ["FSCL-008", "Elaboración de contrato mercantil", 50, "hora"],
  ["FSCL-009", "Declaración anual IRPF - Mod. 100", 50, "fijo"],
  ["FSCL-010", "Solicitud de certificación AEAT", 25, "fijo"],
  ["FSCL-011", "Elaboración de minuta/acuerdos sociales", 250, "fijo"],
  ["FSCL-012", "Elaboración de factura electrónica", 25, "fijo"],
  ["FSCL-013", "Revisión contable", 90, "hora"],
  ["FSCL-014", "Revisión anual y cierre contable", 200, "fijo"],
  ["FSCL-015", "Elaboración y presentación de cuentas anuales", 150, "fijo"],
  ["FSCL-016", "Elaboración y presentación Mod. 600", 200, "fijo"],
  ["FSCL-017", "Solicitud de denominación social RMC", 45, "fijo"],
  ["FSCL-018", "Actas y certificaciones mercantiles", 55, "hora"],
  ["FSCL-019", "Consulta a especialista fiscal", 60, "fijo"],
  ["FSCL-999", "Otras gestiones fiscales varias", 100, "fijo"],

  // ---- Tareas laborales ----
  ["LBRL-001", "Alta/baja R.E.T.A.", 50, "fijo"],
  ["LBRL-002", "Alta/baja C.C.C. empresa", 35, "fijo"],
  ["LBRL-003", "Petición de boletines de pago en mano (autónomo y SS)", 10, "fijo"],
  ["LBRL-004", "Representación en inspección de trabajo", 60, "fijo"],
  ["LBRL-005", "Elaboración y tramitación de parte de accidente (Delta)", 20, "fijo"],
  ["LBRL-006", "Solicitud de aplazamiento en Seguridad Social", 50, "fijo"],
  ["LBRL-007", "Solicitud de pago único de prestación por desempleo", 50, "fijo"],
  ["LBRL-008", "Solicitud de I.T.", 20, "fijo"],
  ["LBRL-009", "Cambio de base de cotización", 18, "fijo"],
  ["LBRL-010", "Solicitud de cambio de domiciliación bancaria R.E.T.A.", 10, "fijo"],
  ["LBRL-011", "Alta/baja de trabajador continuamente", 10, "fijo"],
  ["LBRL-012", "Elaboración y tramitación de subvención", 70, "fijo"],
  ["LBRL-013", "Elaboración de proyecto/plan de viabilidad", 250, "fijo"],
  ["LBRL-014", "Alta exprés fuera de hora", 30, "fijo"],
  ["LBRL-015", "Solicitud de prestación por cese de actividad", 50, "fijo"],
  ["LBRL-016", "Tramitación E.R.T.E.", 150, "fijo"],
  ["LBRL-017", "Alta de empleada de hogar", 100, "fijo"],
  ["LBRL-018", "Presentación de solicitud de maternidad/paternidad", 50, "fijo"],
  ["LBRL-019", "Consulta a especialista laboral", 40, "fijo"],
  ["LBRL-999", "Otras gestiones laborales varias", 100, "fijo"],

  // ---- Otras gestiones ----
  ["RSTS-001", "Solicitud de licencia de apertura/cambio de titularidad", 100, "fijo"],
  ["RSTS-002", "Solicitud de veladores", 50, "fijo"],
  ["RSTS-003", "Alta de empresa en turismo o cambio de titularidad", 80, "fijo"],
  ["RSTS-004", "Gestión de escrituras en registros públicos", 50, "fijo"],
  ["RSTS-005", "Escrito de subsanación de licencias", 20, "fijo"],
  // 0,15 € IVA incluido (confirmado por el despacho) → base 0,15 / 1,21 = 0,1240
  ["RSTS-006", "Impresión de documentos (por documento)", 0.124, "unidad"],
  ["RSTS-007", "Confección y envío de encuesta del INE", 10, "fijo"],
  ["RSTS-008", "Solicitud de hoja de reclamaciones", 20, "fijo"],
  ["RSTS-009", "Renovación de certificado de inscripción de artesanos (Junta de Extremadura)", 50, "fijo"],
];

const CATEGORIA = { FSCL: "Fiscal", LBRL: "Laboral", RSTS: "Otras gestiones" };

const main = async () => {
  console.log(`→ cargando ${CATALOGO.length} servicios del tarifario real…`);
  let nuevos = 0, actualizados = 0;

  for (const [codigo, nombre, precio_base, unidad] of CATALOGO) {
    const categoria = CATEGORIA[codigo.split("-")[0]];
    const { data: existe } = await a.from("servicios").select("id").eq("codigo", codigo).maybeSingle();

    if (existe) {
      await a.from("servicios").update({ nombre, categoria, precio_base, unidad, activo: true }).eq("id", existe.id);
      actualizados++;
    } else {
      await a.from("servicios").insert({ codigo, nombre, categoria, precio_base, unidad, activo: true });
      nuevos++;
    }
  }

  // Los servicios sin código son los inventados de la demo y no están en el
  // tarifario del despacho: se desactivan para que la IA no los use al
  // presupuestar (no se borran: hay contratos de cliente que los referencian).
  const { data: sinCodigo } = await a.from("servicios").select("id, nombre").is("codigo", null).eq("activo", true);
  if (sinCodigo?.length) {
    await a.from("servicios").update({ activo: false }).is("codigo", null);
    console.log(`  ↳ ${sinCodigo.length} servicios de demo desactivados (no están en el tarifario): ${sinCodigo.map((s) => s.nombre).join(", ")}`);
  }

  const { count } = await a.from("servicios").select("id", { count: "exact", head: true }).eq("activo", true);
  const { count: horas } = await a.from("servicios").select("id", { count: "exact", head: true }).eq("unidad", "hora").eq("activo", true);
  console.log(`✓ ${nuevos} nuevos, ${actualizados} actualizados. Catálogo activo: ${count} servicios (${horas} por hora).`);
  console.log("  Los precios son BASE; el IVA (21%) lo calcula el presupuesto.");
};

main().catch((e) => { console.error(e); process.exit(1); });
