"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { EstadoTarea } from "@/lib/types";

const ESTADOS: EstadoTarea[] = ["pendiente", "en_curso", "bloqueada", "completada"];
const rev = (id: string) => revalidatePath(`/tareas/${id}`);

async function esStaffOResponsable(tareaId: string): Promise<boolean> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return false;
  const { data: me } = await supabase.from("usuarios").select("rol").eq("id", user.id).maybeSingle();
  if (me && (me.rol === "responsable" || me.rol === "admin")) return true;
  const { data: t } = await supabase.from("tareas").select("responsable_id").eq("id", tareaId).maybeSingle();
  return t?.responsable_id === user.id;
}

// ---- UC-102: subtareas ----
export async function addSubtareaAction(tareaId: string, formData: FormData) {
  const titulo = String(formData.get("titulo") ?? "").trim();
  if (!titulo) return;
  const supabase = await createClient();
  const { count } = await supabase.from("subtareas").select("id", { count: "exact", head: true }).eq("tarea_id", tareaId);
  await supabase.from("subtareas").insert({ tarea_id: tareaId, titulo, orden: count ?? 0 });
  rev(tareaId);
}

/** AC-06: la asignación a una persona solo la hace responsable/admin (nunca la IA). */
export async function asignarSubtareaAction(tareaId: string, subtareaId: string, formData: FormData) {
  if (!(await esStaffOResponsable(tareaId))) return;
  const asignado_id = String(formData.get("asignado_id") ?? "").trim() || null;
  const plazo = String(formData.get("plazo") ?? "").trim() || null;
  const supabase = await createClient();
  await supabase.from("subtareas").update({ asignado_id, plazo }).eq("id", subtareaId);
  rev(tareaId);
}

/** Cambia el estado de una subtarea respetando su dependencia (no avanza si la predecesora no está completada). */
export async function setEstadoSubtareaAction(tareaId: string, subtareaId: string, estado: string) {
  if (!ESTADOS.includes(estado as EstadoTarea)) return;
  const supabase = await createClient();
  if (estado === "en_curso" || estado === "completada") {
    const { data: sub } = await supabase.from("subtareas").select("depende_de").eq("id", subtareaId).maybeSingle();
    if (sub?.depende_de) {
      const { data: pre } = await supabase.from("subtareas").select("estado").eq("id", sub.depende_de).maybeSingle();
      if (pre && pre.estado !== "completada") return; // bloqueada por dependencia
    }
  }
  const patch: Record<string, unknown> = { estado };
  if (estado === "completada") patch.completada_at = new Date().toISOString();
  await supabase.from("subtareas").update(patch).eq("id", subtareaId);
  rev(tareaId);
}

// ---- UC-104: bloqueo por terceros ----
export async function toggleBloqueoAction(tareaId: string, formData: FormData) {
  const motivo = String(formData.get("motivo") ?? "").trim();
  const supabase = await createClient();
  const { data: t } = await supabase.from("tareas").select("bloqueada").eq("id", tareaId).maybeSingle();
  const bloquear = !t?.bloqueada;
  await supabase
    .from("tareas")
    .update({
      bloqueada: bloquear,
      motivo_bloqueo: bloquear ? motivo || "Bloqueada" : null,
      estado: bloquear ? "bloqueada" : "pendiente",
    })
    .eq("id", tareaId);
  rev(tareaId);
}

// ---- UC-105: comentarios con @menciones ----
export async function addComentarioAction(tareaId: string, formData: FormData) {
  const texto = String(formData.get("texto") ?? "").trim();
  if (!texto) return;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  // Resolver @menciones a ids de usuario por nombre
  const tokens = [...texto.matchAll(/@([\p{L}]+)/gu)].map((m) => m[1].toLowerCase());
  let menciones: string[] = [];
  if (tokens.length) {
    const { data: users } = await supabase.from("usuarios").select("id, nombre");
    menciones = (users ?? [])
      .filter((u) => tokens.some((tok) => (u.nombre as string).toLowerCase().includes(tok)))
      .map((u) => u.id as string);
  }

  await supabase.from("comentarios").insert({
    tarea_id: tareaId,
    autor_id: user?.id,
    texto,
    menciones,
  });
  rev(tareaId);
}

// ---- UC-107: dependencias entre tareas ----
export async function addDependenciaAction(tareaId: string, formData: FormData) {
  if (!(await esStaffOResponsable(tareaId))) return;
  const depende_de_id = String(formData.get("depende_de_id") ?? "").trim();
  if (!depende_de_id || depende_de_id === tareaId) return;
  const supabase = await createClient();
  await supabase.from("dependencias_tarea").insert({ tarea_id: tareaId, depende_de_id });
  rev(tareaId);
}

export async function removeDependenciaAction(tareaId: string, dependeDeId: string) {
  const supabase = await createClient();
  await supabase.from("dependencias_tarea").delete().eq("tarea_id", tareaId).eq("depende_de_id", dependeDeId);
  rev(tareaId);
}

// ---- UC-108: control de tiempo ----
export async function addTiempoAction(tareaId: string, formData: FormData) {
  const minutos = Number(String(formData.get("minutos") ?? "").replace(",", "."));
  if (!Number.isFinite(minutos) || minutos <= 0) return;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  await supabase.from("tiempos").insert({
    tarea_id: tareaId,
    usuario_id: user?.id,
    segundos: Math.round(minutos * 60),
    nota: String(formData.get("nota") ?? "").trim() || null,
  });
  rev(tareaId);
}
