// Crea los sectores del despacho y clasifica la cartera (M3 · UC-303/304).
//
// Dos niveles de clasificación:
//
//  1. TRANSVERSAL — determinista, sin margen de error, sacado del CIF/NIF:
//     letra inicial = sociedad; dígito o NIE (X/Y/Z) = persona física.
//     Cubre el 100% de la cartera.
//
//  2. ACTIVIDAD — por palabras clave en la razón social, con criterio
//     CONSERVADOR: se prefiere dejar en blanco antes que arriesgar. Un cliente
//     mal clasificado recibe normativa que no le toca, y eso hace más daño que
//     no recibir nada. Lo que quede sin sector se completará con el epígrafe
//     de IAE que aporte el despacho.
//
// Idempotente: se puede ejecutar las veces que haga falta.
//   node scripts/cargar-sectores.mjs [--dry]

import { createClient } from "@supabase/supabase-js";
import { readFileSync, writeFileSync } from "node:fs";

const DRY = process.argv.includes("--dry");

const env = Object.fromEntries(
  readFileSync(".env.local", "utf8").split("\n").filter((l) => l.includes("="))
    .map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1).trim()]),
);
const a = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

// ---------------------------------------------------------------------------
// Sectores
// ---------------------------------------------------------------------------
const TRANSVERSALES = ["Autónomos (RETA)", "Sociedades"];

// El orden importa: gana la primera coincidencia, así que van de más
// específico a más genérico.
const ACTIVIDAD = [
  ["Agricultura y ganadería", [
    "agricol", "agrari", "ganader", "agropecuar", "olivar", "almazara", "dehesa",
    "sanidad vegetal", "fitosanitar", "porcino", "ovino", "vacuno", "apicol",
    "hortofrut", "viveros", "regadio", "explotaciones agr",
  ]],
  ["Hostelería y turismo", [
    " bar ", "restaurant", "cafeteria", "hotel", "hostal", "meson", "pizzer",
    "cerveceria", "catering", "casa rural", "taberna", "asador", "chiringuito",
    "gastrobar", "turismo rural",
  ]],
  ["Salud y bienestar", [
    "clinic", "dental", "odontolog", "fisioterap", "farmac", "optic", "psicolog",
    "podolog", "veterinar", "estetic", "peluquer", "gimnasio", "fitness",
    "ortoped", "residencia de mayores",
  ]],
  ["Transporte", [
    "transport", "logistic", "mensajer", " taxi", "autocar", "mudanz",
    "paqueter", "camiones",
  ]],
  ["Construcción y reformas", [
    "construc", "obras", "reforma", "albañil", "albanil", "fontaner",
    "carpinter", "excavac", "hormigon", "encofrad", "aislamient", "pladur",
    "azulejo", "parquet", "parket", "cubiertas", "tejados", "andamio",
    "climatizacion", "instalaciones electric", "prefabricad",
  ]],
  ["Industria y agroalimentario", [
    "industri", "fabrica", "embutid", "jamon", "queser", "panader", "confiter",
    "obrador", "carnic", "matader", "conserv", "envasad", "aceites", "bodega",
    "metalurg", "aserrader",
  ]],
  ["Inmobiliario y patrimonial", [
    "inmobil", "patrimonial", "inmuebles", "arrendamient", "alquileres",
  ]],
  ["Comercio", [
    "comercial", "supermercado", "distribu", "mayorista", "ferreteria",
    "libreria", "papeler", "estanco", "boutique", "calzado", "bazar", "tienda", " muebles",
  ]],
  ["Servicios profesionales", [
    "consult", "asesor", "abogad", "arquitect", "ingenier", "gestoria",
    "auditor", "informatic", "software", "digital", "marketing", "publicidad",
    "seguros", "mediador", "iuris", "abogacia", "academia", "formacion",
  ]],
];

const SECTORES = [...TRANSVERSALES, ...ACTIVIDAD.map(([n]) => n)];

