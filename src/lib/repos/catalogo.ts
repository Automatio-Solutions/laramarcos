import { createClient } from "@/lib/supabase/server";
import type { Servicio, Proveedor, Sector } from "@/lib/types";

// ---- Servicios ----
export async function listServicios(): Promise<Servicio[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("servicios")
    .select("*")
    .order("nombre");
  if (error) throw error;
  return (data ?? []) as Servicio[];
}

export async function getServicio(id: string): Promise<Servicio | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("servicios")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  return (data as Servicio) ?? null;
}

// ---- Proveedores ----
export async function listProveedores(): Promise<Proveedor[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("proveedores")
    .select("*")
    .order("nombre");
  if (error) throw error;
  return (data ?? []) as Proveedor[];
}

export async function getProveedor(id: string): Promise<Proveedor | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("proveedores")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  return (data as Proveedor) ?? null;
}

// ---- Sectores ----
export async function listSectores(): Promise<Sector[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("sectores")
    .select("id,nombre")
    .order("nombre");
  if (error) throw error;
  return (data ?? []) as Sector[];
}
