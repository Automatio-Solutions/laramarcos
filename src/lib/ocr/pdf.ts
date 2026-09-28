// Partir PDF (pdf-lib, JavaScript puro). Sin dependencias de servidor → testeable.
import { PDFDocument } from "pdf-lib";

const cargar = (pdf: Uint8Array) => PDFDocument.load(pdf, { ignoreEncryption: true });

export async function contarPaginas(pdf: Uint8Array): Promise<number> {
  return (await cargar(pdf)).getPageCount();
}

/** Copia las páginas `desde`..`hasta` (1 = primera, ambas incluidas) a un PDF nuevo. */
export async function extraerPaginas(pdf: Uint8Array, desde: number, hasta: number): Promise<Buffer> {
  const origen = await cargar(pdf);
  const total = origen.getPageCount();
  if (desde < 1 || hasta > total || desde > hasta) throw new Error(`Páginas fuera de rango: ${desde}-${hasta} de ${total}`);
  const nuevo = await PDFDocument.create();
  const indices = Array.from({ length: hasta - desde + 1 }, (_, i) => desde - 1 + i);
  for (const p of await nuevo.copyPages(origen, indices)) nuevo.addPage(p);
  return Buffer.from(await nuevo.save());
}