const norm = (s) =>
  " " + (s ?? "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "") + " ";

/** Sociedad si el CIF empieza por letra de forma jurídica. */
const esSociedad = (cif) => /^[ABCDEFGHJNPQRSUVW]/.test((cif ?? "").toUpperCase().trim());

/**
 * En una persona física, "APELLIDOS, NOMBRE" es su nombre, no un rótulo
 * comercial: apellidos como Olivares o Cortijo la clasificarían como
 * agricultora. Si el autónomo opera con nombre comercial ("PANADERIA GOMEZ"),
 * no lleva coma y sí se analiza.
 *
 * La guarda NO se aplica a sociedades: ahí la coma solo separa la forma
 * jurídica ("PREMIUM PARQUET, S.L.").
 */
function esNombreDePersona(razonSocial) {
  return (razonSocial ?? "").includes(",");
}

/** Sector de actividad, o null si no hay una señal clara. */
function sectorActividad(razonSocial, esSoc) {
  if (!esSoc && esNombreDePersona(razonSocial)) return null;
  const n = norm(razonSocial);
  for (const [sector, claves] of ACTIVIDAD) {
    if (claves.some((k) => n.includes(k))) return sector;
  }
  return null;
}

// ---------------------------------------------------------------------------
async function main() {
  // 1) Sectores (upsert por nombre único)
  if (!DRY) {
    const { error } = await a.from("sectores").upsert(
      SECTORES.map((nombre) => ({ nombre })),
      { onConflict: "nombre", ignoreDuplicates: true },
    );
    if (error) throw new Error(`sectores: ${error.message}`);
  }
  const { data: secRows } = await a.from("sectores").select("id, nombre");
  const idDe = Object.fromEntries((secRows ?? []).map((s) => [s.nombre, s.id]));

  // 2) Clientes
  const { data: clientes, error: e2 } = await a
    .from("clientes")
    .select("id, cif, razon_social")
    .eq("activo", true);
  if (e2) throw new Error(`clientes: ${e2.message}`);

  const filas = [];
  const conteo = Object.fromEntries(SECTORES.map((s) => [s, 0]));
  const asignados = [];
  const sinActividad = [];

  for (const c of clientes) {
    const esSoc = esSociedad(c.cif);
    const transversal = esSoc ? "Sociedades" : "Autónomos (RETA)";
    filas.push({ cliente_id: c.id, sector_id: idDe[transversal] });
    conteo[transversal]++;

    const act = sectorActividad(c.razon_social, esSoc);
    if (act) {
      filas.push({ cliente_id: c.id, sector_id: idDe[act] });
      conteo[act]++;
      asignados.push([c.cif, c.razon_social, act]);
    } else {
      sinActividad.push([c.cif, c.razon_social, transversal]);
    }
  }

  // 3) Asignaciones (la PK compuesta evita duplicados al reejecutar)
  if (!DRY) {
    for (let i = 0; i < filas.length; i += 500) {
      const { error } = await a
        .from("cliente_sectores")
        .upsert(filas.slice(i, i + 500), { onConflict: "cliente_id,sector_id", ignoreDuplicates: true });
      if (error) throw new Error(`cliente_sectores: ${error.message}`);
    }
  }

  // 4) Informe
  console.log(`${DRY ? "[SIMULACIÓN] " : ""}Clientes procesados: ${clientes.length}\n`);
  console.log("=== transversal (determinista por CIF) ===");
  for (const s of TRANSVERSALES) console.log(`  ${String(conteo[s]).padStart(3)}  ${s}`);
  console.log("\n=== actividad (por razón social, criterio conservador) ===");
  for (const [s] of ACTIVIDAD) if (conteo[s]) console.log(`  ${String(conteo[s]).padStart(3)}  ${s}`);
  console.log(`\n  sin sector de actividad: ${sinActividad.length} de ${clientes.length}`);

  // Fichero de revisión para el despacho
  const md = [
    "# Sectorización de la cartera — revisión",
    "",
    `Generado por \`scripts/cargar-sectores.mjs\`. ${clientes.length} clientes activos.`,
    "",
    "El sector transversal (Autónomos / Sociedades) sale del CIF y no admite error.",
    "El de actividad sale de la razón social con criterio conservador: ante la duda, en blanco.",
    "",
    `## Asignados por nombre (${asignados.length}) — conviene repasarlos`,
    "",
    "| CIF | Cliente | Sector propuesto |",
    "|---|---|---|",
    ...asignados.map(([cif, rs, s]) => `| ${cif} | ${rs} | ${s} |`),
    "",
    `## Sin sector de actividad (${sinActividad.length}) — pendientes de IAE o de revisión manual`,
    "",
    "| CIF | Cliente | Transversal |",
    "|---|---|---|",
    ...sinActividad.map(([cif, rs, t]) => `| ${cif} | ${rs} | ${t} |`),
    "",
  ].join("\n");
  writeFileSync("doc/sectorizacion-revisar.md", md);
  console.log("\n  informe → doc/sectorizacion-revisar.md");
}

main().catch((e) => { console.error("✗", e.message); process.exit(1); });
