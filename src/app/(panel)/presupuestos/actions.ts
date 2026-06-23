"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { generarPresupuesto } from "@/lib/presupuesto/generar";
import { calcularTotal, type LineaPresupuesto } from "@/lib/presupuesto/core";
import { aceptarPresupuesto } from "@/lib/presupuesto/aceptar";

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
  const { data: servicios } = await supabase.from("servicios").select("id, nombre, precio_base").eq("activo", true);

  const gen = await generarPresupuesto(texto, (servicios ?? []) as { id: string; nombre: string; precio_base: number }[]);
  const { total } = calcularTotal(gen.lineas, 0);

  const { data: pre } = await supabase
    .from("presupuestos")
    .insert({ cliente_id, servicio_id, lineas: gen.lineas, total, creado_por: user?.id, estado: "borrador" })
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
  const { total } = calcularTotal(lineas, descuento_global);

  const supabase = await createClient();
  await supabase
    .from("presupuestos")
    .update({
      lineas,
      descuento_global,
      total,
      condiciones: String(formData.get("condiciones") ?? "").trim() || null,
      validez_dias: Number(formData.get("validez_dias") ?? 30) || 30,
    })
    .eq("id", id);
  revalidatePath(`/presupuestos/${id}`);
}

// UC-204: envío (con Resend si hay clave; si no, marca enviado).
export async function enviarPresupuestoAction(id: string) {
  const supabase = await createClient();
  await supabase.from("presupuestos").update({ estado: "enviado", enviado_at: new Date().toISOString() }).eq("id", id);
  // TODO: si RESEND_API_KEY, enviar email con el PDF + enlace de aceptación (token).
  revalidatePath(`/presupuestos/${id}`);
}

// UC-205/207: aceptación manual desde el panel → crea tarea + subtareas.
export async function aceptarManualAction(id: string) {
  const supabase = await createClient();
  await aceptarPresupuesto(supabase, id, "manual-panel");
  revalidatePath(`/presupuestos/${id}`);
}

export async function rechazarPresupuestoAction(id: string) {
  const supabase = await createClient();
  await supabase.from("presupuestos").update({ estado: "rechazado", rechazado_at: new Date().toISOString() }).eq("id", id);
  revalidatePath(`/presupuestos/${id}`);
}
