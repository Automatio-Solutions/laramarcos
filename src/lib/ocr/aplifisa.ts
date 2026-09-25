// UC-404 AC-07: genera el Excel con el formato del "MODELO LIBRO FACTURAS.xlsx" del despacho.
// Hoja 1 "Libro de Facturas": solo lo que se puede importar (revisado o verde).
// Hoja 2 "Pendientes de revisar": lo que falta, para que se vea que el trimestre no está completo.
import ExcelJS from "exceljs";
import { COLUMNAS_APLIFISA, esExportable, filaAplifisa, semaforo, type FacturaDatos } from "./core";

export interface FacturaExcel extends FacturaDatos {
  revisada: boolean;
  confianza: number;
  archivo_nombre: string | null;
}

// Anchos y formatos copiados del modelo.
const ANCHOS = [14, 16, 30, 14, 18, 16, 10, 14, 16, 16, 16, 16];
const EUR = "#,##0.00 _€";
const FORMATOS = ["dd/mm/yyyy", "@", "@", "@", "@", EUR, "0%", EUR, EUR, "0%", EUR, EUR];
const NARANJA = "FFFFC000";
const AZUL = "FF0000FF";

function hojaLibro(wb: ExcelJS.Workbook, nombre: string, facturas: FacturaExcel[], extra: string[] = []) {
  const ws = wb.addWorksheet(nombre, { views: [{ state: "frozen", ySplit: 1 }] });
  const cabecera = ws.addRow([...COLUMNAS_APLIFISA, ...extra]);
  cabecera.eachCell((c) => {
    c.font = { bold: true, color: { argb: "FF000000" } };
    c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: NARANJA } };
  });
  ANCHOS.forEach((w, i) => (ws.getColumn(i + 1).width = w));
  extra.forEach((_, i) => (ws.getColumn(ANCHOS.length + i + 1).width = 18));

  for (const f of facturas) {
    const fila = ws.addRow([
      ...filaAplifisa(f),
      ...(extra.length ? [`${semaforo(f.confianza)} (${f.confianza}%)`, f.archivo_nombre ?? ""] : []),
    ]);
    FORMATOS.forEach((fmt, i) => {
      const c = fila.getCell(i + 1);
      c.numFmt = fmt;
      // Como en el modelo: azul lo que viene de la factura, negro lo calculado.
      c.font = { color: { argb: i <= 6 ? AZUL : "FF000000" } };
    });
  }
  const ultimaCol = String.fromCharCode(64 + COLUMNAS_APLIFISA.length + extra.length);
  ws.autoFilter = `A1:${ultimaCol}${Math.max(ws.rowCount, 2)}`;
}

/** Libro de facturas de un cliente/periodo, ordenado por fecha de expedición. */
export async function generarExcelAplifisa(facturas: FacturaExcel[]): Promise<Buffer> {
  const porFecha = [...facturas].sort((a, b) => (a.fecha ?? "9999").localeCompare(b.fecha ?? "9999"));
  const wb = new ExcelJS.Workbook();
  wb.creator = "LaraMarcos Asesores";
  hojaLibro(wb, "Libro de Facturas", porFecha.filter(esExportable));
  const pendientes = porFecha.filter((f) => !esExportable(f));
  if (pendientes.length) hojaLibro(wb, "Pendientes de revisar", pendientes, ["Semáforo", "Archivo"]);
  return Buffer.from(await wb.xlsx.writeBuffer());
}
