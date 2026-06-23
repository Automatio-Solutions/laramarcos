"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { aceptarPresupuesto } from "@/lib/presupuesto/aceptar";

// UC-205: aceptación digital pública por token (el cliente hace clic en el enlace).
export async function aceptarPorTokenAction(token: string) {
  const admin = createAdminClient();
  const { data: pre } = await admin.from("presupuestos").select("id").eq("token", token).maybeSingle();
  if (!pre) return;

  const h = await headers();
  const ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;
  await aceptarPresupuesto(admin, pre.id, ip);
  revalidatePath(`/p/${token}`);
}

export async function rechazarPorTokenAction(token: string) {
  const admin = createAdminClient();
  await admin.from("presupuestos").update({ estado: "rechazado", rechazado_at: new Date().toISOString() }).eq("token", token);
  revalidatePath(`/p/${token}`);
}
