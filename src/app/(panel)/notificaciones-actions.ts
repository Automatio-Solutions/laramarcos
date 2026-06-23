"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export async function marcarLeidaAction(id: string) {
  const supabase = await createClient();
  await supabase.from("notificaciones").update({ leida: true }).eq("id", id);
  revalidatePath("/", "layout");
}

export async function marcarTodasLeidasAction() {
  const supabase = await createClient();
  await supabase.from("notificaciones").update({ leida: true }).eq("leida", false);
  revalidatePath("/", "layout");
}
