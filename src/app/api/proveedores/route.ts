import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

// AC-12: dado un CIF de proveedor, devuelve su subcuenta y tipo de IVA por defecto
// (consumo de M4 — precontabilización OCR).
export async function GET(request: NextRequest) {
  const cif = request.nextUrl.searchParams.get("cif")?.toUpperCase().trim();
  if (!cif) {
    return NextResponse.json({ error: "Falta el parámetro 'cif'." }, { status: 400 });
  }
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("proveedores")
    .select("cif, nombre, subcuenta_habitual, iva_default")
    .eq("cif", cif)
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ found: false }, { status: 404 });
  return NextResponse.json({ found: true, proveedor: data });
}
