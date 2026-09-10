"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export async function setImporteAction(id: string, formData: FormData) {
  const importe = Number(String(formData.get("importe") ?? "").replace(",", "."));
  if (!Number.isFinite(importe) || importe < 0) return;
  const supabase = await createClient();
  await supabase.from("lineas_factura").update({ importe }).eq("id", id);
  revalidatePath("/facturacion");
}

export async function marcarFacturadaAction(id: string) {
  const supabase = await createClient();
  await supabase.from("lineas_factura").update({ facturada: true }).eq("id", id);
  revalidatePath("/facturacion");
}

/**
 * Elimina una línea de facturación.
 *
 * Uso previsto: líneas creadas por error o residuos de pruebas. Lo normal es
 * marcarla como facturada, no borrarla: eso conserva el histórico del cliente.
 *
 * La RLS solo deja borrar al staff; a un asesor le devolvería 0 filas sin
 * error, así que se comprueba el id devuelto en lugar de fingir que se hizo.
 */
export async function eliminarLineaAction(id: string): Promise<{ error?: string }> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("lineas_factura").delete().eq("id", id).select("id");
  if (error) return { error: error.message };
  if (!data?.length) return { error: "No tienes permiso para eliminar esta línea." };
  revalidatePath("/facturacion");
  return {};
}
