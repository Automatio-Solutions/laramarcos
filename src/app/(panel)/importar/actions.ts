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

export async function analizarAction(_prev: ImportState, formData: FormData): Promise<ImportState> {
  const csv = String(formData.get("csv") ?? "");
  if (!csv.trim()) return { step: "input", message: "Pega el contenido CSV." };
  const rows = parseCsv(csv);
  if (!rows.length) return { step: "input", message: "No se detectaron filas (¿falta la cabecera?)." };
  const report = validateImport(rows, await existingCifs());
  return { step: "preview", csv, report };
}

export async function confirmarAction(_prev: ImportState, formData: FormData): Promise<ImportState> {
  const csv = String(formData.get("csv") ?? "");
  const rows = parseCsv(csv);
  const { valid } = validateImport(rows, await existingCifs());
  if (!valid.length) return { step: "input", message: "No hay filas válidas que importar." };

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const { error } = await supabase.from("clientes").insert(
    valid.map((v) => ({
      cif: v.cif,
      razon_social: v.razon_social,
      email: v.email ?? null,
      telefono: v.telefono ?? null,
      direccion: v.direccion ?? null,
      asesor_id: user?.id ?? null,
    })),
  );
  if (error) return { step: "preview", csv, message: error.message };

  revalidatePath("/clientes");
  redirect("/clientes");
}
