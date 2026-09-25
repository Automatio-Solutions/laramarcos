// Lógica pura de precontabilización (UC-402/403/404). Sin servidor → testeable.

export type Semaforo = "verde" | "naranja" | "rojo";

/** AC-08: verde (>90% aprobado auto), naranja (revisión rápida), rojo (revisar). */
export function semaforo(confianza: number): Semaforo {
  if (confianza >= 90) return "verde";
  if (confianza >= 60) return "naranja";
  return "rojo";
}

export type OrigenSubcuenta = "historico" | "ia" | "manual";

export interface FacturaDatos {
  fecha: string | null;
  numero_factura: string | null;
  proveedor_nombre: string | null;
  proveedor_cif: string | null;
  concepto: string | null;
  base_imponible: number | null;
  iva_tipo: number | null;
  iva_cuota: number | null;
  /** Retención de IRPF (profesionales, alquileres). Tipo en %, como el IVA. */
  retencion_base: number | null;
  retencion_tipo: number | null;
  retencion_cuota: number | null;
  total: number | null;
  subcuenta: string | null;
  /** Por qué esa subcuenta (AC-02). Solo se rellena cuando la sugiere la IA. */
  subcuenta_motivo: string | null;
  /** De dónde salió: histórico del proveedor (UC-403), sugerencia IA o manual. */
  subcuenta_origen: OrigenSubcuenta | null;
}

/** Columnas del "MODELO LIBRO FACTURAS.xlsx" del despacho, en su orden y con sus nombres. */
export const COLUMNAS_APLIFISA = [
  "Fecha Expedición *",
  "Nº Factura *",
  "Nombre *",
  "NIF",
  "Subcuenta",
  "Base Imponible",
  "% IVA",
  "Cuota IVA",
  "Base Retencion",
  "% Retencion",
  "Cuota retencion",
  "Total Factura",
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

/**
 * Las instrucciones del modelo piden los porcentajes "en tanto por uno (0,21 para 21%)".
 * Se escribe 0.21 y la celda se formatea como porcentaje, así se lee "21%".
 * PENDIENTE de confirmar con el despacho contra una importación real en Aplifisa.
 */
const aFraccion = (pct: number | null) => (pct == null ? "" : Math.round(pct * 100) / 10000);

/** AC-07: fila en el orden exacto del modelo Aplifisa, con cuotas y total calculados si faltan. */
export function filaAplifisa(f: FacturaDatos): CeldaAplifisa[] {
  const base = f.base_imponible;
  const cuotaIva = f.iva_cuota ?? inferirCuotaIva(base, f.iva_tipo);
  const hayRetencion = f.retencion_tipo != null || f.retencion_cuota != null;
  const baseRet = f.retencion_base ?? (hayRetencion ? base : null);
  const cuotaRet = f.retencion_cuota ?? inferirCuotaIva(baseRet, f.retencion_tipo);
  const total = f.total ?? (base != null ? redondea(base + (cuotaIva ?? 0) - (cuotaRet ?? 0)) : null);
  return [
    aFecha(f.fecha),
    f.numero_factura ?? "",
    f.proveedor_nombre ?? "",
    f.proveedor_cif ?? "",
    f.subcuenta ?? "",
    base ?? "",
    aFraccion(f.iva_tipo),
    cuotaIva ?? "",
    baseRet ?? "",
    aFraccion(f.retencion_tipo),
    cuotaRet ?? "",
    total ?? "",
  ];
}

/** Va al Excel que se importa: revisada por un asesor o leída con confianza alta. */
export function esExportable(f: { revisada: boolean; confianza: number }): boolean {
  return f.revisada || semaforo(f.confianza) === "verde";
}

// ---------------------------------------------------------------------------
// Trimestres ("2026-3T"): el Excel se genera por cliente y trimestre de expedición.
// ---------------------------------------------------------------------------

export function trimestreDe(fecha: string | Date): string {
  const iso = typeof fecha === "string" ? fecha : fecha.toISOString();
  const y = iso.slice(0, 4);
  const m = Number(iso.slice(5, 7));
  return `${y}-${Math.ceil(m / 3)}T`;
}

/** "2026-3T" → { desde: "2026-07-01", hasta: "2026-09-30" }. null si el formato no vale. */
export function rangoTrimestre(t: string): { desde: string; hasta: string } | null {
  const m = /^(\d{4})-([1-4])T$/.exec(t);
  if (!m) return null;
  const y = Number(m[1]);
  const q = Number(m[2]);
  const mesIni = (q - 1) * 3 + 1;
  const ultimoDia = new Date(Date.UTC(y, mesIni + 2, 0)).getUTCDate();
  const pad = (n: number) => String(n).padStart(2, "0");
  return { desde: `${y}-${pad(mesIni)}-01`, hasta: `${y}-${pad(mesIni + 2)}-${pad(ultimoDia)}` };
}

// ---------------------------------------------------------------------------
// Carpeta del servidor → cliente. Estructura confirmada: raíz / oficina / cliente.
// Aún no sabemos cómo se nombra la carpeta del cliente, así que se prueba por
// código del despacho, por NIF y por nombre. Solo vale una coincidencia única:
// ante la duda la factura entra sin cliente y un asesor la asigna.
// ---------------------------------------------------------------------------

export interface ClienteCarpeta {
  id: string;
  codigo: string | null;
  cif: string;
  razon_social: string;
  oficina: string | null;
}

/** Mayúsculas, sin acentos ni signos, espacios simples. "S.L." → "SL". */
export function normalizaTexto(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase()
    .replace(/\./g, "")
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

/** "2026", "3T", "T3", "2026-3T", "3º TRIMESTRE", "1er trimestre"…: carpetas de periodo, no de cliente. */
export function esCarpetaDePeriodo(seg: string): boolean {
  const s = normalizaTexto(seg);
  return /^(19|20)\d{2}$/.test(s) || /^((19|20)\d{2} ?)?([1-4] ?T|T ?[1-4]|[1-4] ?(ER|O|ST)? ?TRIM\w*)( ?(19|20)\d{2})?$/.test(s);
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
  const esOficina = (s: string) => oficinas.some((o) => normalizaTexto(o) === normalizaTexto(s));
  const oficina = carpetas.find(esOficina) ?? null;
  for (const c of carpetas) {
    if (esOficina(c) || esCarpetaDePeriodo(c)) continue;
    const cliente = resolverClienteCarpeta(c, oficina, clientes);
    if (cliente) return cliente;
  }
  return null;
}
