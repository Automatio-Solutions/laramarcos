"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { PasoPlantilla } from "@/lib/types";

export async function createPlantillaTareaAction(formData: FormData) {
  const nombre = String(formData.get("nombre") ?? "").trim();
  if (!nombre) return;
  const supabase = await createClient();
  await supabase.from("plantillas_tareas").insert({
    nombre,
    categoria: String(formData.get("categoria") ?? "").trim() || null,
    subtareas: [],
  });
  revalidatePath("/plantillas-tareas");
}

export async function savePasosPlantillaAction(plantillaId: string, formData: FormData) {
  const nombres = formData.getAll("paso_nombre").map(String);
  const plazos = formData.getAll("paso_plazo").map((v) => Number(v));
  const subtareas: PasoPlantilla[] = nombres
    .map((nombre, i) => ({ orden: i + 1, nombre: nombre.trim(), plazo_relativo_dias: Number.isFinite(plazos[i]) ? plazos[i] : 0 }))
    .filter((p) => p.nombre);
  const supabase = await createClient();
  await supabase.from("plantillas_tareas").update({ subtareas }).eq("id", plantillaId);
  revalidatePath("/plantillas-tareas");
}

export async function deletePlantillaTareaAction(id: string) {
  const supabase = await createClient();
  await supabase.from("plantillas_tareas").delete().eq("id", id);
  revalidatePath("/plantillas-tareas");
}

/** AC-19: instancia la plantilla → crea la tarea con todas sus subtareas y plazos prefijados. */
export async function usarPlantillaAction(id: string) {
  const supabase = await createClient();
  const { data: pl } = await supabase.from("plantillas_tareas").select("nombre, categoria, subtareas").eq("id", id).maybeSingle();
  if (!pl) return;
  const { data: { user } } = await supabase.auth.getUser();

  const { data: tarea } = await supabase
    .from("tareas")
    .insert({ titulo: pl.nombre, categoria: pl.categoria, responsable_id: user?.id, origen: "manual" })
    .select("id")
    .single();
  if (!tarea) return;

  const pasos = (pl.subtareas as PasoPlantilla[]) ?? [];
  if (pasos.length) {
    const hoy = new Date();
    await supabase.from("subtareas").insert(
      pasos.sort((a, b) => a.orden - b.orden).map((p) => {
        const d = new Date(hoy);
        d.setDate(d.getDate() + (p.plazo_relativo_dias ?? 0));
        return { tarea_id: tarea.id, titulo: p.nombre, plazo: d.toISOString().slice(0, 10), orden: p.orden };
      }),
    );
  }
  redirect(`/tareas/${tarea.id}`);
}
