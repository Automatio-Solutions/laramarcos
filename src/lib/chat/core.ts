// Lógica pura del chat interno (US-06). Sin Supabase, sin React: testeable con node:test.
// Todas las fechas se interpretan en la zona horaria del despacho (Europe/Madrid).

/** Mensajes que se cargan por página al paginar hacia atrás. */
export const MENSAJES_POR_PAGINA = 50;
/** Tamaño de página al rellenar el hueco tras una reconexión de Realtime. */
export const MENSAJES_POR_RELLENO = 200;

/** Longitud máxima de un mensaje, en caracteres. */
export const MAX_LONGITUD_MENSAJE = 5000;

const ZONA = "Europe/Madrid";

const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
const MESES_LARGOS = [
  "enero", "febrero", "marzo", "abril", "mayo", "junio",
  "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
];
const DIAS_SEMANA = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];

const fmtMadrid = new Intl.DateTimeFormat("en-GB", {
  timeZone: ZONA,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

interface PartesMadrid {
  anio: number;
  mes: number; // 1-12
  dia: number;
  hora: string; // HH
  minuto: string; // mm
  fecha: string; // YYYY-MM-DD
}

/** Descompone un instante en sus partes de calendario en Madrid. */
function partesMadrid(d: Date): PartesMadrid {
  const p: Record<string, string> = {};
  for (const { type, value } of fmtMadrid.formatToParts(d)) p[type] = value;
  const anio = Number(p.year);
  const mes = Number(p.month);
  const dia = Number(p.day);
  return {
    anio,
    mes,
    dia,
    hora: p.hour,
    minuto: p.minute,
    fecha: `${p.year}-${p.month}-${p.day}`,
  };
}

/** Número de día absoluto (UTC) de una fecha "YYYY-MM-DD", para restar fechas de calendario. */
function numeroDia(fecha: string): number {
  return Math.floor(Date.parse(`${fecha}T00:00:00Z`) / 86_400_000);
}

/** Fecha de calendario en Madrid ("YYYY-MM-DD") de un timestamp ISO. */
export function diaMadrid(iso: string): string {
  return partesMadrid(new Date(iso)).fecha;
}

/**
 * Normaliza un texto para búsquedas: minúsculas, sin tildes/diacríticos,
 * espacios colapsados y sin espacios en los extremos.
 */
export function normalizaBusqueda(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Filtra el directorio de compañeros por nombre, sin distinguir mayúsculas ni tildes
 * ("jose" encuentra "José Ángel"). Una búsqueda vacía devuelve la lista completa.
 */
export function filtraDirectorio<T extends { nombre: string }>(lista: T[], q: string): T[] {
  const nq = normalizaBusqueda(q);
  if (!nq) return lista.slice();
  return lista.filter((x) => normalizaBusqueda(x.nombre).includes(nq));
}

/**
 * Hora de un mensaje para mostrar en el hilo (zona Europe/Madrid):
 * - mismo día → "14:05"
 * - día anterior → "ayer 14:05"
 * - mismo año → "3 sep 14:05"
 * - otro año → "3 sep 2025 14:05"
 */
export function formatoHoraMensaje(iso: string, ahora: Date = new Date()): string {
  const m = partesMadrid(new Date(iso));
  const h = partesMadrid(ahora);
  const hora = `${m.hora}:${m.minuto}`;
  const diff = numeroDia(h.fecha) - numeroDia(m.fecha);
  if (diff === 0) return hora;
  if (diff === 1) return `ayer ${hora}`;
  const base = `${m.dia} ${MESES[m.mes - 1]}`;
  return m.anio === h.anio ? `${base} ${hora}` : `${base} ${m.anio} ${hora}`;
}

/**
 * Agrupa mensajes consecutivos por día de calendario en Madrid ("YYYY-MM-DD"),
 * respetando el orden de entrada.
 */
export function agrupaPorDia<T extends { created_at: string }>(
  mensajes: T[],
): { dia: string; mensajes: T[] }[] {
  const grupos: { dia: string; mensajes: T[] }[] = [];
  for (const msg of mensajes) {
    const dia = diaMadrid(msg.created_at);
    const ultimo = grupos[grupos.length - 1];
    if (ultimo && ultimo.dia === dia) ultimo.mensajes.push(msg);
    else grupos.push({ dia, mensajes: [msg] });
  }
  return grupos;
}

/**
 * Etiqueta del separador de día: "Hoy", "Ayer" o p. ej. "martes, 3 de septiembre"
 * (con año si no es el año en curso: "martes, 3 de septiembre de 2025").
 */
export function etiquetaDia(dia: string, ahora: Date = new Date()): string {
  const hoy = partesMadrid(ahora);
  const diff = numeroDia(hoy.fecha) - numeroDia(dia);
  if (diff === 0) return "Hoy";
  if (diff === 1) return "Ayer";
  const [anio, mes, d] = dia.split("-").map(Number);
  const semana = DIAS_SEMANA[new Date(Date.UTC(anio, mes - 1, d)).getUTCDay()];
  const base = `${semana}, ${d} de ${MESES_LARGOS[mes - 1]}`;
  return anio === hoy.anio ? base : `${base} de ${anio}`;
}

/**
 * Mezcla mensajes existentes con otros nuevos (realtime o paginación):
 * deduplica por id (la versión entrante sustituye a la existente) y ordena
 * ascendentemente por created_at y, a igualdad, por id.
 */
export function mezclaMensajes<T extends { id: string; created_at: string }>(
  actuales: T[],
  nuevos: T[],
): T[] {
  const porId = new Map<string, T>();
  for (const m of actuales) porId.set(m.id, m);
  for (const m of nuevos) porId.set(m.id, m);
  return [...porId.values()].sort((a, b) => {
    const ta = Date.parse(a.created_at);
    const tb = Date.parse(b.created_at);
    if (ta !== tb) return ta - tb;
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  });
}

/**
 * Valida el texto de un mensaje antes de enviarlo. Recorta espacios en los extremos
 * (conserva los saltos de línea internos); rechaza vacíos y los que superan 5000 caracteres.
 */
export function validaTextoMensaje(
  texto: string,
): { ok: true; texto: string } | { ok: false; error: string } {
  const limpio = texto.trim();
  if (!limpio) return { ok: false, error: "El mensaje está vacío." };
  if (limpio.length > MAX_LONGITUD_MENSAJE) {
    return { ok: false, error: `El mensaje supera los ${MAX_LONGITUD_MENSAJE} caracteres.` };
  }
  return { ok: true, texto: limpio };
}

/** Suma de mensajes no leídos de todas las conversaciones (para el badge global). */
export function totalNoLeidos(filas: { no_leidos: number }[]): number {
  return filas.reduce((acc, f) => acc + (f.no_leidos > 0 ? f.no_leidos : 0), 0);
}
