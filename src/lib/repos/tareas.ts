import { createClient } from "@/lib/supabase/server";
import type { TareaConRelaciones, EstadoTarea } from "@/lib/types";

export interface TareaFiltros {
  responsable?: string;
  cliente?: string;
  estado?: string;
  categoria?: string;
  desde?: string;
  hasta?: string;
}

interface SubtareaMini {
  estado: string;
  plazo: string | null;
  asignado: { nombre: string } | null;
}

interface TareaRow {
  id: string;
  cliente_id: string | null;
  titulo: string;
  descripcion: string | null;
  categoria: string | null;
  estado: EstadoTarea;
  vencimiento: string | null;
  bloqueada: boolean;
  motivo_bloqueo: string | null;
  responsable_id: string | null;
  created_at: string;
  cliente: { razon_social: string } | null;
  responsable: { nombre: string } | null;
  subtareas: SubtareaMini[];
}

const SELECT =
  "id, cliente_id, titulo, descripcion, categoria, estado, vencimiento, bloqueada, motivo_bloqueo, responsable_id, created_at, cliente:clientes(razon_social), responsable:usuarios!tareas_responsable_id_fkey(nombre), subtareas(estado, plazo, asignado:usuarios!subtareas_asignado_id_fkey(nombre))";

const HOY = () => new Date().toISOString().slice(0, 10);

function mapRow(r: TareaRow): TareaConRelaciones {
  const hoy = HOY();
  const subs = r.subtareas ?? [];
  const pendientes = subs.filter((s) => s.estado !== "completada");
  // "Bloqueada por": asignados de subtareas vencidas (plazo pasado) y sin completar
  const bloqueada_por = [
    ...new Set(
      pendientes
        .filter((s) => s.plazo && s.plazo < hoy)
        .map((s) => s.asignado?.nombre ?? "Sin asignar"),
    ),
  ];
  return {
    id: r.id,
    cliente_id: r.cliente_id,
    titulo: r.titulo,
    descripcion: r.descripcion,
    categoria: r.categoria,
    estado: r.estado,
    vencimiento: r.vencimiento,
    bloqueada: r.bloqueada,
    motivo_bloqueo: r.motivo_bloqueo,
    responsable_id: r.responsable_id,
    created_at: r.created_at,
    cliente_nombre: r.cliente?.razon_social ?? null,
    responsable_nombre: r.responsable?.nombre ?? null,
    subtareas_pendientes: pendientes.length,
    bloqueada_por,
  };
}

export async function listTareas(f: TareaFiltros = {}): Promise<TareaConRelaciones[]> {
  const supabase = await createClient();
  let q = supabase.from("tareas").select(SELECT).eq("archivada", false).order("vencimiento", { ascending: true, nullsFirst: false });
  if (f.responsable) q = q.eq("responsable_id", f.responsable);
  if (f.cliente) q = q.eq("cliente_id", f.cliente);
  if (f.estado) q = q.eq("estado", f.estado);
  if (f.categoria) q = q.ilike("categoria", `%${f.categoria}%`);
  if (f.desde) q = q.gte("vencimiento", f.desde);
  if (f.hasta) q = q.lte("vencimiento", f.hasta);

  const { data, error } = await q;
  if (error) throw error;
  return (data as unknown as TareaRow[]).map(mapRow);
}

/** Tareas archivadas (apartado Archivo). */
export async function listTareasArchivadas(desde?: string, hasta?: string): Promise<TareaConRelaciones[]> {
  const supabase = await createClient();
  let q = supabase
    .from("tareas").select(SELECT).eq("archivada", true).order("vencimiento", { ascending: false, nullsFirst: false });
  if (desde) q = q.gte("created_at", desde);
  if (hasta) q = q.lt("created_at", `${hasta}T23:59:59.999Z`);
  const { data, error } = await q;
  if (error) throw error;
  return (data as unknown as TareaRow[]).map(mapRow);
}
