"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { parseCsv, validateImport, type ImportReport } from "@/lib/import/clientes-csv";

export interface ImportState {
  step: "input" | "preview" | "done";
  csv?: string;
  report?: ImportReport;
  message?: string;
}

async function existingCifs(): Promise<Set<string>> {
  const supabase = await createClient();
  const { data } = await supabase.from("clientes").select("cif");
  return new Set((data ?? []).map((r) => (r.cif as string).toUpperCase()));
}

/** La importación masiva solo la hace staff. Devuelve el usuario si lo es, o null. */
async function staffUser(): Promise<{ id: string; oficina: string | null } | null> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data: me } = await supabase.from("usuarios").select("rol, oficina").eq("id", user.id).maybeSingle();
  if (!me || (me.rol !== "responsable" && me.rol !== "admin")) return null;
  return { id: user.id, oficina: (me.oficina as string | null) ?? null };
}

export async function analizarAction(_prev: ImportState, formData: FormData): Promise<ImportState> {
  const csv = String(formData.get("csv") ?? "");
  if (!csv.trim()) return { step: "input", message: "Pega el contenido CSV." };
  const rows = parseCsv(csv);
  if (!rows.length) return { step: "input", message: "No se detectaron filas (¿falta la cabecera?)." };
  const report = validateImport(rows, await existingCifs());
  return { step: "preview", csv, report };
}

export async function confirmarAction(_prev: ImportState, formData: FormData): Promise<ImportState> {
  const staff = await staffUser();
  if (!staff) return { step: "input", message: "Solo un responsable o administrador puede importar clientes." };

  const csv = String(formData.get("csv") ?? "");
  const rows = parseCsv(csv);
  const { valid } = validateImport(rows, await existingCifs());
  if (!valid.length) return { step: "input", message: "No hay filas válidas que importar." };

  const supabase = await createClient();
  const { error } = await supabase.from("clientes").insert(
    valid.map((v) => ({
      cif: v.cif,
      razon_social: v.razon_social,
      email: v.email ?? null,
      telefono: v.telefono ?? null,
      direccion: v.direccion ?? null,
      asesor_id: staff.id,
      // Sin oficina el cliente queda invisible bajo la RLS por sede. Se asigna la
      // oficina de quien importa; luego puede reasignarse desde la ficha.
      oficina: staff.oficina,
    })),
  );
  if (error) return { step: "preview", csv, message: error.message };

  revalidatePath("/clientes");
  redirect("/clientes");
}
