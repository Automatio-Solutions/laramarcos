// Exporta la cartera por oficina para que el despacho complete el sector
// de cada cliente (y, de paso, el enlace a su carpeta en la nube).
//
// Un CSV por oficina, con separador ';' y BOM UTF-8: así Excel en español
// los abre en columnas y con los acentos correctos al hacer doble clic.
//
//   node scripts/exportar-sectorizacion.mjs

import { createClient } from "@supabase/supabase-js";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";

const env = Object.fromEntries(
  readFileSync(".env.local", "utf8").split("\n").filter((l) => l.includes("="))
    .map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1).trim()]),
);
const a = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

const SECTORES_VALIDOS = [
  "Agricultura y ganadería", "Hostelería y turismo", "Construcción y reformas",
  "Comercio", "Transporte", "Industria y agroalimentario",
  "Servicios profesionales", "Salud y bienestar", "Inmobiliario y patrimonial",
];

const csv = (v) => {
  const s = String(v ?? "");
  return /[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

const { data: clientes, error } = await a
  .from("clientes")
  .select("cif, razon_social, oficina, email, carpeta_url, cliente_sectores(sectores(nombre))")
  .eq("activo", true)
  .order("razon_social");
if (error) { console.error("✗", error.message); process.exit(1); }

mkdirSync("doc/sectorizacion", { recursive: true });

const porOficina = new Map();
for (const c of clientes) {
  const of = c.oficina ?? "Sin oficina";
  if (!porOficina.has(of)) porOficina.set(of, []);
  porOficina.get(of).push(c);
}

const CABECERA = [
  "CIF", "Cliente", "Tipo", "Sector propuesto", "SECTOR (rellenar)",
  "Email", "ENLACE CARPETA (rellenar)",
];

let total = 0;
for (const [oficina, lista] of [...porOficina].sort((x, y) => y[1].length - x[1].length)) {
  const filas = [CABECERA.join(";")];
  for (const c of lista) {
    const sectores = (c.cliente_sectores ?? []).map((r) => r.sectores?.nombre).filter(Boolean);
    const tipo = sectores.find((s) => s === "Sociedades" || s === "Autónomos (RETA)") ?? "";
    const actividad = sectores.filter((s) => s !== "Sociedades" && s !== "Autónomos (RETA)").join(" / ");
    filas.push([
      c.cif, c.razon_social, tipo, actividad, "", c.email ?? "", c.carpeta_url ?? "",
    ].map(csv).join(";"));
  }
  const nombre = `doc/sectorizacion/${oficina.toLowerCase().replace(/\s+/g, "-")}.csv`;
  writeFileSync(nombre, "﻿" + filas.join("\r\n") + "\r\n");
  console.log(`  ${String(lista.length).padStart(3)} clientes → ${nombre}`);
  total += lista.length;
}

writeFileSync(
  "doc/sectorizacion/LEEME.txt",
  [
    "SECTORIZACIÓN DE LA CARTERA — instrucciones",
    "",
    "Un fichero por oficina. Ábrelos con Excel (doble clic).",
    "",
    "Hay dos columnas que rellenar:",
    "",
    "  · SECTOR (rellenar): la actividad del cliente. Usa EXACTAMENTE uno de estos:",
    ...SECTORES_VALIDOS.map((s) => `      - ${s}`),
    "    Si un cliente no encaja en ninguno, déjalo vacío.",
    "    Si encaja en dos, sepáralos con ' / '.",
    "",
    "  · ENLACE CARPETA (rellenar): la dirección de la carpeta del cliente en la nube.",
    "    Se pega tal cual (https://...). Aparecerá como enlace en su ficha.",
    "",
    "Las columnas 'Tipo' y 'Sector propuesto' ya vienen rellenas: NO hay que tocarlas.",
    "  - Tipo sale del CIF y no falla.",
    "  - Sector propuesto es una deducción del nombre; si está mal, corrígelo en",
    "    la columna SECTOR.",
    "",
    "Al devolver los ficheros se cargan en la plataforma sin más trabajo manual.",
    "",
  ].join("\n"),
);
console.log(`\n  ${total} clientes exportados · instrucciones en doc/sectorizacion/LEEME.txt`);
