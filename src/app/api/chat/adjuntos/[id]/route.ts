import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

// UC-610 AC-29/AC-31: descarga de un adjunto del chat. El mensaje se lee con la RLS del
// usuario (chat_puede_ver): si no es miembro de la conversación, no lo ve y recibe 404.
// Si lo ve, se le redirige a una URL firmada de Storage que caduca a los 5 minutos.
// Con ?ver=1 (imágenes y PDF) el fichero se abre en el navegador en lugar de descargarse.

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** Validez de la URL firmada, en segundos. */
const VALIDEZ_S = 300;

const sinCache = { "Cache-Control": "private, no-store" };

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "no autenticado" }, { status: 401, headers: sinCache });
  if (!UUID.test(id)) return NextResponse.json({ error: "no encontrado" }, { status: 404, headers: sinCache });

  const { data: msg, error } = await supabase
    .from("mensajes")
    .select("adjunto_path,adjunto_nombre,adjunto_mime,borrado")
    .eq("id", id)
    .maybeSingle();
  const m = msg as {
    adjunto_path: string | null;
    adjunto_nombre: string | null;
    adjunto_mime: string | null;
    borrado: boolean;
  } | null;
  // Sin acceso (la RLS no lo devuelve), inexistente, borrado o sin adjunto: 404.
  if (error || !m || m.borrado || !m.adjunto_path) {
    return NextResponse.json({ error: "no encontrado o sin acceso" }, { status: 404, headers: sinCache });
  }

  const mime = m.adjunto_mime ?? "";
  const verEnLinea =
    req.nextUrl.searchParams.get("ver") === "1" &&
    (mime === "application/pdf" || mime.startsWith("image/"));
  const { data, error: e2 } = await createAdminClient()
    .storage.from("chat")
    .createSignedUrl(
      m.adjunto_path,
      VALIDEZ_S,
      verEnLinea ? undefined : { download: m.adjunto_nombre || true },
    );
  if (e2 || !data) {
    console.error("[chat] adjunto", e2);
    return NextResponse.json({ error: "no disponible" }, { status: 500, headers: sinCache });
  }
  const res = NextResponse.redirect(data.signedUrl, 302);
  res.headers.set("Cache-Control", "private, no-store");
  return res;
}
