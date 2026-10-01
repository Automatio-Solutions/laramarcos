// Llamadas a la app (/api/agente/*). Solo salientes, por HTTPS, con la clave del agente.
import type { ClienteCarpeta, InfoPagina } from "../../src/lib/ocr/core";

/** Vercel corta las peticiones en 4,5 MB: con el multipart, el fichero no debe pasar de esto. */
export const MAX_BYTES_ENVIO = 4_200_000;

/** Fallo de la app o de la red. `temporal` = merece la pena reintentar más tarde. */
export class ErrorApi extends Error {
  constructor(msg: string, readonly temporal: boolean, readonly estado?: number) {
    super(msg);
  }
}

export interface ResultadoFactura {
  duplicada: boolean;
  id: string;
  cliente_id: string | null;
  semaforo?: "verde" | "naranja" | "rojo";
}

export interface Libro {
  cliente_id: string;
  tipo: string;
  periodo: string;
  carpetaContabilidad: string | null;
}

export interface Api {
  enviarFactura(f: {
    contenido: Uint8Array;
    nombre: string;
    ruta: string;
    paginas?: { hashOrigen: string; desde: number; hasta: number; dudoso: boolean; numero: string | null; nif: string | null };
  }): Promise<ResultadoFactura>;
  describirPaginas(tanda: Uint8Array, desde: number): Promise<InfoPagina[]>;
  cambios(desde: string): Promise<{ hasta: string; completo: boolean; libros: Libro[] }>;
  excel(l: { cliente_id: string; tipo: string; periodo: string }): Promise<{ nombre: string; contenido: Uint8Array }>;
  /** Clientes activos de la app (para emparejar carpetas). */
  clientes(): Promise<ClienteCarpeta[]>;
}

const MIME: Record<string, string> = {
  pdf: "application/pdf", jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp", gif: "image/gif",
};
/** Copia a un ArrayBuffer propio (los tipos de Blob no aceptan buffers compartidos). */
const aBlob = (datos: Uint8Array, type: string) => new Blob([new Uint8Array(datos)], { type });

const mimeDe = (nombre: string) => MIME[nombre.toLowerCase().split(".").pop() ?? ""] ?? "application/octet-stream";

export function crearApi(base: string, clave: string, { timeoutMs = 90_000 } = {}): Api {
  async function llamar(ruta: string, init: RequestInit = {}): Promise<Response> {
    let res: Response;
    try {
      res = await fetch(base + ruta, {
        ...init,
        headers: { ...(init.headers ?? {}), Authorization: `Bearer ${clave}` },
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (e) {
      // Sin red, DNS, corte, tiempo agotado: todo temporal.
      throw new ErrorApi(`Sin conexión con la app (${(e as Error).message})`, true);
    }
    if (res.ok) return res;
    const cuerpo = await res.text().catch(() => "");
    let detalle = cuerpo.slice(0, 300);
    try { detalle = JSON.parse(cuerpo).error ?? detalle; } catch { /* texto plano */ }
    // 401: clave mal puesta. 429 y 5xx: la app o Vercel, de paso. Otros 4xx: el fichero no vale.
    const temporal = res.status === 429 || res.status >= 500;
    throw new ErrorApi(`La app respondió ${res.status}: ${detalle}`, temporal, res.status);
  }

  const json = async <T>(r: Response) => (await r.json()) as T;

  return {
    async enviarFactura(f) {
      const form = new FormData();
      form.set("archivo", aBlob(f.contenido, mimeDe(f.nombre)), f.nombre);
      form.set("ruta", f.ruta);
      if (f.paginas) {
        form.set("hash_origen", f.paginas.hashOrigen);
        form.set("pagina_desde", String(f.paginas.desde));
        form.set("pagina_hasta", String(f.paginas.hasta));
        form.set("corte_dudoso", f.paginas.dudoso ? "1" : "0");
        if (f.paginas.numero) form.set("numero_factura", f.paginas.numero);
        if (f.paginas.nif) form.set("nif_emisor", f.paginas.nif);
      }
      return json<ResultadoFactura>(await llamar("/api/agente/facturas", { method: "POST", body: form }));
    },

    async describirPaginas(tanda, desde) {
      const form = new FormData();
      form.set("archivo", aBlob(tanda, "application/pdf"), "tanda.pdf");
      form.set("desde", String(desde));
      const r = await json<{ paginas: InfoPagina[] }>(await llamar("/api/agente/describir-paginas", { method: "POST", body: form }));
      return r.paginas;
    },

    async cambios(desde) {
      return json(await llamar(`/api/agente/cambios?desde=${encodeURIComponent(desde)}`));
    },

    async clientes() {
      return (await json<{ clientes: ClienteCarpeta[] }>(await llamar("/api/agente/clientes"))).clientes;
    },

    async excel(l) {
      const q = new URLSearchParams({ cliente: l.cliente_id, tipo: l.tipo, periodo: l.periodo });
      const r = await llamar(`/api/agente/excel?${q}`);
      const cd = r.headers.get("content-disposition") ?? "";
      const nombre = decodeURIComponent(/filename\*=UTF-8''([^;]+)/i.exec(cd)?.[1] ?? "") || `${l.tipo} ${l.periodo}.xlsx`;
      return { nombre, contenido: new Uint8Array(await r.arrayBuffer()) };
    },
  };
}
