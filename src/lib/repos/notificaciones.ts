import { createClient } from "@/lib/supabase/server";
import type { Notificacion } from "@/lib/types";

export async function listNotificaciones(limit = 12): Promise<Notificacion[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("notificaciones")
    .select("id, tipo, mensaje, enlace, leida, created_at")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) return [];
  return (data ?? []) as Notificacion[];
}

export async function countNoLeidas(): Promise<number> {
  const supabase = await createClient();
  const { count } = await supabase
    .from("notificaciones")
    .select("id", { count: "exact", head: true })
    .eq("leida", false);
  return count ?? 0;
}
