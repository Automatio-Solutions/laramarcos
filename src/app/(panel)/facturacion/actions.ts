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
