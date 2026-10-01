// Estado del agente (datos\estado.json): qué ficheros se han enviado ya, cuáles
// reintentar y qué Excel quedan por escribir. Sobrevive a reinicios del servicio.
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export interface EstadoFichero {
  tam: number;
  mtimeMs: number;
  hash: string;
  /** hecho = enviado (o descartado para siempre); reintentar = falló algo temporal. */
  estado: "hecho" | "reintentar";
  intentos: number;
  /** No antes de esta fecha (espera creciente entre reintentos). */
  siguienteIntento?: string;
  /** Último resultado legible, para el registro y para revisar a mano. */
  resultado: string;
  actualizado: string;
}

export interface LibroPendiente {
  cliente_id: string;
  tipo: string;
  periodo: string;
  carpetaContabilidad: string;
}

export interface Estado {
  version: 1;
  /** Clave: ruta relativa a la raíz, con "/". */
  ficheros: Record<string, EstadoFichero>;
  /** Marca de la última consulta de cambios a la app (para regenerar Excel). */
  cambiosDesde: string;
  /** Excel que no se pudieron escribir (abiertos en ese momento): se reintentan. */
  excelPendientes: LibroPendiente[];
}

const NUEVO: Estado = { version: 1, ficheros: {}, cambiosDesde: "1970-01-01T00:00:00Z", excelPendientes: [] };

export class Almacen {
  readonly fichero: string;
  estado: Estado;

  constructor(dir: string) {
    const carpeta = join(dir, "datos");
    mkdirSync(carpeta, { recursive: true });
    this.fichero = join(carpeta, "estado.json");
    this.estado = existsSync(this.fichero)
      ? { ...NUEVO, ...JSON.parse(readFileSync(this.fichero, "utf8")) }
      : structuredClone(NUEVO);
  }

  /** Escritura atómica: un corte de luz a mitad no deja el estado roto. */
  guardar() {
    const tmp = `${this.fichero}.tmp`;
    writeFileSync(tmp, JSON.stringify(this.estado, null, 1));
    renameSync(tmp, this.fichero);
  }

  /** ¿Ya se envió un fichero con este contenido (aunque lo hayan copiado o renombrado)? */
  rutaConHash(hash: string): string | null {
    for (const [ruta, f] of Object.entries(this.estado.ficheros)) {
      if (f.hash === hash && f.estado === "hecho") return ruta;
    }
    return null;
  }

  anotarExcelPendiente(l: LibroPendiente) {
    const clave = (x: LibroPendiente) => `${x.cliente_id}|${x.tipo}|${x.periodo}`;
    if (!this.estado.excelPendientes.some((x) => clave(x) === clave(l))) this.estado.excelPendientes.push(l);
  }
}

/** Espera antes del siguiente intento: 2, 4, 8, 16… minutos (máx. 6 h). */
export function esperaReintento(intentos: number, ahora: Date): string {
  const minutos = Math.min(2 ** intentos, 360);
  return new Date(ahora.getTime() + minutos * 60_000).toISOString();
}

export const MAX_INTENTOS = 8;
