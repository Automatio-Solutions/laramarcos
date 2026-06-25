import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

// UC-106 AC-14: descarga del adjunto sin reenvíos por correo.
// Verifica acceso vía RLS (sesión) y redirige a una URL firmada temporal.
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: adj } = await supabase.from("adjuntos").select("path").eq("id", id).maybeSingle();
  if (!adj) return NextResponse.json({ error: "no encontrado o sin acceso" }, { status: 404 });

  const admin = createAdminClient();
  const { data, error } = await admin.storage.from("adjuntos").createSignedUrl(adj.path, 60);
  if (error || !data) return NextResponse.json({ error: "no disponible" }, { status: 500 });
  return NextResponse.redirect(data.signedUrl);
}
