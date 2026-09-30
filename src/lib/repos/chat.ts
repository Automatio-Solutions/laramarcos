import "server-only";
import { unstable_rethrow } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { MENSAJES_POR_RELLENO } from "@/lib/chat/core";
import { ESTADO_LABEL } from "@/lib/estados";
import type {
  CompaneroDirectorio,
  Conversacion,
  ConversacionListada,
  EstadoTarea,
  Mensaje,
  Oficina,
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
  cliente: 3,
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
        titulo = cli?.razon_social ?? c.nombre ?? "Cliente";
        break;
      default:
        titulo = c.nombre ?? c.oficina ?? "General";
    }
    return { ...c, titulo, no_leidos: noLeidos.get(c.id) ?? 0 };
  });

  return lista.sort(compararConversaciones);
}

/** Conversación por id (null si no existe o la RLS no la deja ver), con el cliente si lo hay. */
export async function getConversacion(id: string): Promise<ConversacionDetalle | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("conversaciones")
    .select(`${SELECT_CONV},cliente:clientes(razon_social,oficina)`)
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const { cliente, ...conv } = data as unknown as Conversacion & {
    cliente: ClienteConv | ClienteConv[] | null;
  };
  const cli = Array.isArray(cliente) ? cliente[0] : cliente;
  return {
    ...conv,
    cliente_nombre: cli?.razon_social ?? null,
    cliente_oficina: cli?.oficina ?? null,
  };
}

type ClienteConv = { razon_social: string; oficina: Oficina | null };

/** Conversación con los datos del cliente (solo en hilos de cliente). */
export type ConversacionDetalle = Conversacion & {
  cliente_nombre: string | null;
  cliente_oficina: Oficina | null;
};

/**
 * UC-605: miembros activos de la conversación (quienes pueden verla), para el selector de
 * @menciones y para validar las menciones al enviar. Vacío si el usuario no puede verla.
 */
export async function miembrosConversacion(
  convId: string,
): Promise<{ id: string; nombre: string }[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("chat_miembros", { p_conv: convId });
  if (error) throw error;
  return ((data ?? []) as { id: string; nombre: string }[]).filter((m) => m.id && m.nombre);
}

/**
 * UC-606: id del hilo interno de un cliente SI YA EXISTE (solo lectura, con la RLS del
 * usuario), o null. No crea nada: el hilo se crea al enviar el primer mensaje.
 */
export async function buscarConversacionCliente(clienteId: string): Promise<string | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("conversaciones")
    .select("id")
    .eq("cliente_id", clienteId)
    .maybeSingle();
  if (error) throw error;
  return (data?.id as string | undefined) ?? null;
}

/**
 * UC-606: crea (o devuelve) el hilo interno de un cliente. Lanza si el usuario no tiene
 * acceso al cliente (42501) o si la función no existe todavía.
 */
export async function abrirConversacionCliente(clienteId: string): Promise<string> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("chat_abrir_cliente", { p_cliente: clienteId });
  if (error) throw error;
  if (typeof data !== "string" || !data) throw new Error("chat_abrir_cliente sin id");
  return data;
}

export interface EnlaceResuelto {
  titulo: string;
  estado: string;
}

/**
 * UC-608: títulos y estado de las tareas y clientes enlazados en los mensajes, con la RLS
 * del usuario: lo que no devuelva (sin permiso o inexistente) se muestra "no disponible".
 */
export async function resolverEnlacesInternos(
  tareaIds: string[],
  clienteIds: string[],
): Promise<{ tareas: Record<string, EnlaceResuelto>; clientes: Record<string, EnlaceResuelto> }> {
  const supabase = await createClient();
  const [tRes, cRes] = await Promise.all([
    tareaIds.length
      ? supabase.from("tareas").select("id,titulo,estado").in("id", tareaIds)
      : Promise.resolve({ data: [], error: null }),
    clienteIds.length
      ? supabase.from("clientes").select("id,razon_social,activo,fecha_baja").in("id", clienteIds)
      : Promise.resolve({ data: [], error: null }),
  ]);
  if (tRes.error) throw tRes.error;
  if (cRes.error) throw cRes.error;
  const tareas: Record<string, EnlaceResuelto> = {};
  for (const t of (tRes.data ?? []) as { id: string; titulo: string; estado: EstadoTarea }[]) {
    tareas[t.id] = { titulo: t.titulo, estado: ESTADO_LABEL[t.estado] ?? t.estado };
  }
  const clientes: Record<string, EnlaceResuelto> = {};
  for (const c of (cRes.data ?? []) as {
    id: string;
    razon_social: string;
    activo: boolean | null;
    fecha_baja: string | null;
  }[]) {
    clientes[c.id] = {
      titulo: c.razon_social,
      estado: c.fecha_baja || c.activo === false ? "Baja" : "Activo",
    };
  }
  return { tareas, clientes };
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

/**
 * Mensajes posteriores a `despuesDe` (ISO), en orden cronológico y con el nombre
 * del autor, como mucho `limite`. Sirve para rellenar el hueco tras una reconexión de
 * Realtime: si la página viene llena, el cliente pide la siguiente (ver realtime.ts).
 */
export async function listMensajesPosteriores(
  convId: string,
  despuesDe: string,
  limite = MENSAJES_POR_RELLENO,
): Promise<Mensaje[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("mensajes")
    .select(SELECT_MENSAJE)
    .eq("conversacion_id", convId)
    .gt("created_at", despuesDe)
    .order("created_at", { ascending: true })
    .order("id", { ascending: true })
    .limit(limite);
  if (error) throw error;
  const mensajes = (data ?? []) as Mensaje[];
  const nombres = await resolverNombres(
    supabase,
    mensajes.map((m) => m.autor_id).filter((id): id is string => !!id),
  );
  return mensajes.map((m) => ({
    ...m,
    autor_nombre: m.autor_id ? (nombres.get(m.autor_id) ?? null) : null,
  }));
}

/** Nombres de usuarios por id (incluye bajas), para mensajes llegados por Realtime. */
export async function nombresPorId(ids: string[]): Promise<Record<string, string>> {
  const supabase = await createClient();
  return Object.fromEntries(await resolverNombres(supabase, ids));
}

/** No leídos por conversación del usuario autenticado (solo las que tienen alguno). */
export async function noLeidosPorConversacion(): Promise<
  { conversacion_id: string; no_leidos: number }[]
> {
  const supabase = await createClient();
  return [...(await mapaNoLeidos(supabase))].map(([conversacion_id, no_leidos]) => ({
    conversacion_id,
    no_leidos,
  }));
}

/**
 * Total de mensajes sin leer (badge del menú). Lo llama el layout del panel en
 * TODAS las páginas: nunca lanza (si el chat no está disponible, devuelve 0).
 */
export async function totalNoLeidos(): Promise<number> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("chat_no_leidos");
    if (error) return 0;
    return ((data ?? []) as { no_leidos: number }[]).reduce((s, r) => s + r.no_leidos, 0);
  } catch (e) {
    unstable_rethrow(e);
    return 0;
  }
}
