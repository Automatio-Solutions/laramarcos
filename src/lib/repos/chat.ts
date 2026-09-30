import "server-only";
import { createClient } from "@/lib/supabase/server";
import type {
  CompaneroDirectorio,
  Conversacion,
  ConversacionListada,
  Mensaje,
} from "@/lib/types";

// Chat interno (US-06). La visibilidad la decide la RLS (chat_puede_ver) y los
// nombres de compañeros se resuelven con funciones SECURITY DEFINER, porque la
// RLS de usuarios solo deja al asesor verse a sí mismo.

const SELECT_CONV =
  "id,tipo,nombre,oficina,cliente_id,usuario_a,usuario_b,ultimo_mensaje_at";
const SELECT_MENSAJE =
  "id,conversacion_id,autor_id,texto,menciones,editado_at,borrado,created_at";

type Supabase = Awaited<ReturnType<typeof createClient>>;

/** Nombres por id, incluidos usuarios dados de baja (mensajes antiguos). */
async function resolverNombres(
  supabase: Supabase,
  ids: string[],
): Promise<Map<string, string>> {
  const unicos = [...new Set(ids)];
  if (unicos.length === 0) return new Map();
  const { data, error } = await supabase.rpc("chat_nombres", { p_ids: unicos });
  if (error) throw error;
  return new Map(
    ((data ?? []) as { id: string; nombre: string }[]).map((r) => [r.id, r.nombre]),
  );
}

/** Mapa conversación → mensajes sin leer del usuario autenticado. */
async function mapaNoLeidos(supabase: Supabase): Promise<Map<string, number>> {
  const { data, error } = await supabase.rpc("chat_no_leidos");
  if (error) throw error;
  return new Map(
    ((data ?? []) as { conversacion_id: string; no_leidos: number }[]).map((r) => [
      r.conversacion_id,
      r.no_leidos,
    ]),
  );
}

const ORDEN_TIPO: Record<Conversacion["tipo"], number> = {
  general: 0,
  oficina: 1,
  directo: 2,
  cliente: 2,
};

/** Orden de la bandeja: General, canales de oficina y luego lo más reciente. */
function compararConversaciones(a: ConversacionListada, b: ConversacionListada): number {
  const porTipo = ORDEN_TIPO[a.tipo] - ORDEN_TIPO[b.tipo];
  if (porTipo !== 0) return porTipo;
  if (a.tipo === "oficina") return a.titulo.localeCompare(b.titulo, "es");
  const ta = a.ultimo_mensaje_at ?? "";
  const tb = b.ultimo_mensaje_at ?? "";
  if (ta !== tb) return ta < tb ? 1 : -1;
  return a.titulo.localeCompare(b.titulo, "es");
}

/** Conversaciones visibles para el usuario, con título a mostrar y no leídos. */
export async function listConversaciones(): Promise<ConversacionListada[]> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];

  const [convRes, noLeidos] = await Promise.all([
    supabase.from("conversaciones").select(`${SELECT_CONV},cliente:clientes(razon_social)`),
    mapaNoLeidos(supabase),
  ]);
  if (convRes.error) throw convRes.error;

  const filas = (convRes.data ?? []) as unknown as (Conversacion & {
    cliente: { razon_social: string } | { razon_social: string }[] | null;
  })[];

  // En directos, el "otro" participante da nombre a la conversación.
  const otro = (c: Conversacion) => (c.usuario_a === user.id ? c.usuario_b : c.usuario_a);
  const nombres = await resolverNombres(
    supabase,
    filas.filter((c) => c.tipo === "directo").map(otro).filter((id): id is string => !!id),
  );

  const lista = filas.map(({ cliente, ...c }): ConversacionListada => {
    const cli = Array.isArray(cliente) ? cliente[0] : cliente;
    let titulo: string;
    switch (c.tipo) {
      case "directo":
        titulo = nombres.get(otro(c) ?? "") ?? "Compañero";
        break;
      case "cliente":
        titulo = c.nombre ?? cli?.razon_social ?? "Cliente";
        break;
      default:
        titulo = c.nombre ?? c.oficina ?? "General";
    }
    return { ...c, titulo, no_leidos: noLeidos.get(c.id) ?? 0 };
  });

  return lista.sort(compararConversaciones);
}

export async function getConversacion(id: string): Promise<Conversacion | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("conversaciones")
    .select(SELECT_CONV)
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  return (data as Conversacion | null) ?? null;
}

/**
 * Página de mensajes: los `limite` más recientes anteriores a `antesDe`
 * (ISO), devueltos en orden cronológico y con el nombre del autor.
 */
export async function listMensajes(
  convId: string,
  { antesDe, limite = 50 }: { antesDe?: string; limite?: number } = {},
): Promise<Mensaje[]> {
  const supabase = await createClient();
  let query = supabase
    .from("mensajes")
    .select(SELECT_MENSAJE)
    .eq("conversacion_id", convId)
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(limite);
  if (antesDe) query = query.lt("created_at", antesDe);

  const { data, error } = await query;
  if (error) throw error;
  const mensajes = ((data ?? []) as Mensaje[]).reverse();

  const nombres = await resolverNombres(
    supabase,
    mensajes.map((m) => m.autor_id).filter((id): id is string => !!id),
  );
  return mensajes.map((m) => ({
    ...m,
    autor_nombre: m.autor_id ? (nombres.get(m.autor_id) ?? null) : null,
  }));
}

/** Compañeros activos del despacho (para abrir directos y @menciones). */
export async function getDirectorio(): Promise<CompaneroDirectorio[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("chat_directorio");
  if (error) throw error;
  return (data ?? []) as CompaneroDirectorio[];
}

/** Total de mensajes sin leer (badge del menú). */
export async function totalNoLeidos(): Promise<number> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("chat_no_leidos");
  if (error) return 0;
  return ((data ?? []) as { no_leidos: number }[]).reduce((s, r) => s + r.no_leidos, 0);
}
