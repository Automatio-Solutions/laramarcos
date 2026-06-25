import { createClient } from "@/lib/supabase/server";
import type { UsuarioDetalle } from "@/lib/types";

const SELECT = "id,nombre,email,rol,oficina,activo,created_at";

export async function listUsuarios(search?: string): Promise<UsuarioDetalle[]> {
  const supabase = await createClient();
  let query = supabase.from("usuarios").select(SELECT).order("nombre");
  if (search?.trim()) {
    const term = `%${search.trim()}%`;
    query = query.or(`nombre.ilike.${term},email.ilike.${term}`);
  }
  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []) as UsuarioDetalle[];
}

export async function getUsuario(id: string): Promise<UsuarioDetalle | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("usuarios")
    .select(SELECT)
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  return (data as UsuarioDetalle | null) ?? null;
}

/** Rol del usuario autenticado (para gating de rutas staff). */
export async function getMiRol(): Promise<string | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const { data } = await supabase
    .from("usuarios")
    .select("rol")
    .eq("id", user.id)
    .maybeSingle();
  return data?.rol ?? null;
}
