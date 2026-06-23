import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

// UC-111 AC-24: resumen diario matutino por empleado (notificación in-app con su carga).
// Pensado para ejecutarse cada mañana (Vercel cron / n8n). Email vía Resend = futuro.
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (secret && request.headers.get("x-cron-secret") !== secret) {
    return NextResponse.json({ error: "no autorizado" }, { status: 401 });
  }

  const admin = createAdminClient();
  const hoy = new Date().toISOString().slice(0, 10);
  const { data: usuarios } = await admin.from("usuarios").select("id").eq("activo", true);

  let creados = 0;
  for (const u of usuarios ?? []) {
    const { count: abiertas } = await admin
      .from("tareas")
      .select("id", { count: "exact", head: true })
      .eq("responsable_id", u.id)
      .neq("estado", "completada");
    const { count: vencen = 0 } = await admin
      .from("tareas")
      .select("id", { count: "exact", head: true })
      .eq("responsable_id", u.id)
      .neq("estado", "completada")
      .lte("vencimiento", hoy);

    if ((abiertas ?? 0) === 0) continue;
    const { error } = await admin.rpc("crear_notificacion", {
      p_usuario: u.id,
      p_tipo: "resumen_diario",
      p_mensaje: `Buenos días: ${abiertas} tareas abiertas${vencen ? `, ${vencen} vencen hoy o antes` : ""}.`,
      p_enlace: "/tareas",
    });
    if (!error) creados++;
  }

  return NextResponse.json({ fecha: hoy, usuarios: usuarios?.length ?? 0, creados });
}
