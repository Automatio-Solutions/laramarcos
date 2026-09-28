// Qué ficheros se aceptan como factura. Compartido entre navegador y servidor.

/**
 * Tamaño máximo por fichero. Un PDF con todas las facturas del trimestre
 * escaneadas pesa bastante; a la IA solo va cada factura por separado.
 */
export const MAX_BYTES_FACTURA = 45 * 1024 * 1024;
export const MAX_MB_FACTURA = 45;

const POR_EXTENSION: Record<string, string> = {
  pdf: "application/pdf",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  gif: "image/gif",
};

/**
 * Tipo MIME de la factura, o null si no es un PDF/imagen que la IA pueda leer.
 * Manda la extensión: al subir una carpeta el navegador a veces no informa el tipo.
 * (HEIC de iPhone no lo lee la IA: hay que exportarlo a JPG.)
 */
export function mimeFactura(nombre: string, tipo?: string | null): string | null {
  const ext = nombre.toLowerCase().split(".").pop() ?? "";
  return POR_EXTENSION[ext] ?? (tipo && Object.values(POR_EXTENSION).includes(tipo) ? tipo : null);
}

/** Páginas de un PDF combinado que se describen por llamada (Haiku: holgado en 60 s). */
export const PAGINAS_POR_TANDA = 8;

/** Ficheros del sistema que aparecen al subir carpetas y no hay que listar. */
export const esFicheroOculto = (nombre: string) =>
  nombre.startsWith(".") || /^(thumbs\.db|desktop\.ini)$/i.test(nombre);
