"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { isValidNifCif } from "@/lib/validators/identity";

export interface FormState {
  ok: boolean;
  errors: Record<string, string>;
  message?: string;
}

function parse(formData: FormData) {
  const cif = String(formData.get("cif") ?? "").trim().toUpperCase();
  const nombre = String(formData.get("nombre") ?? "").trim();
  const ivaRaw = String(formData.get("iva_default") ?? "").replace(",", ".").trim();
  const errors: Record<string, string> = {};
  if (!cif) errors.cif = "El CIF es obligatorio.";
  else if (!isValidNifCif(cif)) errors.cif = "CIF/NIF inválido (dígito de control incorrecto).";
  if (!nombre) errors.nombre = "El nombre es obligatorio.";
  if (ivaRaw && (Number.isNaN(Number(ivaRaw)) || Number(ivaRaw) < 0))
    errors.iva_default = "El IVA debe ser un número ≥ 0.";
  return {
    fields: {
      cif,
      nombre,
      subcuenta_habitual: String(formData.get("subcuenta_habitual") ?? "").trim() || null,
      iva_default: ivaRaw ? Number(ivaRaw) : null,
    },
    errors,
  };
}

async function persist(formData: FormData, id: string | null): Promise<FormState> {
  const { fields, errors } = parse(formData);
  if (Object.keys(errors).length) return { ok: false, errors };
  const supabase = await createClient();
  const { error } = id
    ? await supabase.from("proveedores").update(fields).eq("id", id)
    : await supabase.from("proveedores").insert(fields);
  if (error) {
    if (error.code === "23505") return { ok: false, errors: { cif: "Ya existe un proveedor con ese CIF." } };
    return { ok: false, errors: {}, message: error.message };
  }
  revalidatePath("/proveedores");
  return { ok: true, errors: {} };
}

export async function createProveedorAction(_p: FormState, fd: FormData): Promise<FormState> {
  const r = await persist(fd, null);
  if (r.ok) redirect("/proveedores");
  return r;
}

export async function updateProveedorAction(id: string, _p: FormState, fd: FormData): Promise<FormState> {
  const r = await persist(fd, id);
  if (r.ok) redirect("/proveedores");
  return r;
}

export async function deleteProveedorAction(id: string) {
  const supabase = await createClient();
  await supabase.from("proveedores").delete().eq("id", id);
  revalidatePath("/proveedores");
}
