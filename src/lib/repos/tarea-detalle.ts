import { createClient } from "@/lib/supabase/server";
import type {
  TareaConRelaciones,
  Subtarea,
  ComentarioConAutor,
  TiempoRow,
  DependenciaTarea,
} from "@/lib/types";

export interface ActividadItem {
  ts: string;
  texto: string;
  usuario_nombre: string | null;
  icono: string;
}

export interface TareaDetalle {
  tarea: TareaConRelaciones;
  subtareas: Subtarea[];
  comentarios: ComentarioConAutor[];
  tiempos: TiempoRow[];
  segundosTotal: number;
  dependencias: DependenciaTarea[];
  actividad: ActividadItem[];
}

const ESTADO_TXT: Record<string, string> = {
  pendiente: "Pendiente", en_curso: "En curso", bloqueada: "Bloqueada", completada: "Completada",
};

/** Construye el registro de actividad de la tarea a partir de la auditoría + comentarios + tiempos. */
async function construirActividad(
  supabase: Awaited<ReturnType<typeof createClient>>,
  tareaId: string,
  subtareaIds: string[],
  comentarios: ComentarioConAutor[],
  tiempos: TiempoRow[],
): Promise<ActividadItem[]> {
  const ids = [tareaId, ...subtareaIds];
  const { data: aud } = await supabase
    .from("auditoria")
    .select("usuario_id, tabla, operacion, diff, ts")
    .in("tabla", ["tareas", "subtareas"])
    .in("registro_id", ids)
    .order("ts", { ascending: false });

  // Resolver nombres de usuario
  const userIds = [...new Set((aud ?? []).map((r) => r.usuario_id).filter(Boolean) as string[])];
  const nombres = new Map<string, string>();
  if (userIds.length) {
    const { data: us } = await supabase.from("usuarios").select("id, nombre").in("id", userIds);
    for (const u of us ?? []) nombres.set(u.id as string, u.nombre as string);
  }

  const items: ActividadItem[] = [];
  for (const r of aud ?? []) {
    const usuario = r.usuario_id ? nombres.get(r.usuario_id as string) ?? null : "Sistema";
    const diff = r.diff as { old?: Record<string, unknown>; new?: Record<string, unknown> } | null;
    const esTarea = r.tabla === "tareas";
    if (r.operacion === "INSERT") {
      items.push({ ts: r.ts as string, usuario_nombre: usuario, icono: esTarea ? "🆕" : "➕", texto: esTarea ? "Creó la tarea" : `Añadió la subtarea «${diff?.new?.titulo ?? ""}»` });
    } else if (r.operacion === "UPDATE" && diff?.old && diff?.new) {
      const o = diff.old, n = diff.new;
      if (o.estado !== n.estado) {
        items.push({ ts: r.ts as string, usuario_nombre: usuario, icono: "🔄", texto: `${esTarea ? "" : "Subtarea: "}Estado «${ESTADO_TXT[o.estado as string] ?? o.estado}» → «${ESTADO_TXT[n.estado as string] ?? n.estado}»` });
      } else if (esTarea && o.bloqueada !== n.bloqueada) {
        items.push({ ts: r.ts as string, usuario_nombre: usuario, icono: n.bloqueada ? "⛔" : "✅", texto: n.bloqueada ? `Bloqueó la tarea (${n.motivo_bloqueo ?? ""})` : "Desbloqueó la tarea" });
      } else if (esTarea && o.archivada !== n.archivada) {
        items.push({ ts: r.ts as string, usuario_nombre: usuario, icono: "🗄", texto: n.archivada ? "Archivó la tarea" : "Restauró la tarea" });
      } else if (!esTarea && o.asignado_id !== n.asignado_id) {
        items.push({ ts: r.ts as string, usuario_nombre: usuario, icono: "👤", texto: `Asignó la subtarea «${n.titulo ?? ""}»` });
      }
    }
  }
  for (const c of comentarios) {
    items.push({ ts: c.created_at, usuario_nombre: c.autor_nombre, icono: "💬", texto: `Comentó: ${c.texto.length > 60 ? c.texto.slice(0, 60) + "…" : c.texto}` });
  }
  for (const t of tiempos) {
    items.push({ ts: t.ts, usuario_nombre: t.usuario_nombre, icono: "⏱", texto: `Registró ${Math.round(t.segundos / 60)} min${t.nota ? ` · ${t.nota}` : ""}` });
  }
  return items.sort((a, b) => (a.ts < b.ts ? 1 : -1));
}

