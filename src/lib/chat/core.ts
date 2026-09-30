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

// ============================================================================
// Fase 2 — @menciones (UC-605) y enlaces a tareas/clientes (UC-608)
// ============================================================================

/** Máximo de caracteres tras "@" que se consideran parte de la búsqueda de una mención. */
const MAX_CONSULTA_MENCION = 40;

/** Carácter que puede formar parte de un nombre (letras con tilde, dígitos). */
const ES_PALABRA = /[\p{L}\p{N}_]/u;

/**
 * Mención que se está escribiendo en la posición del cursor: "@" al inicio o tras un espacio,
 * seguido de texto sin saltos de línea hasta el cursor. Devuelve la posición de la "@" y la
 * consulta (lo escrito tras ella), o null si el cursor no está dentro de una mención.
 */
export function buscaMencionActiva(
  texto: string,
  cursor: number,
): { inicio: number; consulta: string } | null {
  const hasta = Math.max(0, Math.min(cursor, texto.length));
  const antes = texto.slice(0, hasta);
  const arroba = antes.lastIndexOf("@");
  if (arroba < 0) return null;
  if (arroba > 0 && !/\s|[(\[¿¡"']/.test(antes[arroba - 1])) return null; // p. ej. un correo
  const consulta = antes.slice(arroba + 1);
  if (consulta.length > MAX_CONSULTA_MENCION) return null;
  if (/[\n\r@]/.test(consulta) || /^\s/.test(consulta)) return null;
  return { inicio: arroba, consulta };
}

/**
 * ¿La consulta de la mención en curso corresponde a una mención ya elegida? Es así cuando
 * es exactamente "Nombre" de una elegida o empieza por "Nombre" seguido de un espacio
 * (lo que deja insertaMencion). En ese caso el selector no debe reabrirse sobre ella: solo
 * se vuelve a abrir cuando se escribe una "@" nueva.
 */
export function mencionCompletada(consulta: string, elegidas: { nombre: string }[]): boolean {
  const c = consulta.toLocaleLowerCase("es");
  return elegidas.some((m) => {
    const n = m.nombre.trim().toLocaleLowerCase("es");
    if (!n || !c.startsWith(n)) return false;
    const siguiente = c.slice(n.length, n.length + 1);
    return siguiente === "" || /\s/.test(siguiente);
  });
}

/**
 * Sustituye la mención en curso (de `inicio` a `cursor`) por "@Nombre " y devuelve el texto
 * nuevo y la posición del cursor tras el espacio.
 */
export function insertaMencion(
  texto: string,
  inicio: number,
  cursor: number,
  nombre: string,
): { texto: string; cursor: number } {
  const antes = texto.slice(0, inicio);
  const despues = texto.slice(cursor).replace(/^ /, "");
  const insercion = `@${nombre} `;
  return { texto: antes + insercion + despues, cursor: antes.length + insercion.length };
}

/**
 * Posiciones [inicio, fin) de cada aparición de "@Nombre" en el texto, sin distinguir
 * mayúsculas: la "@" va al inicio o tras un carácter que no es de palabra, y tras el nombre
 * no sigue una letra o dígito ("@Ana" no casa en "@Anabel").
 */
function posicionesMencion(texto: string, nombre: string): [number, number][] {
  const n = nombre.trim();
  if (!n) return [];
  const aguja = `@${n}`.toLocaleLowerCase("es");
  const pajar = texto.toLocaleLowerCase("es");
  // Solo es seguro comparar posiciones si bajar a minúsculas no cambia longitudes.
  if (pajar.length !== texto.length) return [];
  const res: [number, number][] = [];
  let desde = 0;
  for (;;) {
    const i = pajar.indexOf(aguja, desde);
    if (i < 0) break;
    const fin = i + aguja.length;
    const previo = i > 0 ? texto[i - 1] : "";
    const siguiente = texto[fin] ?? "";
    if ((!previo || !ES_PALABRA.test(previo)) && (!siguiente || !ES_PALABRA.test(siguiente))) {
      res.push([i, fin]);
    }
    desde = i + 1;
  }
  return res;
}

/**
 * Menciones que siguen siendo válidas al enviar: candidatos cuyo "@Nombre" aparece en el
 * texto, sin el autor y sin repetidos, en el orden de los candidatos.
 */
export function mencionesVigentes(
  texto: string,
  candidatos: { id: string; nombre: string }[],
  autorId: string | null,
): string[] {
  const vistos = new Set<string>();
  const res: string[] = [];
  for (const c of candidatos) {
    if (!c.id || c.id === autorId || vistos.has(c.id)) continue;
    if (posicionesMencion(texto, c.nombre).length === 0) continue;
    vistos.add(c.id);
    res.push(c.id);
  }
  return res;
}

/**
 * ¿El token de una @mención de comentario ("ana" de "@ana") coincide con el INICIO de
 * alguna palabra del nombre? Sin distinguir mayúsculas ni tildes: "ana" casa con
 * "Ana María López" y "Luisa Ana", pero no con "Mariana" ni "Juana".
 */
export function coincideMencion(token: string, nombre: string): boolean {
  const t = normalizaBusqueda(token);
  if (!t) return false;
  return normalizaBusqueda(nombre)
    .split(/[^\p{L}\p{N}]+/u)
    .some((palabra) => palabra.startsWith(t));
}

/**
 * Ids mencionados en un comentario de tarea: cada "@token" (letras/dígitos tras "@") se
 * resuelve contra los candidatos por inicio de palabra (coincideMencion). Excluye al autor
 * y no repite ids; conserva el orden de los candidatos.
 */
export function resuelveMencionesComentario(
  texto: string,
  candidatos: { id: string; nombre: string }[],
  autorId: string | null,
): string[] {
  const tokens = [...texto.normalize("NFC").matchAll(/@([\p{L}\p{N}]+)/gu)].map((m) => m[1]);
  if (!tokens.length) return [];
  const vistos = new Set<string>();
  const res: string[] = [];
  for (const c of candidatos) {
    if (!c.id || c.id === autorId || vistos.has(c.id)) continue;
    if (!tokens.some((tok) => coincideMencion(tok, c.nombre))) continue;
    vistos.add(c.id);
    res.push(c.id);
  }
  return res;
}

/** Texto del aviso de la campana para una mención en el chat. */
export function textoAvisoMencion(
  autor: string,
  conv: { tipo: string; nombre: string | null; oficina?: string | null },
  clienteNombre?: string | null,
): string {
  let donde: string;
  switch (conv.tipo) {
    case "general":
      donde = "el canal General";
      break;
    case "oficina":
      donde = `el canal de ${conv.oficina ?? conv.nombre ?? "la oficina"}`;
      break;
    case "cliente":
      donde = `la conversación de ${clienteNombre ?? conv.nombre ?? "un cliente"}`;
      break;
    default:
      donde = "un mensaje directo";
  }
  return `${autor} te ha mencionado en ${donde}`;
}

export type TipoEnlace = "tarea" | "cliente";

export interface EnlaceDetectado {
  tipo: TipoEnlace;
  id: string;
  /** Texto tal y como aparece en el mensaje. */
  url: string;
  /** Ruta interna a la que lleva (siempre relativa). */
  ruta: string;
  inicio: number;
  fin: number;
}

const UUID_TXT = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";
// Absoluta (cualquier host) o relativa que empieza por "/", precedida de inicio o separador.
const RE_ENLACE = new RegExp(
  `(^|[\\s(<\\["'¿¡])((?:https?:\\/\\/[^\\s/?#]+)?\\/(tareas|clientes)\\/(${UUID_TXT}))(?![0-9a-z-])((?:[/?#][^\\s)>\\]"']*)?)`,
  "giu",
);

/**
 * Enlaces a tareas (/tareas/<uuid>) y clientes (/clientes/<uuid>) del texto, absolutos en
 * cualquier host o relativos. Los signos de puntuación finales no forman parte del enlace.
 */
export function detectaEnlaces(texto: string): EnlaceDetectado[] {
  const res: EnlaceDetectado[] = [];
  for (const m of texto.matchAll(RE_ENLACE)) {
    const [, previo, base, seccion, id] = m;
    const cola = (m[5] ?? "").replace(/[.,;:!?]+$/, "");
    const inicio = (m.index ?? 0) + previo.length;
    const url = base + cola;
    res.push({
      tipo: seccion.toLowerCase() === "tareas" ? "tarea" : "cliente",
      id: id.toLowerCase(),
      url,
      ruta: `/${seccion.toLowerCase()}/${id.toLowerCase()}`,
      inicio,
      fin: inicio + url.length,
    });
  }
  return res;
}

/** Referencias únicas (tipo + id) de una lista de enlaces, en orden de aparición. */
export function refsUnicas<T extends { tipo: TipoEnlace; id: string }>(enlaces: T[]): T[] {
  const vistos = new Set<string>();
  return enlaces.filter((e) => {
    const k = `${e.tipo}:${e.id}`;
    if (vistos.has(k)) return false;
    vistos.add(k);
    return true;
  });
}

export type Trozo =
  | { tipo: "texto"; texto: string }
  | { tipo: "mencion"; texto: string; id: string }
  | { tipo: "enlace"; texto: string; enlace: EnlaceDetectado };

/**
 * Trocea el texto de un mensaje en texto plano, menciones ("@Nombre" de los ids mencionados)
 * y enlaces internos, para pintarlos sin HTML. Si se solapan, ganan los enlaces y, entre
 * menciones, la de nombre más largo.
 */
export function trocearTexto(
  texto: string,
  menciones: { id: string; nombre: string }[],
  enlaces: EnlaceDetectado[] = detectaEnlaces(texto),
): Trozo[] {
  type Tramo = { inicio: number; fin: number; trozo: Trozo };
  const tramos: Tramo[] = [];
  const libre = (i: number, f: number) => tramos.every((t) => f <= t.inicio || i >= t.fin);

  for (const e of enlaces) {
    if (libre(e.inicio, e.fin)) {
      tramos.push({ inicio: e.inicio, fin: e.fin, trozo: { tipo: "enlace", texto: e.url, enlace: e } });
    }
  }
  const ordenadas = [...menciones].sort((a, b) => b.nombre.length - a.nombre.length);
  for (const m of ordenadas) {
    for (const [i, f] of posicionesMencion(texto, m.nombre)) {
      if (libre(i, f)) {
        tramos.push({ inicio: i, fin: f, trozo: { tipo: "mencion", texto: texto.slice(i, f), id: m.id } });
      }
    }
  }
  tramos.sort((a, b) => a.inicio - b.inicio);

  const res: Trozo[] = [];
  let pos = 0;
  for (const t of tramos) {
    if (t.inicio > pos) res.push({ tipo: "texto", texto: texto.slice(pos, t.inicio) });
    res.push(t.trozo);
    pos = t.fin;
  }
  if (pos < texto.length) res.push({ tipo: "texto", texto: texto.slice(pos) });
  return res;
}
