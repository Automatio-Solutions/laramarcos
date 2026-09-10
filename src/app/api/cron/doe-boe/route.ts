import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { autorizadoCron } from "@/lib/cron/auth";
import { ejecutarVigilancia } from "@/lib/cron/tareas";
import { procesarBoletines } from "@/lib/vigilancia/procesar";
import type { ItemBoletin } from "@/lib/vigilancia/parsear";

export const maxDuration = 60;

// UC-301..305: baja el DOE y el BOE, clasifica por sector y genera circulares
// y tareas urgentes. La descarga la hace la propia app (sin n8n).
// En producción lo dispara /api/cron/diario; aquí queda para lanzarlo a mano.
export async function GET(request: NextRequest) {
  if (!autorizadoCron(request)) return NextResponse.json({ error: "no autorizado" }, { status: 401 });
  try {
    return NextResponse.json(await ejecutarVigilancia(createAdminClient()));
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "fallo" }, { status: 500 });
  }
}

// POST: permite empujar publicaciones ya parseadas desde fuera (import manual
// o una fuente futura). Se mantiene por compatibilidad.
export async function POST(request: NextRequest) {
  if (!autorizadoCron(request)) return NextResponse.json({ error: "no autorizado" }, { status: 401 });
  const admin = createAdminClient();
  const fecha = new Date().toISOString().slice(0, 10);
  try {
    const body = (await request.json()) as { fecha?: string; items?: ItemBoletin[] };
    const items = (body.items ?? []).filter((i) => i.boletin && i.titulo);
    const res = await procesarBoletines(admin, body.fecha ?? fecha, items);
    return NextResponse.json({ fecha: body.fecha ?? fecha, ...res });
  } catch (err) {
    await admin.from("ingesta_log").insert({
      fecha, boletin: "POST", estado: "error",
      mensaje: err instanceof Error ? err.message : "error",
    });
    return NextResponse.json({ error: "procesamiento fallido" }, { status: 500 });
  }
}
