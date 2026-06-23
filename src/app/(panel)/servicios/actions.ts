"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export interface FormState {
  ok: boolean;
  errors: Record<string, string>;
  message?: string;
}

function parse(formData: FormData) {
  const nombre = String(formData.get("nombre") ?? "").trim();
  const precioRaw = String(formData.get("precio_base") ?? "").replace(",", ".").trim();
  const precio = Number(precioRaw);
  const errors: Record<string, string> = {};
  if (!nombre) errors.nombre = "El nombre es obligatorio.";
  if (!precioRaw || Number.isNaN(precio) || precio < 0)
    errors.precio_base = "El precio base debe ser un número ≥ 0.";
  return {
    fields: {
      nombre,
      categoria: String(formData.get("categoria") ?? "").trim() || null,
      precio_base: precio,
      condiciones_default: String(formData.get("condiciones_default") ?? "").trim() || null,
    },
    errors,
  };
}

async function persist(formData: FormData, id: string | null): Promise<FormState> {
  const { fields, errors } = parse(formData);
  if (Object.keys(errors).length) return { ok: false, errors };
  const supabase = await createClient();
  const { error } = id
    ? await supabase.from("servicios").update(fields).eq("id", id)
    : await supabase.from("servicios").insert(fields);
  if (error) return { ok: false, errors: {}, message: error.message };
  revalidatePath("/servicios");
  return { ok: true, errors: {} };
}

export async function createServicioAction(_p: FormState, fd: FormData): Promise<FormState> {
  const r = await persist(fd, null);
  if (r.ok) redirect("/servicios");
  return r;
}

export async function updateServicioAction(id: string, _p: FormState, fd: FormData): Promise<FormState> {
  const r = await persist(fd, id);
  if (r.ok) redirect("/servicios");
  return r;
}

export async function deleteServicioAction(id: string) {
  const supabase = await createClient();
  await supabase.from("servicios").delete().eq("id", id);
  revalidatePath("/servicios");
}
