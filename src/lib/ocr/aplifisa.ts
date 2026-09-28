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

const ROJO = "FFC00000";

/**
 * Una hoja con las columnas del modelo. `aviso` pone un rótulo rojo encima de la
 * cabecera: solo en "Pendientes de revisar", que no se importa. La hoja
 * "Libro de Facturas" queda exactamente con el formato del modelo.
 */
function hojaLibro(
  wb: ExcelJS.Workbook,
  nombre: string,
  facturas: FacturaExcel[],
  { extra = [], aviso }: { extra?: string[]; aviso?: string } = {},
) {
  const filaCabecera = aviso ? 2 : 1;
  const ws = wb.addWorksheet(nombre, { views: [{ state: "frozen", ySplit: filaCabecera }] });
  const ncols = COLUMNAS_APLIFISA.length + extra.length;
  if (aviso) {
    const r = ws.addRow([aviso]);
    ws.mergeCells(1, 1, 1, ncols);
    r.height = 28;
    r.getCell(1).font = { bold: true, size: 13, color: { argb: "FFFFFFFF" } };
    r.getCell(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: ROJO } };
    r.getCell(1).alignment = { vertical: "middle" };
  }
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
  const ultimaCol = String.fromCharCode(64 + ncols);
  ws.autoFilter = `A${filaCabecera}:${ultimaCol}${Math.max(ws.rowCount, filaCabecera + 1)}`;
}

/** Libro de facturas de un cliente/tipo/periodo, ordenado por fecha. */
export async function generarExcelAplifisa(facturas: FacturaExcel[]): Promise<Buffer> {
  const clave = (f: FacturaExcel) => fechaDelLibro(f) ?? "9999";
  const porFecha = [...facturas].sort((a, b) => clave(a).localeCompare(clave(b)));
  const wb = new ExcelJS.Workbook();
  wb.creator = "LaraMarcos Asesores";
  hojaLibro(wb, "Libro de Facturas", porFecha.filter(esExportable));
  const pendientes = porFecha.filter((f) => !esExportable(f));
  if (pendientes.length) {
    const n = pendientes.length;
    hojaLibro(wb, "Pendientes de revisar", pendientes, {
      extra: ["Semáforo", "Archivo"],
      aviso: `⚠ ${n === 1 ? "FALTA 1 FACTURA" : `FALTAN ${n} FACTURAS`} POR REVISAR. No importes este libro en Aplifisa hasta revisarlas en la app.`,
    });
    // Quien abra el Excel cae en el aviso, no en el libro a medias.
    wb.views = [{ x: 0, y: 0, width: 20000, height: 12000, firstSheet: 0, activeTab: 1, visibility: "visible" }];
  }
  return Buffer.from(await wb.xlsx.writeBuffer());
}
