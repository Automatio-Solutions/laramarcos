// Lógica pura de precontabilización (UC-402/403/404). Sin servidor → testeable.

export type Semaforo = "verde" | "naranja" | "rojo";

/** AC-08: verde (>90% aprobado auto), naranja (revisión rápida), rojo (revisar). */
export function semaforo(confianza: number): Semaforo {
  if (confianza >= 90) return "verde"; // = CONFIANZA_VERDE
  if (confianza >= 60) return "naranja";
  return "rojo";
}

export type OrigenSubcuenta = "historico" | "ia" | "manual";
export type TipoFactura = "gasto" | "ingreso";
/** Sociedades → partida doble (subcuentas); autónomos → programa fiscal (código de concepto). */
export type Regimen = "partida_doble" | "fiscal";

/** Un tipo de IVA dentro de la factura: cada uno va en su propia fila del Excel. */
export interface LineaIva {
  base: number | null;
  tipo: number | null;
  cuota: number | null;
}

export interface FacturaDatos {
  tipo: TipoFactura;
  fecha: string | null;
  /** Periodo en el que se contabiliza si no es el de su fecha (factura atrasada). */
  fecha_contable: string | null;
  numero_factura: string | null;
  /** El tercero: proveedor en gastos, cliente en ingresos. */
  proveedor_nombre: string | null;
  proveedor_cif: string | null;
  concepto: string | null;
  base_imponible: number | null;
  iva_tipo: number | null;
  iva_cuota: number | null;
  /** Varios tipos de IVA. Vacío = una sola línea con base/iva_tipo/iva_cuota. */
  lineas_iva: LineaIva[];
  /** Retención de IRPF (profesionales, alquileres). Tipo en %, como el IVA. */
  retencion_base: number | null;
  retencion_tipo: number | null;
  retencion_cuota: number | null;
  total: number | null;
  /** Columna "Subcuenta": cuenta de gasto/ingreso (62700000) o código de concepto (627). */
  subcuenta: string | null;
  /** Columna "Subcuenta Gasto/Ingreso": la del proveedor/cliente en ESTE cliente (41000023). */
  subcuenta_tercero: string | null;
  sujeto_pasivo: boolean;
  /** Por qué esa subcuenta (AC-02). Solo se rellena cuando la sugiere la IA. */
  subcuenta_motivo: string | null;
  /** De dónde salió: histórico del proveedor (UC-403), sugerencia IA o manual. */
  subcuenta_origen: OrigenSubcuenta | null;
}

/**
 * Columnas del "MODELO LIBRO FACTURAS.xlsx" del despacho, con las dos que se
 * acordaron después: "Subcuenta Gasto/Ingreso" (subcuenta del proveedor o
 * cliente) junto a "Subcuenta", y "Sujeto Pasivo" al final.
 */
export const COLUMNAS_APLIFISA = [
  "Fecha Expedición *",
  "Nº Factura *",
  "Nombre *",
  "NIF",
  "Subcuenta",
  "Subcuenta Gasto/Ingreso",
  "Base Imponible",
  "% IVA",
  "Cuota IVA",
  "Base Retencion",
  "% Retencion",
  "Cuota retencion",
  "Total Factura",
  "Sujeto Pasivo",
] as const;

export type CeldaAplifisa = string | number | Date;

const redondea = (n: number) => Math.round(n * 100) / 100;

/** AC-04: completa la cuota de IVA si falta a partir de base y tipo. */
export function inferirCuotaIva(base: number | null, tipo: number | null): number | null {
  if (base == null || tipo == null) return null;
  return redondea(base * (tipo / 100));
}

