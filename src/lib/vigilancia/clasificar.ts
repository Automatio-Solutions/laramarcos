// Clasificación de publicaciones DOE/BOE por sector + urgencia (UC-302/303).
// Respaldo determinista por palabras clave. La clasificación con Claude vive en
// ./clasificar-ia.ts (clasificarLote), que cae aquí si no hay clave o si falla.

export interface SectorRef { id: string; nombre: string; }
export interface PublicacionRaw { titulo: string; resumen?: string; enlace?: string; }

function norm(s: string): string {
  return (s ?? "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
}

// Sinónimos por sector (clave = nombre del sector normalizado, tal y como está
// dado de alta en la tabla `sectores`: ver scripts/cargar-sectores.mjs).
const SINONIMOS: Record<string, string[]> = {
  "agricultura y ganaderia": [
    "agrario", "agricola", "ganaderia", "campo", "cultivo", "agroalimentari",
    "pac ", "olivar", "dehesa", "sanidad vegetal", "fitosanitari", "regadio",
    "sequia", "explotacion agraria",
  ],
  "hosteleria y turismo": [
    "bar", "restaurante", "turismo", "hotel", "hospedaje", "terraza",
    "alojamiento", "vivienda turistica",
  ],
  "construccion y reformas": [
    "obra", "edificacion", "reforma", "urbanismo", "licencia de obra",
    "rehabilitacion", "construccion",
  ],
  comercio: ["tienda", "minorista", "retail", "comerciante", "horario comercial", "etiquetado"],
  transporte: ["logistica", "mercancias", "vehiculo", "carretera", "tacografo", "transportista"],
  "salud y bienestar": ["sanitari", "clinica", "farmacia", "asistencial", "veterinari"],
  "industria y agroalimentario": [
    "industria", "fabrica", "envasado", "registro sanitario", "denominacion de origen",
    "manufactur",
  ],
  "servicios profesionales": ["colegio profesional", "consultoria", "asesoria", "profesional"],
  "inmobiliario y patrimonial": [
    "alquiler", "arrendamiento", "vivienda", "ibi", "plusvalia", "catastro", "inmobiliari",
  ],
  // Transversales: normativa que afecta por forma jurídica, no por actividad.
  "autonomos (reta)": [
    "autonomo", "reta", "cotizacion", "estimacion objetiva", "modulos",
    "trabajador por cuenta propia", "irpf",
  ],
  sociedades: [
    "impuesto sobre sociedades", "impuesto de sociedades", "mercantil",
    "cuentas anuales", "registro mercantil", "sociedad limitada",
  ],
};

const PALABRAS_URGENTES = ["plazo", "obligaci", "obligatori", "ayuda", "subvenci", "convocatoria", "requerimiento", "vencimiento"];

/** Devuelve el id del sector que mejor encaja con el texto, o null. */
export function clasificarPorSector(pub: PublicacionRaw, sectores: SectorRef[]): string | null {
  const t = norm(`${pub.titulo} ${pub.resumen ?? ""}`);
  for (const s of sectores) {
    const base = norm(s.nombre);
    const claves = [base, ...base.split(/\s+/).filter((w) => w.length >= 4), ...(SINONIMOS[base] ?? [])];
    if (claves.some((k) => k && t.includes(k))) return s.id;
  }
  return null;
}

export function esUrgente(pub: PublicacionRaw): boolean {
  const t = norm(`${pub.titulo} ${pub.resumen ?? ""}`);
  return PALABRAS_URGENTES.some((k) => t.includes(k));
}

/** Resumen accionable simple (plantilla). Con Claude se redacta en lenguaje claro. */
export function resumenAccionable(pub: PublicacionRaw): string {
  const partes = [pub.titulo.trim()];
  if (esUrgente(pub)) partes.push("Acción requerida: revisa el plazo o la obligación indicada.");
  if (pub.enlace) partes.push(`Texto oficial: ${pub.enlace}`);
  return partes.join(" ");
}

/**
 * Por encima de este tamaño, un sector deja de generar una tarea por cliente.
 *
 * El reparto por cliente es lo útil en un sector pequeño ("avisa a estos 8
 * agricultores, que se les acaba el plazo"). En uno grande es demoledor: los
 * transversales tienen 384 y 210 clientes, así que una sola publicación
 * urgente llenaría el tablero de cientos de tareas idénticas.
 */
export const UMBRAL_TAREA_UNICA = 30;

/**
 * Tope de tareas por ejecución. Red de seguridad para el caso patológico de
 * muchas publicaciones urgentes en sectores medianos el mismo día: a partir
 * de aquí todo pasa a tarea única.
 */
export const MAX_TAREAS_POR_EJECUCION = 100;

export type ModoTarea = "ninguna" | "por-cliente" | "unica";

/**
 * Decide cómo materializar el aviso de una publicación urgente.
 *
 * La tarea única no lleva responsable: quién se ocupa lo decide el
 * responsable del despacho desde el panel, nunca el agente.
 */
export function modoTareaUrgente(clientesEnSector: number, tareasYaCreadas = 0): ModoTarea {
  if (clientesEnSector <= 0) return "ninguna";
  if (clientesEnSector > UMBRAL_TAREA_UNICA) return "unica";
  if (tareasYaCreadas + clientesEnSector > MAX_TAREAS_POR_EJECUCION) return "unica";
  return "por-cliente";
}