export async function getTareaDetalle(id: string): Promise<TareaDetalle | null> {
  const supabase = await createClient();

  const { data: tareaRow } = await supabase
    .from("tareas")
    .select(
      "*, cliente:clientes(razon_social), responsable:usuarios!tareas_responsable_id_fkey(nombre)",
    )
    .eq("id", id)
    .maybeSingle();
  if (!tareaRow) return null;

  const t = tareaRow as Record<string, unknown>;
  const tarea: TareaConRelaciones = {
    id: t.id as string,
    cliente_id: t.cliente_id as string | null,
    titulo: t.titulo as string,
    descripcion: t.descripcion as string | null,
    categoria: t.categoria as string | null,
    estado: t.estado as TareaConRelaciones["estado"],
    vencimiento: t.vencimiento as string | null,
    bloqueada: t.bloqueada as boolean,
    motivo_bloqueo: t.motivo_bloqueo as string | null,
    responsable_id: t.responsable_id as string | null,
    created_at: t.created_at as string,
    cliente_nombre: (t.cliente as { razon_social: string } | null)?.razon_social ?? null,
    responsable_nombre: (t.responsable as { nombre: string } | null)?.nombre ?? null,
    subtareas_pendientes: 0,
    bloqueada_por: [],
  };

  const [subRes, comRes, tiempoRes, depRes] = await Promise.all([
    supabase
      .from("subtareas")
      .select("id, tarea_id, titulo, asignado_id, plazo, estado, orden, asignado:usuarios!subtareas_asignado_id_fkey(nombre)")
      .eq("tarea_id", id)
      .order("orden"),
    supabase
      .from("comentarios")
      .select("id, texto, menciones, created_at, autor:usuarios!comentarios_autor_id_fkey(nombre)")
      .eq("tarea_id", id)
      .order("created_at"),
    supabase
      .from("tiempos")
      .select("id, segundos, nota, ts, usuario:usuarios!tiempos_usuario_id_fkey(nombre)")
      .eq("tarea_id", id)
      .order("ts", { ascending: false }),
    supabase
      .from("dependencias_tarea")
      .select("depende_de_id, tarea:tareas!dependencias_tarea_depende_de_id_fkey(titulo, estado)")
      .eq("tarea_id", id),
  ]);

  const subtareas: Subtarea[] = (subRes.data ?? []).map((s) => {
    const r = s as Record<string, unknown>;
    return {
      id: r.id as string,
      tarea_id: r.tarea_id as string,
      titulo: r.titulo as string,
      asignado_id: r.asignado_id as string | null,
      asignado_nombre: (r.asignado as { nombre: string } | null)?.nombre ?? null,
      plazo: r.plazo as string | null,
      estado: r.estado as Subtarea["estado"],
      orden: r.orden as number,
    };
  });

  const comentarios: ComentarioConAutor[] = (comRes.data ?? []).map((c) => {
    const r = c as Record<string, unknown>;
    return {
      id: r.id as string,
      texto: r.texto as string,
      autor_nombre: (r.autor as { nombre: string } | null)?.nombre ?? "—",
      menciones: (r.menciones as string[]) ?? [],
      created_at: r.created_at as string,
    };
  });

  const tiempos: TiempoRow[] = (tiempoRes.data ?? []).map((t2) => {
    const r = t2 as Record<string, unknown>;
    return {
      id: r.id as string,
      segundos: r.segundos as number,
      nota: r.nota as string | null,
      usuario_nombre: (r.usuario as { nombre: string } | null)?.nombre ?? null,
      ts: r.ts as string,
    };
  });

  const dependencias: DependenciaTarea[] = (depRes.data ?? []).map((d) => {
    const r = d as Record<string, unknown>;
    const tt = r.tarea as { titulo: string; estado: string } | null;
    return {
      depende_de_id: r.depende_de_id as string,
      titulo: tt?.titulo ?? "—",
      estado: (tt?.estado as DependenciaTarea["estado"]) ?? "pendiente",
    };
  });

  const actividad = await construirActividad(supabase, id, subtareas.map((s) => s.id), comentarios, tiempos);

  return {
    tarea,
    subtareas,
    comentarios,
    tiempos,
    segundosTotal: tiempos.reduce((a, t2) => a + t2.segundos, 0),
    dependencias,
    actividad,
  };
}
