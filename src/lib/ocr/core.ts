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
  proveedor_nombre: string | null;
  proveedor_cif: string | null;
  concepto: string | null;
  base_imponible: number | null;
  iva_tipo: number | null;
  iva_cuota: number | null;
  total: number | null;
  subcuenta: string | null;
  /** Por qué esa subcuenta (AC-02). Solo se rellena cuando la sugiere la IA. */
  subcuenta_motivo: string | null;
  /** De dónde salió: histórico del proveedor (UC-403), sugerencia IA o manual. */
  subcuenta_origen: OrigenSubcuenta | null;
}

/** Columnas del Excel modelo (orden). Se ajusta al modelo real de Aplifisa cuando lo aporte el cliente. */
export const COLUMNAS_APLIFISA = [
  "Fecha",
  "Proveedor",
  "CIF",
  "Concepto",
  "Base Imponible",
  "% IVA",
  "Cuota IVA",
  "Total",
  "Subcuenta",
] as const;

/** AC-04: completa la cuota de IVA si falta a partir de base y tipo. */
export function inferirCuotaIva(base: number | null, tipo: number | null): number | null {
  if (base == null || tipo == null) return null;
  return Math.round(base * (tipo / 100) * 100) / 100;
}

/** AC-07: fila lista para el Excel modelo Aplifisa. */
export function filaAplifisa(f: FacturaDatos): (string | number)[] {
  const cuota = f.iva_cuota ?? inferirCuotaIva(f.base_imponible, f.iva_tipo) ?? "";
  const total = f.total ?? (f.base_imponible != null && cuota !== "" ? Math.round((f.base_imponible + Number(cuota)) * 100) / 100 : "");
  return [
    f.fecha ?? "",
    f.proveedor_nombre ?? "",
    f.proveedor_cif ?? "",
    f.concepto ?? "",
    f.base_imponible ?? "",
    f.iva_tipo ?? "",
    cuota,
    total,
    f.subcuenta ?? "",
  ];
}