/** "2026-03-01" → fecha UTC (así Excel no la desplaza un día por la zona horaria). */
function aFecha(iso: string | null): Date | "" {
  if (!iso || !/^\d{4}-\d{2}-\d{2}/.test(iso)) return "";
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

/** Las líneas de IVA de la factura; sin desglose, una sola con los campos generales. */
export function lineasDe(f: FacturaDatos): LineaIva[] {
  const conDatos = (f.lineas_iva ?? []).filter((l) => l.base != null || l.cuota != null);
  if (conDatos.length) return conDatos;
  return [{ base: f.base_imponible, tipo: f.iva_tipo, cuota: f.iva_cuota }];
}

/** Retención de la factura, con base y cuota completadas si faltan. */
function retencionDe(f: FacturaDatos) {
  const hay = f.retencion_tipo != null || f.retencion_cuota != null;
  const baseTotal = lineasDe(f).reduce((s, l) => s + (l.base ?? 0), 0);
  const base = f.retencion_base ?? (hay ? redondea(baseTotal) : null);
  const cuota = f.retencion_cuota ?? inferirCuotaIva(base, f.retencion_tipo);
  return { base, tipo: f.retencion_tipo, cuota };
}

/**
 * AC-07: filas del Excel para una factura, en el orden exacto del modelo.
 * Una fila por tipo de IVA (así lo pide el despacho); la retención va en la
 * primera. Porcentajes como 21, no 0,21.
 */
export function filasAplifisa(f: FacturaDatos): CeldaAplifisa[][] {
  const lineas = lineasDe(f);
  const ret = retencionDe(f);
  return lineas.map((l, i) => {
    const cuota = l.cuota ?? inferirCuotaIva(l.base, l.tipo);
    const r = i === 0 ? ret : { base: null, tipo: null, cuota: null };
    const total =
      lineas.length === 1 && f.total != null
        ? f.total
        : l.base != null
          ? redondea(l.base + (cuota ?? 0) - (r.cuota ?? 0))
          : null;
    return [
      aFecha(f.fecha),
      f.numero_factura ?? "",
      f.proveedor_nombre ?? "",
      f.proveedor_cif ?? "",
      f.subcuenta ?? "",
      f.subcuenta_tercero ?? "",
      l.base ?? "",
      l.tipo ?? "",
      cuota ?? "",
      r.base ?? "",
      r.tipo ?? "",
      r.cuota ?? "",
      total ?? "",
      f.sujeto_pasivo ? "X" : "",
    ];
  });
}

/** Va al Excel que se importa: revisada por un asesor o leída con confianza alta. */
export function esExportable(f: { revisada: boolean; confianza: number }): boolean {
  return f.revisada || semaforo(f.confianza) === "verde";
}

/** "Por revisar": no irá al Excel hasta que un asesor la mire (naranja o rojo sin revisar). */
export const esPendiente = (f: { revisada: boolean; confianza: number }) => !esExportable(f);

/** Umbral de confianza del verde: por debajo, sin revisar, es pendiente. Para filtrar en BBDD. */
export const CONFIANZA_VERDE = 90;

/** Texto del aviso de facturas por revisar de un cliente y libro. */
export function textoPendientes(n: number, cliente: string, tipo: TipoFactura): string {
  const libro = tipo === "gasto" ? "Gastos" : "Ingresos";
  return `${cliente} · ${libro}: ${n} ${n === 1 ? "factura" : "facturas"} por revisar`;
}

// ---------------------------------------------------------------------------
// Cuentas y régimen
// ---------------------------------------------------------------------------

/**
 * Régimen del cliente. Si el despacho no lo ha fijado, se deduce del NIF:
 * persona física (DNI/NIE) → programa fiscal; comunidades de bienes (E) y
 * sociedades civiles (J), que tributan en atribución de rentas como los
 * autónomos → programa fiscal (SUPUESTO, pendiente de confirmar); el resto
 * de CIF → partida doble.
 */
export function regimenDe(cif: string | null | undefined, fijado?: Regimen | null): Regimen {
  if (fijado) return fijado;
  const c = (cif ?? "").trim().toUpperCase();
  return /^[0-9XYZKLM]/.test(c) || /^[EJ]/.test(c) ? "fiscal" : "partida_doble";
}

/** Subcuentas de Aplifisa: 8 dígitos, rellenando con ceros (627 → 62700000). */
export function subcuenta8(cuenta: string | null | undefined): string | null {
  const d = (cuenta ?? "").replace(/\D/g, "");
  if (!d) return null;
  return d.length >= 8 ? d : d.padEnd(8, "0");
}

/**
 * La columna "Subcuenta" según el régimen del cliente: sociedades → cuenta de 8
 * dígitos; autónomos → código de concepto de 3 dígitos, solo si está en el
 * listado de Aplifisa (`codigos`). null si no encaja.
 */
export function cuentaSegunRegimen(
  cuenta: string | null | undefined,
  regimen: Regimen,
  codigos: readonly string[],
): string | null {
  if (regimen === "partida_doble") return subcuenta8(cuenta);
  const codigo = (cuenta ?? "").replace(/\D/g, "").slice(0, 3);
  return codigos.includes(codigo) ? codigo : null;
}

// ---------------------------------------------------------------------------
// Avisos de revisión: lo que el despacho pidió que salte en rojo o naranja.
// ---------------------------------------------------------------------------

export interface Aviso {
  codigo: "cuadre" | "sin_numero" | "sin_fecha" | "sin_nif" | "sin_subcuenta_tercero" | "sin_subcuenta" | "libro" | "corte";
  texto: string;
  /** rojo = no se puede importar tal cual; naranja = falta un dato que el asesor pone una vez. */
  nivel: "rojo" | "naranja";
}

const eur = (n: number) => n.toFixed(2).replace(".", ",");

export function avisosFactura(f: FacturaDatos, regimen: Regimen): Aviso[] {
  const avisos: Aviso[] = [];
  if (!f.numero_factura) avisos.push({ codigo: "sin_numero", texto: "No se ha leído el nº de factura (obligatorio en Aplifisa).", nivel: "rojo" });
  if (!f.fecha) avisos.push({ codigo: "sin_fecha", texto: "No se ha leído la fecha de expedición.", nivel: "rojo" });
  if (!f.proveedor_cif) avisos.push({ codigo: "sin_nif", texto: "No se ha leído el NIF del proveedor o cliente.", nivel: "rojo" });

  // Suplidos, conceptos no sujetos…: si base + IVA − retención no da el total, a revisar.
  const lineas = lineasDe(f);
  const hayBase = lineas.some((l) => l.base != null);
  if (f.total != null && hayBase) {
    const base = lineas.reduce((s, l) => s + (l.base ?? 0), 0);
    const iva = lineas.reduce((s, l) => s + (l.cuota ?? inferirCuotaIva(l.base, l.tipo) ?? 0), 0);
    const calculado = redondea(base + iva - (retencionDe(f).cuota ?? 0));
    if (Math.abs(calculado - f.total) > 0.02) {
      avisos.push({
        codigo: "cuadre",
        texto: `Los importes no cuadran: base + IVA − retención = ${eur(calculado)} € y el total de la factura es ${eur(f.total)} € (¿suplidos o conceptos no sujetos?).`,
        nivel: "rojo",
      });
    }
  }

  if (!f.subcuenta) avisos.push({ codigo: "sin_subcuenta", texto: "Falta la subcuenta de gasto/ingreso.", nivel: "naranja" });
  if (regimen === "partida_doble" && !f.subcuenta_tercero) {
    avisos.push({
      codigo: "sin_subcuenta_tercero",
      texto: "Falta la subcuenta del proveedor/cliente en este cliente. Ponla una vez y se recordará.",
      nivel: "naranja",
    });
  }
  return avisos;
}

/** La confianza de la IA, rebajada por los avisos: rojo < 60, naranja < 90. */
export function confianzaConAvisos(confianza: number, avisos: Aviso[]): number {
  if (avisos.some((a) => a.nivel === "rojo")) return Math.min(confianza, 59);
  if (avisos.length) return Math.min(confianza, 89);
  return confianza;
}

// ---------------------------------------------------------------------------
// Periodos: el Excel se genera por cliente, tipo y periodo. Cualquier cliente
// puede ir por trimestre ("2026-3T") o por mes ("2026-07"). Una factura se
// contabiliza en el periodo de su fecha contable (si la tiene) o de su fecha.
// ---------------------------------------------------------------------------

export function trimestreDe(fecha: string | Date): string {
  const iso = typeof fecha === "string" ? fecha : fecha.toISOString();
  const y = iso.slice(0, 4);
  const m = Number(iso.slice(5, 7));
  return `${y}-${Math.ceil(m / 3)}T`;
}

const pad2 = (n: number) => String(n).padStart(2, "0");

/** "2026-3T" o "2026-07" → { desde, hasta } en ISO. null si el formato no vale. */
export function rangoPeriodo(p: string): { desde: string; hasta: string } | null {
  const t = /^(\d{4})-([1-4])T$/.exec(p);
  const m = /^(\d{4})-(0[1-9]|1[0-2])$/.exec(p);
  if (!t && !m) return null;
  const y = Number((t ?? m)![1]);
  const mesIni = t ? (Number(t[2]) - 1) * 3 + 1 : Number(m![2]);
  const mesFin = t ? mesIni + 2 : mesIni;
  const ultimoDia = new Date(Date.UTC(y, mesFin, 0)).getUTCDate();
  return { desde: `${y}-${pad2(mesIni)}-01`, hasta: `${y}-${pad2(mesFin)}-${pad2(ultimoDia)}` };
}

/** Compatibilidad: rango de un trimestre. */
export const rangoTrimestre = (t: string) => (/^\d{4}-[1-4]T$/.test(t) ? rangoPeriodo(t) : null);

/** "2026-3T" → "3T 2026"; "2026-07" → "07-2026". Para nombres de fichero. */
export function etiquetaPeriodo(p: string): string {
  const t = /^(\d{4})-([1-4])T$/.exec(p);
  if (t) return `${t[2]}T ${t[1]}`;
  const [y, m] = p.split("-");
  return `${m}-${y}`;
}

/** Fecha con la que la factura cae en un periodo: la contable si la hay. */
export const fechaDelLibro = (f: { fecha: string | null; fecha_contable: string | null }) => f.fecha_contable ?? f.fecha;

// ---------------------------------------------------------------------------
// Carpeta del servidor → cliente. Estructura real (capturas del despacho):
//   LARAMARCOS_<OFICINA>/01. CLIENTES/<RAZÓN SOCIAL>/07. CONTABILIDAD/
//     AÑO 2026/1º TRIMESTRE/<GASTOS|INGRESOS>/factura.pdf
// La carpeta del cliente va por razón social, pero se prueba también por código
// del despacho y por NIF. Solo vale una coincidencia única: ante la duda la
// factura entra sin cliente y un asesor la asigna.
// ---------------------------------------------------------------------------

export interface ClienteCarpeta {
  id: string;
  codigo: string | null;
  cif: string;
  razon_social: string;
  oficina: string | null;
}

/** Mayúsculas, sin acentos ni signos, espacios simples. "S.L." → "SL", "&" → "Y". */
export function normalizaTexto(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase()
    .replace(/\./g, "")
    .replace(/&/g, " Y ")
    .replace(/[^A-Z0-9Ñ ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** "PEREZ GOMEZ, JUAN" y "JUAN PEREZ GOMEZ" dan la misma clave. */
const claveNombre = (s: string) => normalizaTexto(s).split(" ").filter(Boolean).sort().join(" ");

const NIF_RE = /\b([0-9XYZ]\d{7}[A-Z]|[A-HJ-NP-SUVW]\d{7}[0-9A-J])\b/;

export function resolverClienteCarpeta(
  carpeta: string,
  oficina: string | null,
  clientes: ClienteCarpeta[],
): ClienteCarpeta | null {
  const ofi = oficina ? normalizaTexto(oficina) : null;
  const candidatos = ofi ? clientes.filter((c) => c.oficina && normalizaTexto(c.oficina) === ofi) : clientes;
  const unico = (xs: ClienteCarpeta[]) => (xs.length === 1 ? xs[0] : null);
  const texto = normalizaTexto(carpeta);

  const codigos = new Set(texto.match(/\b\d{4,6}\b/g) ?? []);
  if (codigos.size) {
    const porCodigo = unico(candidatos.filter((c) => c.codigo && codigos.has(c.codigo)));
    if (porCodigo) return porCodigo;
  }

  // "12345678-Z" / "12345678 Z" también cuentan como NIF.
  const up = carpeta.toUpperCase();
  const nif = (NIF_RE.exec(up) ?? NIF_RE.exec(up.replace(/(\d)[.\- ](?=[A-Z]\b)/g, "$1")))?.[1];
  if (nif) {
    const porNif = unico(candidatos.filter((c) => c.cif.toUpperCase() === nif));
    if (porNif) return porNif;
  }

  // Por nombre: se quita el código y el NIF que pueda llevar delante ("2034 - PEREZ…").
  const soloNombre = claveNombre(texto.replace(/\b\d{4,6}\b/g, " ").replace(nif ?? "\0", " "));
  if (!soloNombre) return null;
  return unico(candidatos.filter((c) => claveNombre(c.razon_social) === soloNombre));
}

/** "2026", "AÑO 2026", "3T", "2026-3T", "1º TRIMESTRE", "1er trimestre"…: carpetas de periodo, no de cliente. */
export function esCarpetaDePeriodo(seg: string): boolean {
  const s = normalizaTexto(seg);
  return /^(ANO )?(19|20)\d{2}$/.test(s) || /^((19|20)\d{2} ?)?([1-4] ?T|T ?[1-4]|[1-4] ?(ER|O|ST)? ?TRIM\w*)( ?(19|20)\d{2})?$/.test(s);
}

/**
 * Subida de una carpeta desde la app: la ruta puede empezar en la oficina, en el
 * cliente o más abajo. Se prueba cada carpeta de arriba abajo, saltando la de
 * oficina (que se usa como pista) y las de periodo, que podrían confundirse con
 * un código de cliente ("2026").
 */
export function resolverClienteRuta(
  carpetas: string[],
  clientes: ClienteCarpeta[],
  oficinas: readonly string[],
): ClienteCarpeta | null {
  const oficina = carpetas.map((c) => oficinaDeCarpeta(c, oficinas)).find(Boolean) ?? null;
  // Con la estructura del servidor, el cliente es la carpeta que sigue a "01. CLIENTES".
  const iClientes = carpetas.findIndex(esCarpetaClientes);
  const orden = iClientes >= 0 && carpetas[iClientes + 1]
    ? [carpetas[iClientes + 1], ...carpetas.filter((_, i) => i !== iClientes + 1)]
    : carpetas;
  for (const c of orden) {
    if (oficinaDeCarpeta(c, oficinas) || esCarpetaDePeriodo(c) || esCarpetaClientes(c)) continue;
    const cliente = resolverClienteCarpeta(c, oficina, clientes);
    if (cliente) return cliente;
  }
  return null;
}

const sinEspacios = (s: string) => normalizaTexto(s).replace(/ /g, "");

/** "LARAMARCOS_DONBENITO" o "Don Benito" → "Don Benito". */
export function oficinaDeCarpeta(seg: string, oficinas: readonly string[]): string | null {
  const s = sinEspacios(seg).replace(/^LARAMARCOS/, "");
  return oficinas.find((o) => sinEspacios(o) === s) ?? null;
}

/** "01. CLIENTES" (el número delante da igual). */
export const esCarpetaClientes = (seg: string) => /^(\d+ )?CLIENTES$/.test(normalizaTexto(seg));

/** "06. CONTABILIDAD", "07. CONTABILIDAD"… (el número cambia según el cliente). */
export const esCarpetaContabilidad = (seg: string) => /(^| )CONTABILIDAD$/.test(normalizaTexto(seg));

/** "AÑO 2026" o "2026" → 2026; si no es una carpeta de año, null. */
export function anioDeCarpeta(seg: string): number | null {
  const m = /^(?:ANO )?((?:19|20)\d{2})$/.exec(normalizaTexto(seg));
  return m ? Number(m[1]) : null;
}

/** "1º TRIMESTRE", "1er trimestre", "1T"… → 1; si no es una carpeta de trimestre, null. */
export function trimestreDeCarpeta(seg: string): number | null {
  const s = normalizaTexto(seg);
  const m = /^([1-4]) ?(?:ER|O|ST)? ?TRIM/.exec(s) ?? /^([1-4]) ?T$/.exec(s);
  return m ? Number(m[1]) : null;
}

/** Mismo nombre de cliente aunque cambien orden, puntos, acentos o "&"/"Y". */
export const mismoNombre = (a: string, b: string) => claveNombre(a) === claveNombre(b);

/** GASTOS → gasto, INGRESOS → ingreso (la carpeta dice el libro). */
export function tipoDeCarpetas(carpetas: string[]): TipoFactura | null {
  for (const c of [...carpetas].reverse()) {
    const s = normalizaTexto(c);
    if (s === "GASTOS") return "gasto";
    if (s === "INGRESOS") return "ingreso";
  }
  return null;
}

/** "AÑO 2026" + "1º TRIMESTRE" → "2026-1T". */
export function trimestreDeCarpetas(carpetas: string[]): string | null {
  let anio: string | null = null;
  let trimestre: string | null = null;
  for (const c of carpetas) {
    const s = normalizaTexto(c);
    anio = /^(?:ANO )?((?:19|20)\d{2})$/.exec(s)?.[1] ?? anio;
    trimestre = /^([1-4]) ?(?:ER|O|ST)? ?TRIM/.exec(s)?.[1] ?? trimestre;
  }
  return anio && trimestre ? `${anio}-${trimestre}T` : null;
}

export interface RutaServidor {
  oficina: string | null;
  carpetaCliente: string | null;
  tipo: TipoFactura | null;
  /** Libro según la carpeta ("2026-1T"): manda sobre la fecha de la factura. */
  trimestre: string | null;
  /** Carpeta del trimestre, donde se deja el Excel ("…/AÑO 2026/1º TRIMESTRE"). */
  carpetaTrimestre: string | null;
}

/** Descompone la ruta relativa de una factura en el servidor del despacho. */
export function parsearRutaServidor(ruta: string, oficinas: readonly string[]): RutaServidor {
  const carpetas = ruta.replace(/\\/g, "/").split("/").filter(Boolean).slice(0, -1);
  const iClientes = carpetas.findIndex(esCarpetaClientes);
  const iTrim = carpetas.findIndex((c) => /^[1-4] ?(?:ER|O|ST)? ?TRIM/.test(normalizaTexto(c)));
  return {
    oficina: carpetas.map((c) => oficinaDeCarpeta(c, oficinas)).find(Boolean) ?? null,
    carpetaCliente: iClientes >= 0 ? carpetas[iClientes + 1] ?? null : null,
    tipo: tipoDeCarpetas(carpetas),
    trimestre: trimestreDeCarpetas(carpetas),
    carpetaTrimestre: iTrim >= 0 ? carpetas.slice(0, iTrim + 1).join("/") : null,
  };
}

/**
 * Factura atrasada: si la carpeta dice un trimestre posterior al de su fecha,
 * conserva su fecha y se contabiliza el primer día del trimestre de la carpeta.
 */
export function fechaContablePorCarpeta(fecha: string | null, trimestreCarpeta: string | null): string | null {
  if (!fecha || !trimestreCarpeta) return null;
  const rango = rangoPeriodo(trimestreCarpeta);
  if (!rango) return null;
  return fecha < rango.desde ? rango.desde : null;
}

// ---------------------------------------------------------------------------
// Duplicados: la misma factura es mismo cliente, libro, NIF del tercero y nº de
// factura (lo que mira Aplifisa). El número se compara sin separadores, porque
// la IA puede leer "FA-2026/12" como "FA2026/12".
// ---------------------------------------------------------------------------

export const normalizaNumeroFactura = (n: string | null | undefined) =>
  (n ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");

export function mismaFactura(
  a: { proveedor_cif: string | null; numero_factura: string | null },
  b: { proveedor_cif: string | null; numero_factura: string | null },
): boolean {
  const na = normalizaNumeroFactura(a.numero_factura);
  const nifA = (a.proveedor_cif ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  return !!na && !!nifA
    && na === normalizaNumeroFactura(b.numero_factura)
    && nifA === (b.proveedor_cif ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");
}

// ---------------------------------------------------------------------------
// PDF con varias facturas: la IA describe cada página y esta regla las agrupa.
// Puede haber facturas de varias páginas; nunca varias facturas en una página
// (confirmado por el despacho) ni tickets.
// ---------------------------------------------------------------------------

export interface InfoPagina {
  /** Número de página en el PDF completo (1 = primera). */
  pagina: number;
  /** Lo que cree la IA: empieza una factura, sigue la anterior o está en blanco. */
  tipo: "inicio" | "continuacion" | "vacia";
  numero_factura: string | null;
  nif_emisor: string | null;
  /** "Página 2 de 3" si la página lo dice. */
  pagina_de: { n: number; total: number } | null;
  /** La IA no pudo describir la página (sin clave, respuesta incompleta): corte dudoso. */
  incierta?: boolean;
}

export interface GrupoPaginas {
  desde: number;
  hasta: number;
  numero_factura: string | null;
  nif_emisor: string | null;
  /** El corte no está claro: la factura saldrá marcada para revisar. */
  dudoso: boolean;
}

/**
 * Agrupa las páginas en facturas. Manda lo que se puede comprobar ("página 2 de
 * 3", mismo nº de factura) sobre lo que opina la IA; si se contradicen, el corte
 * queda como dudoso. Las páginas en blanco se descartan.
 */
export function agruparPaginas(paginas: InfoPagina[]): GrupoPaginas[] {
  const grupos: GrupoPaginas[] = [];
  let anterior: InfoPagina | null = null;
  for (const p of [...paginas].sort((a, b) => a.pagina - b.pagina)) {
    if (p.tipo === "vacia") continue;
    const g = grupos[grupos.length - 1];
    let inicio: boolean;
    let dudoso = false;
    const numP = normalizaNumeroFactura(p.numero_factura);
    const numG = normalizaNumeroFactura(g?.numero_factura);

    if (!g) {
      inicio = true;
      dudoso = p.tipo === "continuacion" || (p.pagina_de != null && p.pagina_de.n > 1);
    } else if (p.pagina_de) {
      inicio = p.pagina_de.n === 1;
      // "Página 3 de 3" tras una página que no era la 2: algo falta o sobra.
      const esperado = anterior?.pagina_de && anterior.pagina_de.total === p.pagina_de.total ? anterior.pagina_de.n + 1 : null;
      if (!inicio && esperado !== null && esperado !== p.pagina_de.n) dudoso = true;
      if (!inicio && numP && numG && numP !== numG) dudoso = true;
    } else if (numP && numG) {
      inicio = numP !== numG;
      if (inicio !== (p.tipo === "inicio")) dudoso = true;
    } else {
      inicio = p.tipo === "inicio";
      // Una continuación sin nada que la ate a la anterior no es segura.
      if (!inicio && !numP) dudoso = true;
    }

    if (p.incierta) dudoso = true;
    if (inicio) {
      grupos.push({ desde: p.pagina, hasta: p.pagina, numero_factura: p.numero_factura, nif_emisor: p.nif_emisor, dudoso });
    } else {
      g.hasta = p.pagina;
      g.dudoso ||= dudoso;
      g.numero_factura ??= p.numero_factura;
      g.nif_emisor ??= p.nif_emisor;
    }
    anterior = p;
  }
  return grupos;
}

export const AVISO_CORTE: Aviso = {
  codigo: "corte",
  texto: "Revisa el corte: no está claro dónde empieza o acaba esta factura dentro del PDF.",
  nivel: "naranja",
};
