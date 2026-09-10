import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { autorizadoCron } from "@/lib/cron/auth";
import {
  ejecutarAlertas,
  ejecutarRecurrentes,
  ejecutarResumenDiario,
  ejecutarVigilancia,
  hoyISO,
} from "@/lib/cron/tareas";

/**
 * Despachador diario: ejecuta las cuatro tareas del despacho en una sola
 * invocación. Existe porque el plan gratuito de Vercel solo admite 2 cron jobs
 * con una ejecución al día; en lugar de repartirlas, se agrupan aquí.
 *
 * Orden deliberado: primero las tres tareas baratas (solo base de datos, ~1s
 * cada una) y al final la vigilancia, que baja los boletines y llama a Claude.
 * Así, si se agota el tiempo, lo que se pierde es lo que se puede reintentar
 * mañana sin consecuencias, y nunca las notificaciones al equipo.
 *
 * Cada tarea va aislada: si una falla, las demás siguen.
 */

export const maxDuration = 60; // segundos: tope del plan gratuito

/** Margen que se reserva para responder antes de que Vercel corte la función. */
const RESERVA_MS = 5_000;
const PRESUPUESTO_MS = maxDuration * 1000 - RESERVA_MS;

type Resultado = Record<string, unknown>;

async function paso(
  nombre: string,
  fn: () => Promise<Resultado>,
  salida: Record<string, Resultado>,
) {
  const t0 = Date.now();
  try {
    salida[nombre] = { ...(await fn()), ms: Date.now() - t0 };
  } catch (err) {
    salida[nombre] = {
      error: err instanceof Error ? err.message : "fallo desconocido",
      ms: Date.now() - t0,
    };
  }
}

export async function GET(request: NextRequest) {
  if (!autorizadoCron(request)) {
    return NextResponse.json({ error: "no autorizado" }, { status: 401 });
  }

  const arranque = Date.now();
  const admin = createAdminClient();
  const hoy = hoyISO();
  const salida: Record<string, Resultado> = {};

  await paso("alertas", () => ejecutarAlertas(admin, hoy), salida);
  await paso("resumen_diario", () => ejecutarResumenDiario(admin, hoy), salida);
  await paso("presupuestos_recurrentes", () => ejecutarRecurrentes(admin, hoy), salida);

  // La vigilancia solo entra si queda tiempo real para terminarla. Media
  // ejecución dejaría publicaciones guardadas sin su circular, y como el
  // pipeline es idempotente por (boletín, enlace), mañana no se reintentarían.
  const restante = PRESUPUESTO_MS - (Date.now() - arranque);
  if (restante < 25_000) {
    salida.vigilancia = { omitida: "sin tiempo suficiente en esta ejecución", restante_ms: restante };
  } else {
    await paso("vigilancia", () => ejecutarVigilancia(admin, hoy), salida);
  }

  return NextResponse.json({ fecha: hoy, ms_total: Date.now() - arranque, ...salida });
}
