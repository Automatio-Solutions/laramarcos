import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { autorizadoCron } from "@/lib/cron/auth";
import { ejecutarResumenDiario } from "@/lib/cron/tareas";

// UC-111 AC-24: resumen diario matutino por empleado (notificación in-app).
// En producción lo dispara /api/cron/diario; este endpoint queda para lanzarlo a mano.
export async function GET(request: NextRequest) {
  if (!autorizadoCron(request)) return NextResponse.json({ error: "no autorizado" }, { status: 401 });
  try {
    return NextResponse.json(await ejecutarResumenDiario(createAdminClient()));
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "fallo" }, { status: 500 });
  }
}
