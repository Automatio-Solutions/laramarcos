import "server-only";
import { parsearRssDoe, extraerItemsBoe, dedupe, type ItemBoletin } from "./parsear";

/**
 * Descarga de los boletines directamente desde la app: sin n8n ni ninguna otra
 * pieza intermedia. Todo el pipeline de M3 vive dentro de este programa.
 *
 * - BOE: API de datos abiertos (JSON).
 * - DOE: feeds RSS por sección (XML en iso-8859-1).
 *
 * Ninguna de las dos lanza: si una fuente falla, se devuelve lo que se pudo
 * bajar de la otra y el fallo se registra en `ingesta_log` desde la ruta.
 */

/** Secciones del DOE: 0 estatales · 1 generales · 2 autoridades · 3 otras · 4 justicia · 5 anuncios. */
const SECCIONES_DOE = [0, 1, 2, 3, 4, 5];

const TIMEOUT_MS = 12_000;

async function bajar(url: string, headers?: Record<string, string>): Promise<Response> {
  return fetch(url, { headers, signal: AbortSignal.timeout(TIMEOUT_MS), cache: "no-store" });
}

export interface ResultadoFuente {
  items: ItemBoletin[];
  error?: string;
}

/** Sumario del BOE del día. `fecha` en formato YYYY-MM-DD. */
export async function descargarBoe(fecha: string): Promise<ResultadoFuente> {
  const yyyymmdd = fecha.replace(/-/g, "");
  try {
    const r = await bajar(`https://www.boe.es/datosabiertos/api/boe/sumario/${yyyymmdd}`, {
      Accept: "application/json",
    });
    // 404 = no hay boletín ese día (festivo o domingo). No es un error.
    if (r.status === 404) return { items: [] };
    if (!r.ok) return { items: [], error: `BOE respondió ${r.status}` };
    return { items: extraerItemsBoe(await r.json()) };
  } catch (err) {
    return { items: [], error: err instanceof Error ? err.message : "fallo al bajar el BOE" };
  }
}

/**
 * Disposiciones del DOE del día, recorriendo las seis secciones del RSS.
 *
 * El XML viene en iso-8859-1: hay que decodificarlo a mano, porque
 * `Response.text()` asume UTF-8 y destrozaría los acentos.
 */
export async function descargarDoe(fecha: string): Promise<ResultadoFuente> {
  const items: ItemBoletin[] = [];
  const fallos: string[] = [];

  const resultados = await Promise.allSettled(
    SECCIONES_DOE.map(async (s) => {
      const r = await bajar(`https://doe.juntaex.es/rss/rss.php?seccion=${s}`);
      if (!r.ok) throw new Error(`sección ${s}: HTTP ${r.status}`);
      const xml = new TextDecoder("iso-8859-1").decode(await r.arrayBuffer());
      return parsearRssDoe(xml, fecha);
    }),
  );

  for (const res of resultados) {
    if (res.status === "fulfilled") items.push(...res.value);
    else fallos.push(res.reason instanceof Error ? res.reason.message : "error");
  }

  // Solo se considera error si fallaron TODAS las secciones.
  const error = fallos.length === SECCIONES_DOE.length ? fallos.join("; ") : undefined;
  return { items, error };
}

/**
 * Baja los dos boletines del día y devuelve el lote ya deduplicado y recortado.
 * El tope existe para no agotar el tiempo de función del plan gratuito.
 */
export async function descargarBoletines(
  fecha: string,
  max = 60,
): Promise<{ items: ItemBoletin[]; errores: string[] }> {
  const [boe, doe] = await Promise.all([descargarBoe(fecha), descargarDoe(fecha)]);
  const errores = [boe.error, doe.error].filter((e): e is string => Boolean(e));
  // El DOE va primero: es normativa autonómica y afecta más directamente a la
  // cartera del despacho, así que si hay que recortar, se recorta el BOE.
  return { items: dedupe([...doe.items, ...boe.items], max), errores };
}
