import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { PasoPlantilla } from "@/lib/types";

/** Acepta un presupuesto y crea la tarea + subtareas por plantilla (UC-207).
 *  Idempotente: si ya está aceptado, no hace nada. Funciona con cliente de sesión o admin. */
export async function aceptarPresupuesto(
  supabase: SupabaseClient,
  presupuestoId: string,
  ip: string | null,
): Promise<{ ok: boolean; tareaId?: string; motivo?: string }> {
  const { data: pre } = await supabase
    .from("presupuestos")
    .select("id, estado, cliente_id, servicio_id, creado_por, tarea_id")
    .eq("id", presupuestoId)
    .maybeSingle();
  if (!pre) return { ok: false, motivo: "no encontrado" };
  if (pre.estado === "aceptado") return { ok: true, tareaId: pre.tarea_id ?? undefined };

  // Nombre del servicio (para el título de la tarea)
  let titulo = "Trabajo aceptado";
  if (pre.servicio_id) {
    const { data: serv } = await supabase.from("servicios").select("nombre").eq("id", pre.servicio_id).maybeSingle();
    if (serv?.nombre) titulo = serv.nombre;
  }

  // 1) Crear la tarea (sin asignar; el responsable asignará subtareas)
  const { data: tarea } = await supabase
    .from("tareas")
    .insert({
      titulo,
      cliente_id: pre.cliente_id,
      responsable_id: pre.creado_por,
      servicio_id: pre.servicio_id,
      origen: "presupuesto",
    })
    .select("id")
    .single();
  if (!tarea) return { ok: false, motivo: "no se pudo crear la tarea" };

  // 2) Instanciar subtareas desde la plantilla del servicio
  if (pre.servicio_id) {
    const { data: pl } = await supabase
      .from("plantillas_subtareas")
      .select("pasos")
      .eq("servicio_id", pre.servicio_id)
      .maybeSingle();
    const pasos = ((pl?.pasos as PasoPlantilla[]) ?? []).sort((a, b) => a.orden - b.orden);
    if (pasos.length) {
      const hoy = new Date();
      await supabase.from("subtareas").insert(
        pasos.map((p) => {
          const d = new Date(hoy);
          d.setDate(d.getDate() + (p.plazo_relativo_dias ?? 0));
          return { tarea_id: tarea.id, titulo: p.nombre, plazo: d.toISOString().slice(0, 10), orden: p.orden };
        }),
      );
    }
  }

  // 3) Marcar el presupuesto aceptado y enlazar la tarea
  await supabase
    .from("presupuestos")
    .update({ estado: "aceptado", aceptado_at: new Date().toISOString(), aceptado_ip: ip, tarea_id: tarea.id })
    .eq("id", presupuestoId);

  return { ok: true, tareaId: tarea.id };
}
