import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { computeAlertas, type TareaAlerta } from "@/lib/alertas";

// UC-103: motor de alertas. Pensado para ejecutarse a diario (Vercel cron / n8n).
// Calcula avisos 7d/48h al responsable y escalado al despacho si la tarea venció.
// Canal: notificaciones in-app (dedupe en crear_notificacion). Email vía Resend = futuro.
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (secret && request.headers.get("x-cron-secret") !== secret) {
    return NextResponse.json({ error: "no autorizado" }, { status: 401 });
  }

  const admin = createAdminClient();
  const hoy = new Date().toISOString().slice(0, 10);

  const { data: tareas, error } = await admin
    .from("tareas")
    .select("id, titulo, vencimiento, estado, bloqueada, responsable_id")
    .neq("estado", "completada");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const { data: resp } = await admin.from("usuarios").select("id").eq("rol", "responsable").eq("activo", true);
  const responsables = (resp ?? []).map((r) => r.id as string);

  const avisos = computeAlertas((tareas ?? []) as TareaAlerta[], hoy, responsables);

  let creados = 0;
  for (const a of avisos) {
    const { error: e } = await admin.rpc("crear_notificacion", {
      p_usuario: a.usuario_id,
      p_tipo: a.tipo,
      p_mensaje: a.mensaje,
      p_enlace: a.enlace,
    });
    if (!e) creados++;
  }

  return NextResponse.json({ fecha: hoy, evaluadas: tareas?.length ?? 0, avisos: avisos.length, creados });
}
