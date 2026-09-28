// UC-404 AC-07: genera el Excel con el formato del "MODELO LIBRO FACTURAS.xlsx" del despacho.
// Hoja 1 "Libro de Facturas": solo lo que se puede importar (revisado o verde).
// Hoja 2 "Pendientes de revisar": lo que falta, para que se vea que el trimestre no está completo.
import ExcelJS from "exceljs";
import { COLUMNAS_APLIFISA, esExportable, fechaDelLibro, filasAplifisa, semaforo, type FacturaDatos } from "./core";

export interface FacturaExcel extends FacturaDatos {
  revisada: boolean;
  confianza: number;
  archivo_nombre: string | null;
}

// Anchos y formatos copiados del modelo (+ "Subcuenta Gasto/Ingreso" y "Sujeto Pasivo").
// Los porcentajes van como 21 con dos decimales, como los escribe el despacho.
const ANCHOS = [14, 16, 30, 14, 14, 22, 16, 10, 14, 16, 12, 16, 16, 14];
const EUR = "#,##0.00 _€";
const PCT = "0.00";
const FORMATOS = ["dd/mm/yyyy", "@", "@", "@", "@", "@", EUR, PCT, EUR, EUR, PCT, EUR, EUR, "@"];
/** Columnas que vienen de la factura (azul en el modelo); el resto, calculadas (negro). */
const DE_ENTRADA = new Set([0, 1, 2, 3, 4, 5, 6, 7, 13]);
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
    // Una fila por tipo de IVA.
    for (const celdas of filasAplifisa(f)) {
      const fila = ws.addRow([
        ...celdas,
        ...(extra.length ? [`${semaforo(f.confianza)} (${f.confianza}%)`, f.archivo_nombre ?? ""] : []),
      ]);
      FORMATOS.forEach((fmt, i) => {
        const c = fila.getCell(i + 1);
        c.numFmt = fmt;
        c.font = { color: { argb: DE_ENTRADA.has(i) ? AZUL : "FF000000" } };
      });
    }
  }
  const ultimaCol = String.fromCharCode(64 + COLUMNAS_APLIFISA.length + extra.length);
  ws.autoFilter = `A1:${ultimaCol}${Math.max(ws.rowCount, 2)}`;
}

/** Libro de facturas de un cliente/tipo/periodo, ordenado por fecha. */
export async function generarExcelAplifisa(facturas: FacturaExcel[]): Promise<Buffer> {
  const clave = (f: FacturaExcel) => fechaDelLibro(f) ?? "9999";
  const porFecha = [...facturas].sort((a, b) => clave(a).localeCompare(clave(b)));
  const wb = new ExcelJS.Workbook();
  wb.creator = "LaraMarcos Asesores";
  hojaLibro(wb, "Libro de Facturas", porFecha.filter(esExportable));
  const pendientes = porFecha.filter((f) => !esExportable(f));
  if (pendientes.length) hojaLibro(wb, "Pendientes de revisar", pendientes, ["Semáforo", "Archivo"]);
  return Buffer.from(await wb.xlsx.writeBuffer());
}
