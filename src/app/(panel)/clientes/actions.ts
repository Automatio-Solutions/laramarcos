"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { validateCliente, hasErrors, type FieldErrors } from "@/lib/validators/cliente";
import type { ClienteInput } from "@/lib/types";

export interface ClienteFormState {
  ok: boolean;
  errors: FieldErrors;
  message?: string;
}

function parseForm(formData: FormData): ClienteInput {
  return {
    cif: String(formData.get("cif") ?? "").trim(),
    razon_social: String(formData.get("razon_social") ?? "").trim(),
    direccion: String(formData.get("direccion") ?? "").trim() || undefined,
    ciudad: String(formData.get("ciudad") ?? "").trim() || undefined,
    codigo_postal: String(formData.get("codigo_postal") ?? "").trim() || undefined,
    email: String(formData.get("email") ?? "").trim() || undefined,
    telefono: String(formData.get("telefono") ?? "").trim() || undefined,
    iban: String(formData.get("iban") ?? "").trim() || undefined,
    condiciones_pago: String(formData.get("condiciones_pago") ?? "").trim() || undefined,
    asesor_id: (String(formData.get("asesor_id") ?? "").trim() || null) as string | null,
    sector_ids: formData.getAll("sector_ids").map(String).filter(Boolean),
  };
}

async function persist(
  input: ClienteInput,
  id: string | null,
): Promise<ClienteFormState> {
  const errors = validateCliente(input);
  if (hasErrors(errors)) return { ok: false, errors };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, errors: {}, message: "Sesión no válida." };

  // Si no se asigna asesor explícitamente, el creador es el asesor por defecto.
  const asesorId = input.asesor_id ?? user.id;

  const fields = {
    cif: input.cif.toUpperCase(),
    razon_social: input.razon_social,
    direccion: input.direccion ?? null,
    ciudad: input.ciudad ?? null,
    codigo_postal: input.codigo_postal ?? null,
    email: input.email ?? null,
    telefono: input.telefono ?? null,
    iban: input.iban ? input.iban.toUpperCase().replace(/\s/g, "") : null,
    condiciones_pago: input.condiciones_pago ?? null,
    asesor_id: asesorId,
  };

  let clienteId = id;
  if (id) {
    const { error } = await supabase.from("clientes").update(fields).eq("id", id);
    if (error) return mapDbError(error);
  } else {
    const { data, error } = await supabase
      .from("clientes")
      .insert(fields)
      .select("id")
      .single();
    if (error) return mapDbError(error);
    clienteId = data!.id;
  }

  // Sincronizar sectores (N:M)
  await supabase.from("cliente_sectores").delete().eq("cliente_id", clienteId);
  if (input.sector_ids.length) {
    await supabase.from("cliente_sectores").insert(
      input.sector_ids.map((sector_id) => ({ cliente_id: clienteId, sector_id })),
    );
  }

  revalidatePath("/clientes");
  return { ok: true, errors: {} };
}

function mapDbError(error: { code?: string; message: string }): ClienteFormState {
  // 23505 = unique_violation (CIF duplicado)
  if (error.code === "23505") {
    return { ok: false, errors: { cif: "Ya existe un cliente con ese CIF/NIF." } };
  }
  return { ok: false, errors: {}, message: error.message };
}

export async function createClienteAction(
  _prev: ClienteFormState,
  formData: FormData,
): Promise<ClienteFormState> {
  const result = await persist(parseForm(formData), null);
  if (result.ok) redirect("/clientes");
  return result;
}

export async function updateClienteAction(
  id: string,
  _prev: ClienteFormState,
  formData: FormData,
): Promise<ClienteFormState> {
  const result = await persist(parseForm(formData), id);
  if (result.ok) redirect("/clientes");
  return result;
}
