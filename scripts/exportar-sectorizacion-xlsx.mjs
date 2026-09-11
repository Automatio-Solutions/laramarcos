// Genera un Excel por oficina con los clientes que quedan por sectorizar.
//
// Solo la lista: CIF y nombre. Los clientes que ya tienen sector de actividad
// no salen, para no repetir trabajo hecho.
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

/** Estos dos se asignan solos por CIF: tenerlos no es estar sectorizado. */
const TRANSVERSALES = new Set(["Autónomos (RETA)", "Sociedades"]);

const NAVY = "FF1F223E";

const { data: clientes, error } = await a
  .from("clientes")
  .select("cif, razon_social, oficina, cliente_sectores(sectores(nombre))")
  .eq("activo", true)
  .order("razon_social");
if (error) { console.error("✗", error.message); process.exit(1); }

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

  const ws = wb.addWorksheet(oficina, { views: [{ state: "frozen", ySplit: 1 }] });
  ws.columns = [
    { header: "CIF / NIF", key: "cif", width: 16 },
    { header: "Cliente", key: "cliente", width: 52 },
  ];

  const cab = ws.getRow(1);
  cab.font = { bold: true, color: { argb: "FFFFFFFF" }, size: 11 };
  cab.fill = { type: "pattern", pattern: "solid", fgColor: { argb: NAVY } };
  cab.alignment = { vertical: "middle" };
  cab.height = 22;

  for (const c of lista) ws.addRow({ cif: c.cif, cliente: c.razon_social });

  ws.autoFilter = { from: "A1", to: `B${lista.length + 1}` };

  const nombre = `doc/sectorizacion/${oficina.toLowerCase().replace(/\s+/g, "-")}.xlsx`;
  await wb.xlsx.writeFile(nombre);
  console.log(`  ${String(lista.length).padStart(3)} clientes → ${nombre}`);
}

console.log(`\n  ${pendientes.length} clientes pendientes, en ${porOficina.size} ficheros`);
