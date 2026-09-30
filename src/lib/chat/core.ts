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
export function mezclaMensajes<
  T extends { id: string; created_at: string; autor_nombre?: string | null },
>(actuales: T[], nuevos: T[]): T[] {
  const porId = new Map<string, T>();
  for (const m of actuales) porId.set(m.id, m);
  for (const m of nuevos) {
    const previo = porId.get(m.id);
    // Los eventos de Realtime (UPDATE al editar o borrar) no traen el nombre del autor:
    // se conserva el que ya se conocía.
    porId.set(
      m.id,
      previo?.autor_nombre && !m.autor_nombre ? { ...m, autor_nombre: previo.autor_nombre } : m,
    );
  }
  return [...porId.values()].sort((a, b) => {
    const ta = Date.parse(a.created_at);
    const tb = Date.parse(b.created_at);
    if (ta !== tb) return ta - tb;
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  });
}

/**
 * Valida el texto de un mensaje antes de enviarlo. Recorta espacios en los extremos
 * (conserva los saltos de línea internos); rechaza vacíos (salvo `vacioPermitido`, p. ej. un
 * mensaje que solo lleva un adjunto) y los que superan 5000 caracteres.
 */
export function validaTextoMensaje(
  texto: string,
  vacioPermitido = false,
): { ok: true; texto: string } | { ok: false; error: string } {
  const limpio = texto.trim();
  if (!limpio && !vacioPermitido) return { ok: false, error: "El mensaje está vacío." };
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

// ============================================================================
// Fase 3 — adjuntos (UC-610), búsqueda (UC-611), editar/borrar (UC-612),
// "escribiendo…" (UC-613)
// ============================================================================

/** Tamaño máximo de un adjunto del chat. */
export const MAX_MB_ADJUNTO = 20;
export const MAX_BYTES_ADJUNTO = MAX_MB_ADJUNTO * 1024 * 1024;

/** Tipos admitidos, por extensión (manda la extensión, como en la subida de facturas). */
const MIME_ADJUNTO_POR_EXT: Record<string, string> = {
  pdf: "application/pdf",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  gif: "image/gif",
  xls: "application/vnd.ms-excel",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  doc: "application/msword",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
};

const MIMES_ADJUNTO = new Set(Object.values(MIME_ADJUNTO_POR_EXT));

/** Valor del atributo `accept` del selector de ficheros. */
export const ACCEPT_ADJUNTO = Object.keys(MIME_ADJUNTO_POR_EXT)
  .map((e) => `.${e}`)
  .join(",");

export const ERROR_TIPO_ADJUNTO = "Tipo de archivo no permitido: solo PDF, imágenes, Excel o Word.";
export const ERROR_TAMANO_ADJUNTO = `El archivo supera el límite de ${MAX_MB_ADJUNTO} MB.`;
/** Texto del error cuando falla la subida del fichero a Storage (no se envía nada). */
export const ERROR_SUBIDA_ADJUNTO = "No se pudo subir el archivo. Inténtalo de nuevo.";

/**
 * Tipo MIME admitido de un adjunto, o null. Manda la extensión (el navegador no siempre
 * informa el tipo): una extensión que no está en la lista se rechaza aunque el navegador diga
 * otra cosa; solo un nombre SIN extensión se acepta por el tipo del navegador.
 */
export function mimeAdjunto(nombre: string, tipo?: string | null): string | null {
  const partes = nombre.toLowerCase().split(".");
  if (partes.length > 1) return MIME_ADJUNTO_POR_EXT[partes.pop() ?? ""] ?? null;
  return tipo && MIMES_ADJUNTO.has(tipo) ? tipo : null;
}

/**
 * UC-610 AC-30: valida un fichero antes de subirlo (en el navegador y otra vez en el
 * servidor). Devuelve el tipo MIME que se guardará o el motivo del rechazo con el límite.
 */
export function validaAdjunto(
  nombre: string,
  mime: string | null | undefined,
  size: number,
): { ok: true; mime: string } | { ok: false; error: string } {
  const tipo = mimeAdjunto(nombre ?? "", mime);
  if (!tipo) return { ok: false, error: ERROR_TIPO_ADJUNTO };
  if (!Number.isFinite(size) || size <= 0) return { ok: false, error: "El archivo está vacío." };
  if (size > MAX_BYTES_ADJUNTO) return { ok: false, error: ERROR_TAMANO_ADJUNTO };
  return { ok: true, mime: tipo };
}

/**
 * Nombre a mostrar de un adjunto: sin carpetas ni caracteres de control, recortado a 255
 * caracteres conservando la extensión.
 */
export function limpiaNombreAdjunto(nombre: string): string {
  const base = (nombre ?? "").split(/[\\/]/).pop() ?? "";
  const limpio = base.replace(/[\u0000-\u001f\u007f]/g, "").trim();
  if (limpio.length <= 255) return limpio;
  const punto = limpio.lastIndexOf(".");
  const ext = punto > 0 && limpio.length - punto <= 10 ? limpio.slice(punto) : "";
  return limpio.slice(0, 255 - ext.length) + ext;
}

/**
 * Nombre seguro para la clave del objeto en Storage: solo ASCII (letras, dígitos, "._-"),
 * sin tildes, como mucho 100 caracteres conservando la extensión.
 */
export function saneaNombreAdjunto(nombre: string): string {
  const limpio = limpiaNombreAdjunto(nombre)
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/[^A-Za-z0-9._-]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^[._-]+/, "");
  if (!limpio) return "archivo";
  if (limpio.length <= 100) return limpio;
  const punto = limpio.lastIndexOf(".");
  const ext = punto > 0 && limpio.length - punto <= 10 ? limpio.slice(punto) : "";
  return limpio.slice(0, 100 - ext.length) + ext;
}

