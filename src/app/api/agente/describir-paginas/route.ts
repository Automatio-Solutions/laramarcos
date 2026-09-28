import { autorizadoAgente, noAutorizado } from "@/lib/agente/auth";
import { contarPaginas, describirPaginas, PAGINAS_POR_TANDA } from "@/lib/ocr/separar";

export const maxDuration = 60;

/**
 * PDF con varias facturas (servidor del despacho). El programa parte el PDF en
 * tandas de hasta PAGINAS_POR_TANDA páginas y manda cada una aquí. Multipart:
 *   - archivo: la tanda (PDF)
 *   - desde:   nº de página, en el PDF completo, de la primera página de la tanda
 * Devuelve la descripción de cada página (numeradas como en el PDF completo). El
 * programa junta todas y agrupa con `agruparPaginas` (misma regla que la app).
 */
export async function POST(request: Request) {
  if (!autorizadoAgente(request)) return noAutorizado();
  const form = await request.formData().catch(() => null);
  const archivo = form?.get("archivo");
  const desde = Number(form?.get("desde") ?? 1);
  if (!(archivo instanceof File) || !Number.isInteger(desde) || desde < 1) {
    return Response.json({ error: "Faltan 'archivo' o 'desde'." }, { status: 400 });
  }
  const pdf = new Uint8Array(await archivo.arrayBuffer());
  try {
    const n = await contarPaginas(pdf);
    if (n > PAGINAS_POR_TANDA) {
      return Response.json({ error: `Máximo ${PAGINAS_POR_TANDA} páginas por tanda.` }, { status: 413 });
    }
    const paginas = (await describirPaginas(pdf, 1, n)).map((p) => ({ ...p, pagina: p.pagina + desde - 1 }));
    return Response.json({ paginas });
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 422 });
  }
}
