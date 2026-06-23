"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export async function createSectorAction(formData: FormData) {
  const nombre = String(formData.get("nombre") ?? "").trim();
  if (!nombre) return;
  const supabase = await createClient();
  await supabase.from("sectores").insert({ nombre });
  revalidatePath("/sectores");
}

export async function deleteSectorAction(id: string) {
  const supabase = await createClient();
  await supabase.from("sectores").delete().eq("id", id);
  revalidatePath("/sectores");
}
