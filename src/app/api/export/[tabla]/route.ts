import { type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

// AC-18: exporta cualquier tabla permitida a CSV.
const ALLOWED: Record<string, string> = {
  clientes: "cif,razon_social,email,telefono,direccion,ciudad,codigo_postal,oficina,fecha_baja",
  servicios: "nombre,categoria,precio_base,condiciones_default",
  proveedores: "cif,nombre,subcuenta_habitual,iva_default",
  sectores: "nombre",
};

function toCsv(cols: string[], rows: Record<string, unknown>[]): string {
  const esc = (v: unknown) => {
    const s = v == null ? "" : String(v);
    return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const header = cols.join(",");
  const body = rows.map((r) => cols.map((c) => esc(r[c])).join(",")).join("\n");
  return `${header}\n${body}`;
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ tabla: string }> },
) {
  const { tabla } = await params;
  const colsSpec = ALLOWED[tabla];
  if (!colsSpec) {
    return new Response(JSON.stringify({ error: "Tabla no permitida." }), {
      status: 400,
      headers: { "content-type": "application/json" },
    });
  }
  const cols = colsSpec.split(",");
  const supabase = await createClient();
  const { data, error } = await supabase.from(tabla).select(colsSpec);
  if (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { "content-type": "application/json" },
    });
  }
  const csv = toCsv(cols, (data ?? []) as unknown as Record<string, unknown>[]);
  return new Response(csv, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="${tabla}.csv"`,
    },
  });
}
