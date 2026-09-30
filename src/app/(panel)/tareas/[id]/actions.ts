"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { EstadoTarea } from "@/lib/types";
import { resuelveMencionesComentario } from "@/lib/chat/core";

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

/** Elimina una subtarea. */
export async function eliminarSubtareaAction(tareaId: string, subtareaId: string) {
  const supabase = await createClient();
  await supabase.from("subtareas").delete().eq("id", subtareaId);
  rev(tareaId);
}

// ---- UC-104: el bloqueo es AUTOMÁTICO (subtareas vencidas sin completar);
//      se calcula en la capa de lectura (repos/tareas.ts y TareaDetalleView), no hay acción manual. ----

/** Guarda la descripción / notas libres de la tarea. */
export async function updateDescripcionAction(tareaId: string, formData: FormData) {
  const descripcion = String(formData.get("descripcion") ?? "").trim() || null;
  const supabase = await createClient();
  await supabase.from("tareas").update({ descripcion }).eq("id", tareaId);
  rev(tareaId);
}

// ---- UC-105: comentarios con @menciones ----
export async function addComentarioAction(tareaId: string, formData: FormData) {
  const texto = String(formData.get("texto") ?? "").trim();
  if (!texto) return;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;

  // Resolver @menciones por inicio de palabra ("@ana" → "Ana María", no "Mariana") y
  // solo entre quienes pueden ver la tarea (tarea_quienes_ven, 0022): así nadie recibe
  // un aviso que lleve a una tarea que no puede abrir. Vacío si el autor no la ve.
  let menciones: string[] = [];
  if (texto.includes("@")) {
    const { data: candidatos } = await supabase.rpc("tarea_quienes_ven", { p_tarea: tareaId });
    menciones = resuelveMencionesComentario(
      texto,
      (candidatos ?? []) as { id: string; nombre: string }[],
      user.id,
    );
  }

  // La RLS (comentarios_insert, 0022) exige firmar como uno mismo y poder ver la tarea.
  const { error } = await supabase.from("comentarios").insert({
    tarea_id: tareaId,
    autor_id: user.id,
    texto,
    menciones,
  });
  if (error) return; // sin comentario no hay avisos

  // AC-12: notificar in-app a cada persona mencionada (el autor ya está excluido)
  for (const uid of menciones) {
    await supabase.rpc("crear_notificacion", {
      p_usuario: uid,
      p_tipo: "mencion",
      p_mensaje: `Te han mencionado en una tarea`,
      p_enlace: `/tareas/${tareaId}`,
    });
  }
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
