// Lógica pura de presupuestos (UC-201/202). Sin dependencias de servidor → testeable.

export interface LineaPresupuesto {
  concepto: string;
  cantidad: number;
  precio: number;
  descuento: number; // % por línea
}

/** Cómo se factura un servicio del tarifario. */
export type UnidadServicio = "fijo" | "hora" | "unidad";

export interface ServicioCatalogo {
  id: string;
  nombre: string;
  precio_base: number;     // SIEMPRE base imponible (sin IVA)
  codigo?: string | null;  // FSCL-001, LBRL-003…
  unidad?: UnidadServicio; // 'hora' → la cantidad son horas; 'unidad' → nº de unidades
}

export interface ResultadoGeneracion {
  lineas: LineaPresupuesto[];
  aviso: string | null; // AC-03: si no hay servicio claro
}

function norm(s: string): string {
  return s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
}

/** Fallback determinista: identifica servicios del catálogo mencionados en el texto.
 *  (Cuando hay ANTHROPIC_API_KEY se sustituye por Claude; el contrato de salida es el mismo.) */
export function generarDesdeTexto(texto: string, catalogo: ServicioCatalogo[]): ResultadoGeneracion {
  const t = norm(texto);
  const lineas: LineaPresupuesto[] = [];

  for (const s of catalogo) {
    const nombre = norm(s.nombre);
    const palabras = nombre.split(/\s+/).filter((w) => w.length >= 4);
    const match = t.includes(nombre) || palabras.some((w) => t.includes(w));
    if (match) {
      lineas.push({ concepto: s.nombre, cantidad: 1, precio: Number(s.precio_base), descuento: 0 });
    }
  }

  if (lineas.length === 0) {
    return {
      lineas: [],
      aviso: "No se identificó ningún servicio claro del catálogo. Revisa la descripción o añade las líneas manualmente (no se inventan precios).",
    };
  }
  return { lineas, aviso: null };
}

/** IVA general español. El tarifario del despacho está todo al 21%. */
export const IVA_TIPO_DEFECTO = 21;

export interface TotalesPresupuesto {
  subtotal: number;        // suma de líneas, antes del descuento global
  base_imponible: number;  // subtotal tras el descuento global
  iva_cuota: number;       // IVA sobre la base
  total: number;           // lo que paga el cliente (base + IVA)
}

/**
 * Totales del presupuesto: descuentos por línea, descuento global e IVA.
 * Los precios del catálogo son SIEMPRE base imponible; el IVA se añade aquí.
 */
export function calcularTotal(
  lineas: LineaPresupuesto[],
  descuentoGlobal = 0,
  ivaTipo = IVA_TIPO_DEFECTO,
): TotalesPresupuesto {
  const subtotal = lineas.reduce(
    (a, l) => a + l.cantidad * l.precio * (1 - (l.descuento || 0) / 100),
    0,
  );
  const base = subtotal * (1 - (descuentoGlobal || 0) / 100);
  // Se redondea la base antes de calcular el IVA para que base + cuota == total
  // exactamente y no aparezca un céntimo de descuadre en el PDF.
  const base_imponible = round2(base);
  const iva_cuota = round2(base_imponible * (ivaTipo / 100));
  return {
    subtotal: round2(subtotal),
    base_imponible,
    iva_cuota,
    total: round2(base_imponible + iva_cuota),
  };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
