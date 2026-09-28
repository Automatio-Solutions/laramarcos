import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { generarExcelAplifisa, type FacturaExcel } from "./aplifisa";
import { etiquetaPeriodo, rangoPeriodo, type TipoFactura } from "./core";

const CAMPOS =
  "tipo, fecha, fecha_contable, numero_factura, proveedor_nombre, proveedor_cif, concepto, base_imponible, " +
  "iva_tipo, iva_cuota, lineas_iva, retencion_base, retencion_tipo, retencion_cuota, total, subcuenta, " +
  "subcuenta_tercero, sujeto_pasivo, subcuenta_motivo, subcuenta_origen, revisada, confianza, archivo_nombre";

// Postgres devuelve los numeric como texto; el Excel necesita números.
const NUMERICOS = ["base_imponible", "iva_tipo", "iva_cuota", "retencion_base", "retencion_tipo", "retencion_cuota", "total"] as const;
const num = (v: unknown) => (v == null || v === "" ? null : Number(v));

/**
 * Excel Aplifisa de un cliente, un libro (gastos o ingresos) y un periodo
 * (trimestre "2026-3T" o mes "2026-07"). Una factura cae en el periodo de su
 * fecha contable si la tiene (factura atrasada) o de su fecha. Las que aún no
 * tienen fecha van a "Pendientes de revisar". null si el cliente no es visible (RLS).
 */
export async function libroAplifisa(
  db: SupabaseClient,
  cliente_id: string,
  tipo: TipoFactura,
  periodo: string,
): Promise<{ buffer: Buffer; fichero: string; facturas: number } | null> {
  const rango = rangoPeriodo(periodo);
  if (!rango) throw new Error(`Periodo no válido: ${periodo} (formato 2026-3T o 2026-07)`);

  const { data: cliente } = await db
    .from("clientes")
    .select("codigo, cif, razon_social")
    .eq("id", cliente_id)
    .maybeSingle();
  if (!cliente) return null;

  const { desde, hasta } = rango;
  const { data, error } = await db
    .from("facturas_ocr")
    .select(CAMPOS)
    .eq("cliente_id", cliente_id)
    .eq("tipo", tipo)
    .or(
      `and(fecha_contable.gte.${desde},fecha_contable.lte.${hasta}),` +
        `and(fecha_contable.is.null,fecha.gte.${desde},fecha.lte.${hasta}),` +
        `and(fecha_contable.is.null,fecha.is.null)`,
    );
  if (error) throw new Error(error.message);

  const facturas = (data ?? []).map((row) => {
    const f = { ...(row as unknown as Record<string, unknown>) };
    for (const k of NUMERICOS) f[k] = num(f[k]);
    f.lineas_iva = ((f.lineas_iva as Record<string, unknown>[] | null) ?? []).map((l) => ({
      base: num(l.base), tipo: num(l.tipo), cuota: num(l.cuota),
    }));
    return f as unknown as FacturaExcel;
  });
  const buffer = await generarExcelAplifisa(facturas);
  const libro = tipo === "gasto" ? "GASTOS" : "INGRESOS";
  return {
    buffer,
    fichero: `${libro} ${etiquetaPeriodo(periodo)} - ${cliente.razon_social.replace(/[\\/:*?"<>|]/g, "")}.xlsx`,
    facturas: facturas.length,
  };
}

export const XLSX_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
