// Lógica pura de presupuestos (UC-201/202). Sin dependencias de servidor → testeable.

export interface LineaPresupuesto {
  concepto: string;
  cantidad: number;
  precio: number;
  descuento: number; // % por línea
}

export interface ServicioCatalogo {
  id: string;
  nombre: string;
  precio_base: number;
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

/** Total con descuentos por línea y descuento global (%). */
export function calcularTotal(lineas: LineaPresupuesto[], descuentoGlobal = 0): {
  subtotal: number;
  total: number;
} {
  const subtotal = lineas.reduce(
    (a, l) => a + l.cantidad * l.precio * (1 - (l.descuento || 0) / 100),
    0,
  );
  const total = subtotal * (1 - (descuentoGlobal || 0) / 100);
  return { subtotal: round2(subtotal), total: round2(total) };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
