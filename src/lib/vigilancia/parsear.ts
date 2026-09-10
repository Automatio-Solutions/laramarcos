/**
 * Parseo de los boletines oficiales. Funciones puras (sin red) para poder
 * probarlas en tests/unit/vigilancia-fuentes.test.ts. La descarga vive en
 * ./fuentes.ts.
 */

export interface ItemBoletin {
  boletin: string; // DOE | BOE
  titulo: string;
  resumen?: string;
  enlace?: string;
}

/** Quita CDATA, etiquetas sueltas y entidades básicas de un nodo RSS. */
export function limpiarTexto(s: string): string {
  return s
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function nodo(item: string, tag: string): string | undefined {
  const m = item.match(new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`, "i"));
  return m ? limpiarTexto(m[1]) : undefined;
}

/**
 * Parsea un RSS del DOE (doe.juntaex.es/rss/rss.php?seccion=N).
 *
 * El feed arrastra publicaciones de varios días, así que se filtra por
 * `fecha` (pubDate viene como YYYY-MM-DD). Sin fecha, devuelve todo.
 */
export function parsearRssDoe(xml: string, fecha?: string): ItemBoletin[] {
  const items = xml.match(/<item>[\s\S]*?<\/item>/gi) ?? [];
  const out: ItemBoletin[] = [];
  for (const raw of items) {
    const titulo = nodo(raw, "title");
    if (!titulo || titulo.length < 10) continue;
    if (fecha) {
      const pub = nodo(raw, "pubDate") ?? "";
      if (!pub.startsWith(fecha)) continue;
    }
    out.push({
      boletin: "DOE",
      titulo,
      resumen: nodo(raw, "description"),
      enlace: nodo(raw, "link"),
    });
  }
  return out;
}

/**
 * Extrae {titulo, enlace} del sumario del BOE recorriendo su JSON, que viene
 * muy anidado y con una estructura que cambia según la sección.
 */
export function extraerItemsBoe(node: unknown, out: ItemBoletin[] = []): ItemBoletin[] {
  if (!node || typeof node !== "object") return out;
  if (Array.isArray(node)) {
    for (const n of node) extraerItemsBoe(n, out);
    return out;
  }
  const o = node as Record<string, unknown>;
  if (typeof o.titulo === "string" && o.titulo.length > 10) {
    let enlace: string | undefined;
    if (typeof o.url_html === "string") {
      enlace = o.url_html;
    } else if (o.url_pdf && typeof o.url_pdf === "object") {
      const texto = (o.url_pdf as Record<string, unknown>).texto;
      if (typeof texto === "string") enlace = texto;
    }
    out.push({ boletin: "BOE", titulo: o.titulo, enlace });
  }
  for (const v of Object.values(o)) extraerItemsBoe(v, out);
  return out;
}

/** Quita duplicados por enlace (o por título si no hay enlace) y recorta el lote. */
export function dedupe(items: ItemBoletin[], max: number): ItemBoletin[] {
  const vistos = new Set<string>();
  const out: ItemBoletin[] = [];
  for (const it of items) {
    const clave = `${it.boletin}|${it.enlace ?? it.titulo}`;
    if (vistos.has(clave)) continue;
    vistos.add(clave);
    out.push(it);
    if (out.length >= max) break;
  }
  return out;
}
