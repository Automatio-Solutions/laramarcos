import { type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { autorizadoAgente, noAutorizado } from "@/lib/agente/auth";
import { libroAplifisa, XLSX_MIME } from "@/lib/ocr/libro";

// El programa del servidor descarga el Excel Aplifisa de un cliente/trimestre y lo
// deja en la carpeta del cliente. Se regenera entero: refleja las correcciones hechas en la app.
export async function GET(request: NextRequest) {
  if (!autorizadoAgente(request)) return noAutorizado();
  const cliente = request.nextUrl.searchParams.get("cliente");
  const trimestre = request.nextUrl.searchParams.get("trimestre");
  if (!cliente || !trimestre) return Response.json({ error: "Faltan 'cliente' o 'trimestre'." }, { status: 400 });

  try {
    const libro = await libroAplifisa(createAdminClient(), cliente, trimestre);
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
