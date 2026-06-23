"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { EstadoTarea } from "@/lib/types";

const ESTADOS: EstadoTarea[] = ["pendiente", "en_curso", "bloqueada", "completada"];

/** Cambia el estado de una tarea (arrastre en el Kanban). AC-03.
 *  Respeta dependencias (UC-107 AC-15): no avanza si una predecesora no está completada. */
export async function updateEstadoTareaAction(id: string, estado: string) {
  if (!ESTADOS.includes(estado as EstadoTarea)) return;
  const supabase = await createClient();

  if (estado === "en_curso" || estado === "completada") {
    const { data: deps } = await supabase
      .from("dependencias_tarea")
      .select("depende_de:tareas!dependencias_tarea_depende_de_id_fkey(estado)")
      .eq("tarea_id", id);
    const bloqueadaPorDep = (deps ?? []).some(
      (d) => (d.depende_de as unknown as { estado: string } | null)?.estado !== "completada",
    );
    if (bloqueadaPorDep) return; // predecesora pendiente → no avanza
  }

  const patch: Record<string, unknown> = { estado };
  if (estado === "completada") patch.completada_at = new Date().toISOString();
  await supabase.from("tareas").update(patch).eq("id", id);
  revalidatePath("/tareas");
}

export interface TareaFormState {
  ok: boolean;
  errors: Record<string, string>;
}

export async function createTareaAction(_p: TareaFormState, formData: FormData): Promise<TareaFormState> {
  const titulo = String(formData.get("titulo") ?? "").trim();
  if (!titulo) return { ok: false, errors: { titulo: "El título es obligatorio." } };

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  const cliente_id = String(formData.get("cliente_id") ?? "").trim() || null;
  const responsable_id = String(formData.get("responsable_id") ?? "").trim() || user?.id || null;
  const vencimiento = String(formData.get("vencimiento") ?? "").trim() || null;
  const categoria = String(formData.get("categoria") ?? "").trim() || null;

  const { error } = await supabase.from("tareas").insert({
    titulo,
    descripcion: String(formData.get("descripcion") ?? "").trim() || null,
    cliente_id,
    responsable_id,
    vencimiento,
    categoria,
  });
  if (error) return { ok: false, errors: { titulo: error.message } };

  revalidatePath("/tareas");
  redirect("/tareas");
}
