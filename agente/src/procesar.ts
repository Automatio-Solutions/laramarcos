// Procesa un fichero de factura: si es un PDF con varias, lo separa (misma regla
// que la app: agruparPaginas) y manda cada factura por su lado.
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { agruparPaginas, type InfoPagina } from "../../src/lib/ocr/core";
import { contarPaginas, extraerPaginas } from "../../src/lib/ocr/pdf";
import { mimeFactura, PAGINAS_POR_TANDA } from "../../src/lib/ocr/subida";
import { ErrorApi, MAX_BYTES_ENVIO, type Api } from "./api";
import type { FicheroFactura } from "./carpetas";
import type { Log } from "./log";

export interface Resultado {
  /** hecho = no hay que volver a mandarlo; reintentar = algo falló de forma temporal. */
  estado: "hecho" | "reintentar";
  hash: string;
  resumen: string;
}

const MB = (n: number) => `${(n / 1_048_576).toFixed(1)} MB`;
const DEMASIADO_GRANDE = (n: number) =>
  `ocupa ${MB(n)} y el máximo para enviarla desde el servidor es ${MB(MAX_BYTES_ENVIO)}: súbela desde la app (admite hasta 45 MB)`;

/**
 * Describe las páginas de un PDF por tandas. Si una tanda pesa más de lo que
 * admite la app, la parte por la mitad; una sola página demasiado grande queda
 * "incierta" (su corte saldrá dudoso para revisarlo).
 */
async function describirPdf(api: Api, pdf: Uint8Array, n: number): Promise<InfoPagina[]> {
  const out: InfoPagina[] = [];
  async function tanda(desde: number, hasta: number): Promise<void> {
    const trozo = await extraerPaginas(pdf, desde, hasta);
    if (trozo.length > MAX_BYTES_ENVIO) {
      if (hasta > desde) {
        const medio = Math.floor((desde + hasta) / 2);
        await tanda(desde, medio);
        await tanda(medio + 1, hasta);
      } else {
        out.push({ pagina: desde, tipo: "inicio", numero_factura: null, nif_emisor: null, pagina_de: null, incierta: true });
      }
      return;
    }
    out.push(...(await api.describirPaginas(trozo, desde)));
  }
  for (let d = 1; d <= n; d += PAGINAS_POR_TANDA) await tanda(d, Math.min(d + PAGINAS_POR_TANDA - 1, n));
  return out;
}

export async function procesarFichero(
  f: FicheroFactura,
  api: Api,
  log: Log,
  { enviadoComo }: { enviadoComo?: (hash: string) => string | null } = {},
): Promise<Resultado> {
  const contenido = new Uint8Array(readFileSync(f.ruta));
  const hash = createHash("sha256").update(contenido).digest("hex");
  // El mismo fichero copiado o renombrado: ya se mandó, no se vuelve a separar ni a enviar.
  const otra = enviadoComo?.(hash);
  if (otra && otra !== f.rel) return { estado: "hecho", hash, resumen: `mismo contenido que ${otra}; no se reenvía` };
  const cuenta = { nuevas: 0, duplicadas: 0, temporales: 0, definitivos: 0 };
  const errores: string[] = [];

  /** Manda una factura; anota el resultado. 401 (clave mal) se propaga: hay que parar. */
  async function enviar(datos: Uint8Array, nombre: string, etiqueta: string, paginas?: Parameters<Api["enviarFactura"]>[0]["paginas"]) {
    if (datos.length > MAX_BYTES_ENVIO) {
      cuenta.definitivos++;
      errores.push(`${etiqueta}: ${DEMASIADO_GRANDE(datos.length)}`);
      return;
    }
    try {
      const r = await api.enviarFactura({ contenido: datos, nombre, ruta: f.rel, paginas });
      if (r.duplicada) cuenta.duplicadas++;
      else cuenta.nuevas++;
      if (!r.cliente_id) log.aviso(`${f.rel} (${etiqueta}): la app no ha encontrado el cliente de la carpeta; queda "Sin cliente".`);
    } catch (e) {
      if (e instanceof ErrorApi && e.estado === 401) throw e;
      if (e instanceof ErrorApi && e.temporal) cuenta.temporales++;
      else cuenta.definitivos++;
      errores.push(`${etiqueta}: ${(e as Error).message}`);
    }
  }

  let paginas = 1;
  if (mimeFactura(f.nombre) === "application/pdf") {
    try {
      paginas = await contarPaginas(contenido);
    } catch {
      // PDF que pdf-lib no abre (protegido, raro): se manda tal cual y que la app lo intente.
      paginas = 1;
    }
  }

  if (paginas > 1) {
    let grupos;
    try {
      grupos = agruparPaginas(await describirPdf(api, contenido, paginas));
    } catch (e) {
      if (e instanceof ErrorApi && e.estado === 401) throw e;
      const temporal = !(e instanceof ErrorApi) || e.temporal;
      return { estado: temporal ? "reintentar" : "hecho", hash, resumen: `no se pudo separar el PDF (${paginas} págs.): ${(e as Error).message}` };
    }
    if (grupos.length > 1) {
      log.info(`${f.rel}: ${paginas} páginas → ${grupos.length} facturas${grupos.some((g) => g.dudoso) ? " (algún corte dudoso)" : ""}`);
      for (const g of grupos) {
        const trozo = await extraerPaginas(contenido, g.desde, g.hasta);
        await enviar(new Uint8Array(trozo), f.nombre, `págs. ${g.desde}-${g.hasta}`, {
          hashOrigen: hash, desde: g.desde, hasta: g.hasta, dudoso: g.dudoso, numero: g.numero_factura, nif: g.nif_emisor,
        });
      }
    } else {
      await enviar(contenido, f.nombre, `${paginas} págs.`);
    }
  } else {
    await enviar(contenido, f.nombre, "factura");
  }

  const partes = [
    cuenta.nuevas && `${cuenta.nuevas} nueva${cuenta.nuevas > 1 ? "s" : ""}`,
    cuenta.duplicadas && `${cuenta.duplicadas} ya estaba${cuenta.duplicadas > 1 ? "n" : ""}`,
    cuenta.temporales && `${cuenta.temporales} por reintentar`,
    cuenta.definitivos && `${cuenta.definitivos} con error`,
  ].filter(Boolean);
  const resumen = partes.join(", ") + (errores.length ? ` — ${errores.join(" | ")}` : "");
  // Lo que falló de forma temporal se reintenta reenviando el fichero entero: la
  // app reconoce las que ya tiene (huella y nº de factura), así que no duplica.
  return { estado: cuenta.temporales ? "reintentar" : "hecho", hash, resumen };
}
