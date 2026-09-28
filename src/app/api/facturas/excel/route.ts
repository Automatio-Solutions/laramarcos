import { type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { trimestreDe } from "@/lib/ocr/core";
import { libroAplifisa, XLSX_MIME } from "@/lib/ocr/libro";

// UC-404 AC-07: descarga el Excel Aplifisa de un cliente, un libro (gastos o
// ingresos) y un periodo (trimestre "2026-3T" o mes "2026-07").
export async function GET(request: NextRequest) {
  const q = request.nextUrl.searchParams;
  const cliente = q.get("cliente");
  const tipo = q.get("tipo") === "ingreso" ? "ingreso" : "gasto";
  const periodo = q.get("periodo") || q.get("trimestre") || trimestreDe(new Date());
  if (!cliente) return Response.json({ error: "Elige un cliente." }, { status: 400 });

  const supabase = await createClient();
  try {
    const libro = await libroAplifisa(supabase, cliente, tipo, periodo);
    if (!libro) return Response.json({ error: "Cliente no encontrado." }, { status: 404 });
    return new Response(new Uint8Array(libro.buffer), {
      headers: {
        "content-type": XLSX_MIME,
        "content-disposition": `attachment; filename*=UTF-8''${encodeURIComponent(libro.fichero)}`,
      },
    });
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 400 });
  }
}
