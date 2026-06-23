import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// AC-14: lista de clientes de un sector dado, para que M3 (vigilancia DOE/BOE)
// construya las listas de envío dinámicamente desde la segmentación de la BBDD.
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("cliente_sectores")
    .select("clientes(id, razon_social, email)")
    .eq("sector_id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const clientes = (data ?? [])
    .map((row) => (row as { clientes: unknown }).clientes)
    .filter(Boolean);
  return NextResponse.json({ sector_id: id, clientes });
}
