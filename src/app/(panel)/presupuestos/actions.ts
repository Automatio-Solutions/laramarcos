"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { generarPresupuesto } from "@/lib/presupuesto/generar";
import { calcularTotal, type LineaPresupuesto, type ServicioCatalogo } from "@/lib/presupuesto/core";
import { aceptarPresupuesto } from "@/lib/presupuesto/aceptar";
import { enviarEmail, hayResend, appUrl, REMITENTE_PRESUPUESTOS } from "@/lib/email/cliente";
import { emailPresupuesto } from "@/lib/email/plantillas";

export interface GenState {
  aviso?: string;
}

// UC-201: crea un presupuesto borrador desde texto libre (Claude o fallback).
export async function generarPresupuestoAction(_p: GenState, formData: FormData): Promise<GenState> {
  const texto = String(formData.get("texto") ?? "").trim();
  const cliente_id = String(formData.get("cliente_id") ?? "").trim() || null;
  const servicio_id = String(formData.get("servicio_id") ?? "").trim() || null;
  if (!texto) return { aviso: "Describe la gestión." };

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  // El código y la unidad son necesarios para que la IA distinga las tarifas
  // horarias de los precios cerrados (tarifario real del despacho).
  const { data: servicios } = await supabase
    .from("servicios")
    .select("id, nombre, precio_base, codigo, unidad")
    .eq("activo", true);

  const gen = await generarPresupuesto(texto, (servicios ?? []) as ServicioCatalogo[]);
  const { base_imponible, iva_cuota, total } = calcularTotal(gen.lineas, 0);

  const { data: pre } = await supabase
    .from("presupuestos")
    .insert({
      cliente_id, servicio_id, lineas: gen.lineas,
      base_imponible, iva_cuota, total,
      creado_por: user?.id, estado: "borrador",
    })
    .select("id")
    .single();

  if (pre) redirect(`/presupuestos/${pre.id}`);
  return { aviso: gen.aviso ?? "No se pudo crear el presupuesto." };
}

// UC-202: guardar el editor (líneas, descuento, condiciones).
export async function guardarPresupuestoAction(id: string, formData: FormData) {
  const conceptos = formData.getAll("concepto").map(String);
  const cantidades = formData.getAll("cantidad").map((v) => Number(v));
  const precios = formData.getAll("precio").map((v) => Number(v));
  const descuentos = formData.getAll("descuento").map((v) => Number(v));
  const lineas: LineaPresupuesto[] = conceptos
    .map((concepto, i) => ({
      concepto: concepto.trim(),
      cantidad: cantidades[i] || 0,
      precio: precios[i] || 0,
      descuento: descuentos[i] || 0,
    }))
    .filter((l) => l.concepto);

  const descuento_global = Number(formData.get("descuento_global") ?? 0) || 0;
  const { base_imponible, iva_cuota, total } = calcularTotal(lineas, descuento_global);

  const supabase = await createClient();
  await supabase
    .from("presupuestos")
    .update({
      lineas,
      descuento_global,
      base_imponible,
      iva_cuota,
      total,
      condiciones: String(formData.get("condiciones") ?? "").trim() || null,
      validez_dias: Number(formData.get("validez_dias") ?? 30) || 30,
    })
    .eq("id", id);
  revalidatePath(`/presupuestos/${id}`);
}

// UC-204: envío al cliente por Resend con el enlace de aceptación.
// Si no hay clave configurada, marca enviado igual (envío manual) y avisa.
export async function enviarPresupuestoAction(id: string) {
  const supabase = await createClient();
  const { data: p } = await supabase
    .from("presupuestos")
    .select("token, total, validez_dias, cliente:clientes(razon_social, email)")
    .eq("id", id)
    .maybeSingle();

  if (!p) redirect(`/presupuestos/${id}?aviso=${encodeURIComponent("No se encontró el presupuesto.")}`);

  const cliente = p.cliente as unknown as { razon_social: string; email: string | null } | null;
  const enlace = `${appUrl()}/p/${p.token}`;

  const marcarEnviado = async () =>
    supabase
      .from("presupuestos")
      .update({ estado: "enviado", enviado_at: new Date().toISOString() })
      .eq("id", id);

  // Sin clave de Resend: el despacho manda el enlace a mano, pero el estado avanza.
  if (!hayResend()) {
    await marcarEnviado();
    revalidatePath(`/presupuestos/${id}`);
    redirect(`/presupuestos/${id}?aviso=${encodeURIComponent(`Marcado como enviado. No hay correo configurado: envíe este enlace al cliente — ${enlace}`)}`);
  }

  if (!cliente?.email) {
    redirect(`/presupuestos/${id}?aviso=${encodeURIComponent("El cliente no tiene email en su ficha. Añádelo y vuelve a enviar.")}`);
  }

  const { asunto, html } = emailPresupuesto({
    cliente: cliente.razon_social ?? "",
    total: Number(p.total),
    validezDias: p.validez_dias ?? 30,
    enlace,
  });

  const res = await enviarEmail({
    from: REMITENTE_PRESUPUESTOS,
    to: cliente.email,
    replyTo: "presupuestos@laramarcosasesores.es",
    subject: asunto,
    html,
  });

  // Si el correo falla, NO se marca como enviado: el estado del panel no puede
  // mentir sobre lo que ha recibido el cliente.
  if (!res.ok) {
    redirect(`/presupuestos/${id}?aviso=${encodeURIComponent(`No se pudo enviar: ${res.error ?? "error desconocido"}`)}`);
  }

  await supabase
    .from("presupuestos")
    .update({ estado: "enviado", enviado_at: new Date().toISOString(), resend_msg_id: res.id ?? null })
    .eq("id", id);
  revalidatePath(`/presupuestos/${id}`);
  redirect(`/presupuestos/${id}?aviso=${encodeURIComponent(`Presupuesto enviado a ${cliente.email}`)}`);
}

// UC-205/207: aceptación manual desde el panel → crea tarea + subtareas.
export async function aceptarManualAction(id: string) {
  const supabase = await createClient();
  await aceptarPresupuesto(supabase, id, "manual-panel");
  revalidatePath(`/presupuestos/${id}`);
}

/**
 * Elimina un presupuesto.
 *
 * La RLS solo deja borrar al staff (responsable/admin); a un asesor le
 * devolvería 0 filas sin error. Por eso se pide el id borrado y se avisa,
 * en lugar de fingir que se hizo.
 *
 * El borrado queda registrado en Auditoría por el trigger de la tabla.
 */
export async function eliminarPresupuestoAction(id: string): Promise<{ error?: string }> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("presupuestos").delete().eq("id", id).select("id");
  if (error) return { error: error.message };
  if (!data?.length) return { error: "No tienes permiso para eliminar este presupuesto." };
  revalidatePath("/presupuestos");
  return {};
}

export async function rechazarPresupuestoAction(id: string) {
  const supabase = await createClient();
  await supabase.from("presupuestos").update({ estado: "rechazado", rechazado_at: new Date().toISOString() }).eq("id", id);
  revalidatePath(`/presupuestos/${id}`);
}
