import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { autorizadoCron } from "@/lib/cron/auth";
import { ejecutarRecurrentes } from "@/lib/cron/tareas";

// UC-208 AC-17: genera los presupuestos recurrentes vencidos (cada N días).
// En producción lo dispara /api/cron/diario; este endpoint queda para lanzarlo a mano.
export async function GET(request: NextRequest) {
  if (!autorizadoCron(request)) return NextResponse.json({ error: "no autorizado" }, { status: 401 });
  try {
    return NextResponse.json(await ejecutarRecurrentes(createAdminClient()));
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "fallo" }, { status: 500 });
  }
}
