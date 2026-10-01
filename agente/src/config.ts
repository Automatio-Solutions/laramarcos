// Configuración del agente: config.json junto al ejecutable. Se puede cambiar
// (ruta, clientes, horario…) y reiniciar el servicio, sin reinstalar nada.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { rangoPeriodo } from "../../src/lib/ocr/core";

export interface Config {
  /** Carpeta raíz de la documentación, p. ej. D:\DocumentacionLM (mejor la ruta local que la de red). */
  raiz: string;
  /** Dirección de la app. */
  api: string;
  /** AGENTE_SECRET de la app. */
  clave: string;
  /** Nombres de carpeta de los clientes a procesar. Vacío = todos. */
  clientes: string[];
  /** Primer trimestre que se procesa ("2026-4T"): lo anterior no se toca. */
  desde: string;
  /** Cada cuánto se revisan las carpetas. */
  intervaloSegundos: number;
  /** Franja en la que trabaja (hora local del servidor). null = siempre. */
  horario: { desde: string; hasta: string } | null;
  /** Crear AÑO/TRIMESTRE/GASTOS/INGRESOS del trimestre en curso en cada cliente. */
  crearCarpetas: boolean;
  /** Facturas que se envían a la vez. */
  enParalelo: number;
  /** Un fichero solo se coge si lleva este tiempo sin cambiar (no leer uno a medio copiar). */
  segundosEstable: number;
}

const POR_DEFECTO: Omit<Config, "raiz" | "clave"> = {
  api: "https://crm.laramarcosasesores.es",
  clientes: [],
  desde: "2026-4T",
  intervaloSegundos: 120,
  horario: null,
  crearCarpetas: true,
  enParalelo: 2,
  segundosEstable: 60,
};

const HORA = /^([01]\d|2[0-3]):[0-5]\d$/;

/** Lee y valida config.json. Lanza un error legible si algo no cuadra. */
export function cargarConfig(dir: string): Config {
  const fichero = join(dir, "config.json");
  let bruto: Partial<Config>;
  try {
    bruto = JSON.parse(readFileSync(fichero, "utf8"));
  } catch (e) {
    throw new Error(`No se puede leer ${fichero}: ${(e as Error).message}`);
  }
  const c = { ...POR_DEFECTO, ...bruto } as Config;
  const fallos: string[] = [];
  if (!c.raiz) fallos.push("falta 'raiz' (p. ej. D:\\\\DocumentacionLM)");
  if (!c.clave || c.clave.length < 32) fallos.push("falta 'clave' o es demasiado corta (AGENTE_SECRET de la app)");
  if (!/^https?:\/\//.test(c.api)) fallos.push("'api' debe empezar por https://");
  if (!/^\d{4}-[1-4]T$/.test(c.desde) || !rangoPeriodo(c.desde)) fallos.push("'desde' debe ser un trimestre, p. ej. 2026-4T");
  if (!Array.isArray(c.clientes)) fallos.push("'clientes' debe ser una lista de nombres de carpeta");
  if (!(c.intervaloSegundos >= 30)) fallos.push("'intervaloSegundos' mínimo 30");
  if (!(c.enParalelo >= 1 && c.enParalelo <= 5)) fallos.push("'enParalelo' entre 1 y 5");
  if (!(c.segundosEstable >= 0)) fallos.push("'segundosEstable' no puede ser negativo");
  if (c.horario && (!HORA.test(c.horario.desde) || !HORA.test(c.horario.hasta))) {
    fallos.push("'horario' necesita 'desde' y 'hasta' en formato HH:MM");
  }
  if (fallos.length) throw new Error(`config.json no es válido:\n  - ${fallos.join("\n  - ")}`);
  c.api = c.api.replace(/\/+$/, "");
  return c;
}

/** ¿Toca trabajar ahora? La franja puede cruzar la medianoche (22:00-06:00). */
export function dentroDeHorario(c: Pick<Config, "horario">, ahora: Date): boolean {
  if (!c.horario) return true;
  const hhmm = `${String(ahora.getHours()).padStart(2, "0")}:${String(ahora.getMinutes()).padStart(2, "0")}`;
  const { desde, hasta } = c.horario;
  return desde <= hasta ? hhmm >= desde && hhmm < hasta : hhmm >= desde || hhmm < hasta;
}

/** La clave nunca se escribe entera en pantalla ni en el registro. */
export const claveOculta = (clave: string) => `${clave.slice(0, 4)}…${clave.slice(-4)} (${clave.length} caracteres)`;
