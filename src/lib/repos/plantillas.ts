import { createClient } from "@/lib/supabase/server";
import type { PasoPlantilla } from "@/lib/types";

export async function getPasos(servicioId: string): Promise<PasoPlantilla[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("plantillas_subtareas")
    .select("pasos")
    .eq("servicio_id", servicioId)
    .maybeSingle();
  if (error) throw error;
  return ((data?.pasos as PasoPlantilla[]) ?? []).sort((a, b) => a.orden - b.orden);
}

export { instanciar } from "@/lib/plantilla";
