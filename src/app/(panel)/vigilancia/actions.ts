"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { procesarBoletines } from "@/lib/vigilancia/procesar";

// Demo/manual: procesa unos items de ejemplo para ver el pipeline (en prod lo hace n8n).
export async function procesarEjemploAction() {
  const admin = createAdminClient();
  const fecha = new Date().toISOString().slice(0, 10);
  const stamp = Date.now();
  await procesarBoletines(admin, fecha, [
    { boletin: "DOE", titulo: `Ayudas para bares y restaurantes de Extremadura, plazo abierto`, enlace: `https://doe.es/ej-${stamp}-1` },
    { boletin: "BOE", titulo: `Nueva obligación de registro para el sector de la construcción`, enlace: `https://boe.es/ej-${stamp}-2` },
    { boletin: "DOE", titulo: `Convocatoria de subvenciones agrarias y de ganadería`, enlace: `https://doe.es/ej-${stamp}-3` },
  ]);
  revalidatePath("/vigilancia");
}
