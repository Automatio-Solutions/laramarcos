import { type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { COLUMNAS_APLIFISA, filaAplifisa, type FacturaDatos } from "@/lib/ocr/core";

// UC-404 AC-07: exporta las facturas al Excel modelo Aplifisa (CSV importable).
export async function GET(request: NextRequest) {
  const cliente = request.nextUrl.searchParams.get("cliente");
  const supabase = await createClient();
  let q = supabase
    .from("facturas_ocr")
    .select("fecha, proveedor_nombre, proveedor_cif, concepto, base_imponible, iva_tipo, iva_cuota, total, subcuenta")
    .order("fecha");
  if (cliente) q = q.eq("cliente_id", cliente);
  const { data, error } = await q;
  if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500 });

  const esc = (v: string | number) => {
    const s = v == null ? "" : String(v);
    return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const header = COLUMNAS_APLIFISA.join(",");
  const body = (data ?? [])
    .map((f) => filaAplifisa(f as FacturaDatos).map(esc).join(","))
    .join("\n");

  return new Response(`${header}\n${body}`, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="aplifisa.csv"`,
    },
  });
}