export interface AdjuntoMensaje {
  path: string;
  nombre: string;
  mime: string;
  size: number;
}

const UUID_ADJ = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";

/**
 * Valida en el servidor el adjunto que acompaña a un mensaje: la ruta tiene que ser
 * `<conversación>/<uuid>/<nombre saneado>` de ESTA conversación, y nombre, tipo y tamaño
 * tienen que ser admisibles. Devuelve el adjunto limpio o el motivo del rechazo.
 */
export function validaAdjuntoMensaje(
  adjunto: Partial<AdjuntoMensaje> | null | undefined,
  conversacionId: string,
): { ok: true; adjunto: AdjuntoMensaje } | { ok: false; error: string } {
  if (!adjunto || typeof adjunto !== "object") return { ok: false, error: "Adjunto no válido." };
  const { path, nombre, mime, size } = adjunto;
  if (typeof path !== "string" || typeof nombre !== "string" || typeof size !== "number") {
    return { ok: false, error: "Adjunto no válido." };
  }
  const conv = conversacionId.toLowerCase();
  const re = new RegExp(`^${conv}/${UUID_ADJ}/[A-Za-z0-9._-]{1,100}$`);
  if (!path.startsWith(`${conv}/`) || !re.test(path) || path.includes("..")) {
    return { ok: false, error: "Adjunto no válido." };
  }
  const limpio = limpiaNombreAdjunto(nombre);
  if (!limpio) return { ok: false, error: "Adjunto no válido." };
  if (!Number.isInteger(size)) return { ok: false, error: "Adjunto no válido." };
  const v = validaAdjunto(limpio, typeof mime === "string" ? mime : null, size);
  if (!v.ok) return v;
  return { ok: true, adjunto: { path, nombre: limpio, mime: v.mime, size } };
}

export type TipoAdjunto = "pdf" | "imagen" | "excel" | "word" | "otro";

