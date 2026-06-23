"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { PasoPlantilla } from "@/lib/types";

export async function savePlantillaAction(servicioId: string, formData: FormData) {
  const nombres = formData.getAll("paso_nombre").map(String);
  const plazos = formData.getAll("paso_plazo").map((v) => Number(v));

  const pasos: PasoPlantilla[] = nombres
    .map((nombre, i) => ({
      orden: i + 1,
      nombre: nombre.trim(),
      plazo_relativo_dias: Number.isFinite(plazos[i]) ? plazos[i] : 0,
    }))
    .filter((p) => p.nombre);

  const supabase = await createClient();
  await supabase
    .from("plantillas_subtareas")
    .upsert({ servicio_id: servicioId, pasos }, { onConflict: "servicio_id" });

  revalidatePath(`/servicios/${servicioId}/plantilla`);
}
