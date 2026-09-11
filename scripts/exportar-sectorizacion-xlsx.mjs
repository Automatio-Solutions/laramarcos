// Genera un Excel por oficina con los clientes que quedan por sectorizar,
// con la columna SECTOR como desplegable.
//
// El desplegable se define por referencia a una hoja aparte ("Sectores"), no
// como lista escrita en la propia validación: así no choca con el límite de
// 255 caracteres de Excel y además el despacho ve la lista de opciones.
//
//   node scripts/exportar-sectorizacion-xlsx.mjs

import ExcelJS from "exceljs";
import { createClient } from "@supabase/supabase-js";
import { readFileSync, mkdirSync } from "node:fs";

const env = Object.fromEntries(
  readFileSync(".env.local", "utf8").split("\n").filter((l) => l.includes("="))
    .map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1).trim()]),
);
const a = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

/** Los 9 sectores de actividad. Los transversales no van: ya están puestos. */
const SECTORES = [
  "Agricultura y ganadería",
  "Hostelería y turismo",
  "Construcción y reformas",
  "Comercio",
  "Transporte",
  "Industria y agroalimentario",
  "Servicios profesionales",
  "Salud y bienestar",
  "Inmobiliario y patrimonial",
];

const TRANSVERSALES = new Set(["Autónomos (RETA)", "Sociedades"]);

const NAVY = "FF1F223E";
const GRIS = "FFF1F2F4";

const { data: clientes, error } = await a
  .from("clientes")
  .select("cif, razon_social, oficina, email, carpeta_url, cliente_sectores(sectores(nombre))")
  .eq("activo", true)
  .order("razon_social");
if (error) { console.error("✗", error.message); process.exit(1); }

// Solo los que NO tienen sector de actividad todavía.
const pendientes = clientes.filter((c) => {
  const secs = (c.cliente_sectores ?? []).map((r) => r.sectores?.nombre).filter(Boolean);
  return !secs.some((s) => !TRANSVERSALES.has(s));
});

const porOficina = new Map();
for (const c of pendientes) {
  const of = c.oficina ?? "Sin oficina";
  if (!porOficina.has(of)) porOficina.set(of, []);
  porOficina.get(of).push(c);
}

mkdirSync("doc/sectorizacion", { recursive: true });

for (const [oficina, lista] of [...porOficina].sort((x, y) => y[1].length - x[1].length)) {
  const wb = new ExcelJS.Workbook();
  wb.creator = "LaraMarcos Asesores";
  wb.created = new Date();

  // --- Hoja de opciones (origen del desplegable) ---
  const hojaSec = wb.addWorksheet("Sectores");
  hojaSec.getColumn(1).width = 32;
  hojaSec.addRow(["SECTORES DISPONIBLES"]).font = { bold: true, color: { argb: NAVY } };
  SECTORES.forEach((s) => hojaSec.addRow([s]));
  hojaSec.addRow([]);
  hojaSec.addRow(["No cambies esta hoja: alimenta el desplegable."]).font = {
    italic: true, size: 9, color: { argb: "FF6E7585" },
  };

  // --- Hoja de clientes ---
  const ws = wb.addWorksheet(oficina, {
    views: [{ state: "frozen", ySplit: 1 }],
  });

  ws.columns = [
    { header: "CIF / NIF", key: "cif", width: 14 },
    { header: "Cliente", key: "cliente", width: 46 },
    { header: "Tipo", key: "tipo", width: 18 },
    { header: "SECTOR (elegir)", key: "sector", width: 30 },
    { header: "Email", key: "email", width: 30 },
    { header: "ENLACE CARPETA (pegar)", key: "carpeta", width: 34 },
  ];

  const cab = ws.getRow(1);
  cab.font = { bold: true, color: { argb: "FFFFFFFF" }, size: 11 };
  cab.fill = { type: "pattern", pattern: "solid", fgColor: { argb: NAVY } };
  cab.alignment = { vertical: "middle" };
  cab.height = 22;

  for (const c of lista) {
    const secs = (c.cliente_sectores ?? []).map((r) => r.sectores?.nombre).filter(Boolean);
    ws.addRow({
      cif: c.cif,
      cliente: c.razon_social,
      tipo: secs.find((s) => TRANSVERSALES.has(s)) ?? "",
      sector: "",
      email: c.email ?? "",
      carpeta: c.carpeta_url ?? "",
    });
  }

  const ultima = lista.length + 1;

  // Un único rango de validación para toda la columna SECTOR. Asignarla celda
  // a celda hace que exceljs emita rangos solapados, y Excel puede avisar de
  // "contenido no legible" al abrir el fichero.
  ws.dataValidations.add(`D2:D${ultima}`, {
    type: "list",
    allowBlank: true,
    formulae: [`Sectores!$A$2:$A$${SECTORES.length + 1}`],
    showErrorMessage: true,
    errorStyle: "stop",
    errorTitle: "Sector no válido",
    error: "Elige uno de la lista desplegable. Si el cliente no encaja en ninguno, déjalo vacío.",
    promptTitle: "Sector del cliente",
    prompt: "Elige la actividad principal. Si no encaja en ninguno, déjalo vacío.",
    showInputMessage: true,
  });

  // Sombreado de las dos columnas que hay que rellenar.
  for (let f = 2; f <= ultima; f++) {
    for (const col of ["D", "F"]) {
      ws.getCell(`${col}${f}`).fill = {
        type: "pattern", pattern: "solid", fgColor: { argb: GRIS },
      };
    }
  }

  ws.autoFilter = { from: "A1", to: `F${ultima}` };

  const nombre = `doc/sectorizacion/${oficina.toLowerCase().replace(/\s+/g, "-")}.xlsx`;
  await wb.xlsx.writeFile(nombre);
  console.log(`  ${String(lista.length).padStart(3)} clientes → ${nombre}`);
}

console.log(`\n  ${pendientes.length} clientes pendientes de sectorizar, en ${porOficina.size} ficheros`);
