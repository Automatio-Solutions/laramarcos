"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export async function createRecurrenteAction(formData: FormData) {
  const servicio_id = String(formData.get("servicio_id") ?? "").trim();
  if (!servicio_id) return;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  await supabase.from("presupuestos_recurrentes").insert({
    cliente_id: String(formData.get("cliente_id") ?? "").trim() || null,
    servicio_id,
    periodo_dias: Number(formData.get("periodo_dias") ?? 90) || 90,
    proximo: String(formData.get("proximo") ?? "").trim() || new Date().toISOString().slice(0, 10),
    creado_por: user?.id,
  });
  revalidatePath("/presupuestos/recurrentes");
}

export async function toggleRecurrenteAction(id: string, activo: boolean) {
  const supabase = await createClient();
  await supabase.from("presupuestos_recurrentes").update({ activo: !activo }).eq("id", id);
  revalidatePath("/presupuestos/recurrentes");
}

export async function deleteRecurrenteAction(id: string) {
  const supabase = await createClient();
  await supabase.from("presupuestos_recurrentes").delete().eq("id", id);
  revalidatePath("/presupuestos/recurrentes");
}
