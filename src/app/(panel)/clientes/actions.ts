"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { validateCliente, hasErrors, type FieldErrors } from "@/lib/validators/cliente";
import type { ClienteInput, Oficina, Sector } from "@/lib/types";

export type CrearSectorResult =
  | { ok: true; sector: Sector }
  | { ok: false; error: string };

/**
 * Crea un sector nuevo desde la ficha de cliente. Si ya existe uno con el
 * mismo nombre (insensible a mayúsculas/acentos del usuario), lo reutiliza en
 * lugar de fallar, para que el sector quede igualmente seleccionable.
 */
export async function crearSectorAction(nombre: string): Promise<CrearSectorResult> {
  const limpio = nombre.trim();
  if (!limpio) return { ok: false, error: "Escribe un nombre de sector." };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Sesión no válida." };

  const { data, error } = await supabase
    .from("sectores")
    .insert({ nombre: limpio })
    .select("id,nombre")
    .single();

  if (!error) {
    revalidatePath("/clientes");
    return { ok: true, sector: data as Sector };
  }

  // 23505 = ya existe un sector con ese nombre → lo reutilizamos.
  if (error.code === "23505") {
    const { data: existente } = await supabase
      .from("sectores")
      .select("id,nombre")
      .ilike("nombre", limpio)
      .single();
    if (existente) return { ok: true, sector: existente as Sector };
    return { ok: false, error: "Ese sector ya existe." };
  }

  // 42501 = RLS / permisos insuficientes (solo staff puede crear sectores).
  if (error.code === "42501") {
    return { ok: false, error: "No tienes permisos para crear sectores." };
  }

  return { ok: false, error: error.message };
}

export interface ClienteFormState {
  ok: boolean;
  errors: FieldErrors;
  message?: string;
}

function parseForm(formData: FormData): ClienteInput {
  // Las cuentas llegan como dos arrays paralelos (iban[i] ↔ descripción[i]).
  const ibans = formData.getAll("cuenta_iban").map(String);
  const descripciones = formData.getAll("cuenta_descripcion").map(String);
  const cuentas = ibans
    .map((iban, i) => ({ iban: iban.trim(), descripcion: (descripciones[i] ?? "").trim() || undefined }))
    .filter((c) => c.iban); // se descartan las filas vacías

  return {
    cif: String(formData.get("cif") ?? "").trim(),
    razon_social: String(formData.get("razon_social") ?? "").trim(),
    direccion: String(formData.get("direccion") ?? "").trim() || undefined,
    ciudad: String(formData.get("ciudad") ?? "").trim() || undefined,
    codigo_postal: String(formData.get("codigo_postal") ?? "").trim() || undefined,
    email: String(formData.get("email") ?? "").trim() || undefined,
    telefono: String(formData.get("telefono") ?? "").trim() || undefined,
    asesor_id: (String(formData.get("asesor_id") ?? "").trim() || null) as string | null,
    oficina: (String(formData.get("oficina") ?? "").trim() || null) as Oficina | null,
    carpeta_url: String(formData.get("carpeta_url") ?? "").trim() || undefined,
    fecha_baja: String(formData.get("fecha_baja") ?? "").trim() || undefined,
    cuentas,
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

  // Al fijar la fecha de finalización el cliente deja de estar activo.
  const fechaBaja = input.fecha_baja ?? null;

  const fields = {
    cif: input.cif.toUpperCase(),
    razon_social: input.razon_social,
    direccion: input.direccion ?? null,
    ciudad: input.ciudad ?? null,
    codigo_postal: input.codigo_postal ?? null,
    email: input.email ?? null,
    telefono: input.telefono ?? null,
    asesor_id: asesorId,
    oficina: input.oficina ?? null,
    carpeta_url: input.carpeta_url ?? null,
    fecha_baja: fechaBaja,
    activo: !fechaBaja,
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

  // Sincronizar cuentas bancarias (se reemplaza el juego completo)
  await supabase.from("cliente_cuentas").delete().eq("cliente_id", clienteId);
  if (input.cuentas.length) {
    await supabase.from("cliente_cuentas").insert(
      input.cuentas.map((c) => ({
        cliente_id: clienteId,
        iban: c.iban.toUpperCase().replace(/\s/g, ""),
        descripcion: c.descripcion ?? null,
      })),
    );
  }

  revalidatePath("/clientes");
  revalidatePath(`/clientes/${clienteId}`);
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

// ---------------------------------------------------------------------------
// Servicios contratados y evolución de la cuota (ficha de cliente)
// ---------------------------------------------------------------------------

/** Contrata un servicio para el cliente, con su fecha de inicio y cuota inicial. */
export async function contratarServicioAction(clienteId: string, formData: FormData) {
  const servicio_id = String(formData.get("servicio_id") ?? "").trim();
  if (!servicio_id) return;
  const fecha_inicio = String(formData.get("fecha_inicio") ?? "").trim() || new Date().toISOString().slice(0, 10);
  const importe = Number(String(formData.get("importe") ?? "").replace(",", "."));

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("cliente_servicios")
    .insert({ cliente_id: clienteId, servicio_id, fecha_inicio })
    .select("id")
    .single();
  if (error || !data) return;

  // La cuota inicial arranca el mismo día que el servicio.
  if (Number.isFinite(importe) && importe >= 0) {
    await supabase.from("cliente_servicio_cuotas").insert({
      cliente_servicio_id: data.id,
      importe,
      fecha_efecto: fecha_inicio,
      nota: "Cuota inicial",
    });
  }
  revalidatePath(`/clientes/${clienteId}`);
}

/** Registra un cambio de cuota: no pisa el precio anterior, lo encadena. */
export async function cambiarCuotaAction(clienteId: string, clienteServicioId: string, formData: FormData) {
  const importe = Number(String(formData.get("importe") ?? "").replace(",", "."));
  if (!Number.isFinite(importe) || importe < 0) return;
  const fecha_efecto = String(formData.get("fecha_efecto") ?? "").trim() || new Date().toISOString().slice(0, 10);
  const nota = String(formData.get("nota") ?? "").trim() || null;

  const supabase = await createClient();
  await supabase.from("cliente_servicio_cuotas").insert({
    cliente_servicio_id: clienteServicioId,
    importe,
    fecha_efecto,
    nota,
  });
  revalidatePath(`/clientes/${clienteId}`);
}

/** Marca la fecha de fin de un servicio contratado (el cliente lo deja). */
export async function finalizarServicioAction(clienteId: string, clienteServicioId: string, formData: FormData) {
  const fecha_fin = String(formData.get("fecha_fin") ?? "").trim() || new Date().toISOString().slice(0, 10);
  const supabase = await createClient();
  await supabase.from("cliente_servicios").update({ fecha_fin }).eq("id", clienteServicioId);
  revalidatePath(`/clientes/${clienteId}`);
}

/** Elimina un servicio contratado y todo su histórico de cuotas. */
export async function eliminarServicioContratadoAction(clienteId: string, clienteServicioId: string) {
  const supabase = await createClient();
  await supabase.from("cliente_servicios").delete().eq("id", clienteServicioId);
  revalidatePath(`/clientes/${clienteId}`);
}
