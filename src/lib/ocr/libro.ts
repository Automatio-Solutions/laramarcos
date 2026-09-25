import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { generarExcelAplifisa, type FacturaExcel } from "./aplifisa";
import { rangoTrimestre } from "./core";

const CAMPOS =
  "fecha, numero_factura, proveedor_nombre, proveedor_cif, concepto, base_imponible, iva_tipo, iva_cuota, " +
  "retencion_base, retencion_tipo, retencion_cuota, total, subcuenta, subcuenta_motivo, subcuenta_origen, " +
  "revisada, confianza, archivo_nombre";

// Postgres devuelve los numeric como texto; el Excel necesita números.
const NUMERICOS = ["base_imponible", "iva_tipo", "iva_cuota", "retencion_base", "retencion_tipo", "retencion_cuota", "total"] as const;

/**
 * Excel Aplifisa de un cliente y trimestre. Las facturas sin fecha se incluyen en
 * "Pendientes de revisar": no se sabe a qué trimestre van hasta que alguien la ponga.
 * Devuelve null si el cliente no existe o no es visible con `db` (RLS).
 */
export async function libroAplifisa(
  db: SupabaseClient,
  cliente_id: string,
  trimestre: string,
): Promise<{ buffer: Buffer; fichero: string; facturas: number } | null> {
  const rango = rangoTrimestre(trimestre);
  if (!rango) throw new Error(`Trimestre no válido: ${trimestre} (formato 2026-3T)`);

  const { data: cliente } = await db
    .from("clientes")
    .select("codigo, cif")
    .eq("id", cliente_id)
    .maybeSingle();
  if (!cliente) return null;

  const { data, error } = await db
    .from("facturas_ocr")
    .select(CAMPOS)
    .eq("cliente_id", cliente_id)
    .or(`fecha.is.null,and(fecha.gte.${rango.desde},fecha.lte.${rango.hasta})`);
  if (error) throw new Error(error.message);

  const facturas = (data ?? []).map((row) => {
    const f = { ...(row as unknown as Record<string, unknown>) };
    for (const k of NUMERICOS) if (f[k] != null) f[k] = Number(f[k]);
    return f as unknown as FacturaExcel;
  });
  const buffer = await generarExcelAplifisa(facturas);
  return { buffer, fichero: `Libro facturas ${trimestre} - ${cliente.codigo ?? cliente.cif}.xlsx`, facturas: facturas.length };
}

export const XLSX_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