/** Familia de un adjunto por su tipo MIME (para el icono y la etiqueta). */
export function tipoAdjunto(mime: string | null | undefined): TipoAdjunto {
  if (!mime) return "otro";
  if (mime === "application/pdf") return "pdf";
  if (mime.startsWith("image/")) return "imagen";
  if (mime.includes("excel") || mime.includes("spreadsheetml")) return "excel";
  if (mime.includes("msword") || mime.includes("wordprocessingml")) return "word";
  return "otro";
}

const ETIQUETA_TIPO: Record<TipoAdjunto, string> = {
  pdf: "PDF",
  imagen: "Imagen",
  excel: "Excel",
  word: "Word",
  otro: "Archivo",
};

/** Etiqueta del tipo de adjunto: "PDF", "Imagen", "Excel" o "Word". */
export function etiquetaTipoAdjunto(mime: string | null | undefined): string {
  return ETIQUETA_TIPO[tipoAdjunto(mime)];
}

/** Tamaño legible con coma decimal: "512 B", "340 KB", "1,2 MB", "20 MB". */
export function formatoTamano(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  const mb = (bytes / (1024 * 1024)).toFixed(1).replace(/\.0$/, "").replace(".", ",");
  return `${mb} MB`;
}

// ---- Búsqueda (UC-611) ----

/** Caracteres mínimos para lanzar una búsqueda y espera (ms) tras la última tecla. */
export const BUSQUEDA_MIN_CARACTERES = 2;
export const BUSQUEDA_ESPERA_MS = 300;
/** Resultados como mucho por búsqueda. */
export const BUSQUEDA_LIMITE = 50;

/** Palabras de la búsqueda (normalizadas, sin repetir, de 2 o más caracteres). */
export function terminosBusqueda(q: string): string[] {
  const vistos = new Set<string>();
  for (const t of normalizaBusqueda(q).split(" ")) {
    const limpio = t.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, "");
    if (limpio.length >= 2) vistos.add(limpio);
  }
  return [...vistos].sort((a, b) => b.length - a.length);
}

/**
 * Versión normalizada (minúsculas, sin tildes) del texto con, para cada carácter
 * normalizado, la posición [inicio, fin) del carácter original del que sale.
 */
function mapaNormalizado(texto: string): { norm: string; ini: number[]; fin: number[] } {
  let norm = "";
  const ini: number[] = [];
  const fin: number[] = [];
  for (let i = 0; i < texto.length; ) {
    const cp = texto.codePointAt(i) ?? 0;
    const ch = String.fromCodePoint(cp);
    const n = ch.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
    for (let k = 0; k < n.length; k++) {
      norm += n[k];
      ini.push(i);
      fin.push(i + ch.length);
    }
    i += ch.length;
  }
  return { norm, ini, fin };
}

/** Tramos [inicio, fin) del texto original donde aparece alguna palabra de la búsqueda. */
function tramosCoincidencia(texto: string, q: string): [number, number][] {
  const terminos = terminosBusqueda(q);
  if (terminos.length === 0 || !texto) return [];
  const { norm, ini, fin } = mapaNormalizado(texto);
  const tramos: [number, number][] = [];
  for (const t of terminos) {
    // La búsqueda de la BBDD usa raíces en español: "facturas" también encuentra "factura".
    const candidatos = [t];
    if (t.length > 3 && t.endsWith("es")) candidatos.push(t.slice(0, -2));
    if (t.length > 3 && t.endsWith("s")) candidatos.push(t.slice(0, -1));
    for (const c of candidatos) {
      let encontrado = false;
      for (let i = norm.indexOf(c); i >= 0; i = norm.indexOf(c, i + 1)) {
        tramos.push([ini[i], fin[i + c.length - 1]]);
        encontrado = true;
      }
      if (encontrado) break;
    }
  }
  tramos.sort((a, b) => a[0] - b[0] || b[1] - a[1]);
  const unidos: [number, number][] = [];
  for (const t of tramos) {
    const ultimo = unidos[unidos.length - 1];
    if (ultimo && t[0] <= ultimo[1]) ultimo[1] = Math.max(ultimo[1], t[1]);
    else unidos.push([t[0], t[1]]);
  }
  return unidos;
}

