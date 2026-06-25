"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

// UC-106: adjuntar un fichero (PDF/Excel/escáner/contrato) a la tarea.
export async function subirAdjuntoAction(tareaId: string, formData: FormData) {
  const archivo = formData.get("archivo");
  if (!(archivo instanceof File) || archivo.size === 0) return;

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const admin = createAdminClient();

  const buffer = Buffer.from(await archivo.arrayBuffer());
  const path = `${tareaId}/${Date.now()}-${archivo.name.replace(/[^\w.\-]/g, "_")}`;
  await admin.storage.from("adjuntos").upload(path, buffer, {
    contentType: archivo.type || "application/octet-stream",
    upsert: false,
  });

  await supabase.from("adjuntos").insert({
    tarea_id: tareaId,
    nombre: archivo.name,
    path,
    mime: archivo.type || null,
    size: archivo.size,
    subido_por: user?.id,
  });
  revalidatePath(`/tareas/${tareaId}`);
}

export async function borrarAdjuntoAction(id: string, tareaId: string, path: string) {
  const supabase = await createClient();
  const admin = createAdminClient();
  await supabase.from("adjuntos").delete().eq("id", id);
  await admin.storage.from("adjuntos").remove([path]);
  revalidatePath(`/tareas/${tareaId}`);
}