/**
 * UC-611: trocea el texto marcando las palabras buscadas, sin distinguir mayúsculas ni
 * tildes ("jose" marca "José"). Concatenar los trozos devuelve el texto original.
 */
export function resaltaCoincidencias(texto: string, q: string): { texto: string; marca: boolean }[] {
  const tramos = tramosCoincidencia(texto, q);
  const res: { texto: string; marca: boolean }[] = [];
  let pos = 0;
  for (const [i, f] of tramos) {
    if (i > pos) res.push({ texto: texto.slice(pos, i), marca: false });
    res.push({ texto: texto.slice(i, f), marca: true });
    pos = f;
  }
  if (pos < texto.length || res.length === 0) res.push({ texto: texto.slice(pos), marca: false });
  return res;
}

/**
 * Extracto de un mensaje para la lista de resultados: en una línea y, si es largo, centrado
 * en la primera coincidencia (con "…" donde se corta), como mucho `max` caracteres.
 */
export function extractoBusqueda(texto: string, q: string, max = 140): string {
  const plano = texto.replace(/\s+/g, " ").trim();
  if (plano.length <= max) return plano;
  const primera = tramosCoincidencia(plano, q)[0]?.[0] ?? 0;
  let inicio = Math.max(0, Math.min(primera - Math.floor(max / 4), plano.length - max));
  if (inicio > 0) {
    const espacio = plano.indexOf(" ", inicio);
    if (espacio >= 0 && espacio < primera) inicio = espacio + 1;
  }
  let fin = Math.min(plano.length, inicio + max);
  if (fin < plano.length) {
    const espacio = plano.lastIndexOf(" ", fin);
    if (espacio > primera) fin = espacio;
  }
  return `${inicio > 0 ? "…" : ""}${plano.slice(inicio, fin)}${fin < plano.length ? "…" : ""}`;
}

// ---- Editar y borrar (UC-612) ----

/** Responsable o administrador: puede moderar (borrar mensajes ajenos). */
export function esStaffChat(rol: string | null | undefined): boolean {
  return rol === "responsable" || rol === "admin";
}

/** Solo el autor edita, y nunca un mensaje borrado. */
export function puedeEditarMensaje(
  m: { autor_id: string | null; borrado: boolean },
  yoId: string | null | undefined,
): boolean {
  return !m.borrado && !!yoId && m.autor_id === yoId;
}

/** Borra el autor o, para moderar, un responsable o administrador. */
export function puedeBorrarMensaje(
  m: { autor_id: string | null; borrado: boolean },
  yoId: string | null | undefined,
  rol: string | null | undefined,
): boolean {
  if (m.borrado || !yoId) return false;
  return m.autor_id === yoId || esStaffChat(rol);
}

// ---- "Escribiendo…" (UC-613) ----

/** Como mucho un aviso de "escribiendo" cada 2 s, y caduca a los 5 s del último. */
export const ESCRIBIENDO_CADA_MS = 2000;
export const ESCRIBIENDO_CADUCA_MS = 5000;

/** "Ana está escribiendo…", "Ana y Bruno están escribiendo…", "Varias personas…". */
export function textoEscribiendo(nombres: string[]): string {
  const n = [...new Set(nombres.map((x) => x.trim()).filter(Boolean))];
  if (n.length === 0) return "";
  if (n.length === 1) return `${n[0]} está escribiendo…`;
  if (n.length === 2) return `${n[0]} y ${n[1]} están escribiendo…`;
  if (n.length === 3) return `${n[0]}, ${n[1]} y ${n[2]} están escribiendo…`;
  return "Varias personas están escribiendo…";
}
