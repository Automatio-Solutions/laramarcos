"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import {
  getConversacion,
  listConversaciones,
  listMensajes,
  listMensajesPosteriores,
  miembrosConversacion,
  noLeidosPorConversacion,
  nombresPorId,
  resolverEnlacesInternos,
  type EnlaceResuelto,
} from "@/lib/repos/chat";
import {
  MENSAJES_POR_PAGINA,
  mencionesVigentes,
  textoAvisoMencion,
  totalNoLeidos,
  validaTextoMensaje,
} from "@/lib/chat/core";
import type { ConversacionListada, Mensaje } from "@/lib/types";

// Chat interno (US-06). Todas las acciones usan el cliente con la sesión del
// usuario: la RLS (chat_puede_ver) decide qué puede leer y dónde puede escribir.
// Ninguna llama a revalidatePath: la UI se actualiza en cliente (optimista + Realtime)
// y así no se re-renderiza el layout en cada mensaje.

const SELECT_MENSAJE =
  "id,conversacion_id,autor_id,texto,menciones,editado_at,borrado,created_at";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type Error_ = { error: string };

function mensajeError(e: unknown, porDefecto: string): string {
  console.error("[chat]", e);
  return porDefecto;
}

/** Máximo de menciones por mensaje (evita avisos masivos). */
const MAX_MENCIONES = 20;

type Supabase = Awaited<ReturnType<typeof createClient>>;

/**
 * UC-603/UC-605: envía un mensaje. El id lo genera el cliente (UI optimista y reintentos
 * idempotentes). Las menciones se validan en servidor: solo miembros de la conversación cuyo
 * "@Nombre" siga en el texto y que no sean el autor. Cada mencionado recibe un aviso en la
 * campana con enlace al mensaje; si el aviso falla, el mensaje se envía igualmente.
 */
export async function enviarMensaje(entrada: {
  id: string;
  conversacionId: string;
  texto: string;
  menciones?: string[];
}): Promise<{ mensaje: Mensaje } | Error_> {
  const { id, conversacionId } = entrada;
  if (!UUID.test(id) || !UUID.test(conversacionId)) return { error: "Mensaje no válido." };
  const v = validaTextoMensaje(entrada.texto ?? "");
  if (!v.ok) return { error: v.error };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Tu sesión ha caducado. Vuelve a entrar." };

  const pedidas = [...new Set((entrada.menciones ?? []).filter((m) => UUID.test(m)))].slice(
    0,
    MAX_MENCIONES,
  );
  let miembros: { id: string; nombre: string }[] = [];
  if (pedidas.length > 0) {
    try {
      miembros = await miembrosConversacion(conversacionId);
    } catch (e) {
      // Sin la función de miembros no se puede validar: se envía sin menciones.
      console.error("[chat] miembros", e);
    }
  }
  const menciones = mencionesVigentes(
    v.texto,
    miembros.filter((m) => pedidas.includes(m.id)),
    user.id,
  );

  const { data, error } = await supabase
    .from("mensajes")
    .insert({ id, conversacion_id: conversacionId, autor_id: user.id, texto: v.texto, menciones })
    .select(SELECT_MENSAJE)
    .single();

  if (error) {
    // Reintento de un envío que sí llegó a guardarse: devolvemos el existente (sin volver a avisar).
    if (error.code === "23505") {
      const { data: existente } = await supabase
        .from("mensajes")
        .select(SELECT_MENSAJE)
        .eq("id", id)
        .maybeSingle();
      if (existente) return { mensaje: existente as Mensaje };
    }
    return { error: mensajeError(error, "No se pudo enviar el mensaje.") };
  }

  if (menciones.length > 0) {
    const autor = miembros.find((m) => m.id === user.id)?.nombre ?? "Un compañero";
    await avisarMenciones(supabase, conversacionId, id, autor, menciones);
  }
  return { mensaje: data as Mensaje };
}

/** UC-605 AC-16: aviso en la campana para cada mencionado. Nunca lanza. */
async function avisarMenciones(
  supabase: Supabase,
  conversacionId: string,
  mensajeId: string,
  autor: string,
  menciones: string[],
): Promise<void> {
  try {
    const conv = await getConversacion(conversacionId);
    const texto = conv
      ? textoAvisoMencion(autor, conv, conv.cliente_nombre)
      : `${autor} te ha mencionado en el chat`;
    const enlace = `/chat/${conversacionId}?m=${mensajeId}`;
    const r = await Promise.allSettled(
      menciones.map((uid) =>
        supabase.rpc("crear_notificacion", {
          p_usuario: uid,
          p_tipo: "mencion_chat",
          p_mensaje: texto,
          p_enlace: enlace,
        }),
      ),
    );
    for (const x of r) {
      if (x.status === "rejected") console.error("[chat] aviso mención", x.reason);
      else if (x.value.error) console.error("[chat] aviso mención", x.value.error);
    }
  } catch (e) {
    console.error("[chat] aviso mención", e);
  }
}

/** UC-605 AC-15: miembros de la conversación para el selector de @menciones. */
export async function obtenerMiembros(
  conversacionId: string,
): Promise<{ miembros: { id: string; nombre: string }[] } | Error_> {
  if (!UUID.test(conversacionId)) return { error: "Conversación no disponible." };
  try {
    return { miembros: await miembrosConversacion(conversacionId) };
  } catch (e) {
    return { error: mensajeError(e, "No se pudieron cargar los miembros.") };
  }
}

/**
 * UC-608: resuelve enlaces a tareas y clientes con la RLS del usuario. Lo que no aparece en
 * la respuesta no existe o no es visible para él ("Elemento no disponible").
 */
export async function resolverEnlaces(refs: {
  tareas: string[];
  clientes: string[];
}): Promise<
  { tareas: Record<string, EnlaceResuelto>; clientes: Record<string, EnlaceResuelto> } | Error_
> {
  const limpiar = (ids: string[] | undefined) =>
    [...new Set((ids ?? []).filter((x) => UUID.test(x)).map((x) => x.toLowerCase()))].slice(0, 50);
  try {
    return await resolverEnlacesInternos(limpiar(refs?.tareas), limpiar(refs?.clientes));
  } catch (e) {
    return { error: mensajeError(e, "No se pudieron resolver los enlaces.") };
  }
}

/** UC-602 AC-03: página de mensajes anteriores a `antesDe`. */
export async function cargarAnteriores(
  conversacionId: string,
  antesDe: string,
): Promise<{ mensajes: Mensaje[] } | Error_> {
  if (!UUID.test(conversacionId)) return { error: "Conversación no disponible." };
  try {
    const mensajes = await listMensajes(conversacionId, {
      antesDe,
      limite: MENSAJES_POR_PAGINA,
    });
    return { mensajes };
  } catch (e) {
    return { error: mensajeError(e, "No se pudieron cargar los mensajes anteriores.") };
  }
}

/** Relleno tras reconexión de Realtime: mensajes posteriores a `despuesDe`. */
export async function cargarPosteriores(
  conversacionId: string,
  despuesDe: string,
): Promise<{ mensajes: Mensaje[] } | Error_> {
  if (!UUID.test(conversacionId)) return { error: "Conversación no disponible." };
  try {
    return { mensajes: await listMensajesPosteriores(conversacionId, despuesDe) };
  } catch (e) {
    return { error: mensajeError(e, "No se pudieron recuperar los mensajes nuevos.") };
  }
}

/** UC-604 AC-03: marca la conversación como leída hasta ahora. */
export async function marcarLeida(conversacionId: string): Promise<void> {
  if (!UUID.test(conversacionId)) return;
  try {
    const supabase = await createClient();
    const { error } = await supabase.rpc("chat_marcar_leida", { p_conv: conversacionId });
    if (error) console.error("[chat] marcarLeida", error);
  } catch (e) {
    console.error("[chat] marcarLeida", e);
  }
}

/** UC-601 AC-03: abre (o reutiliza) el directo con un compañero y navega a él. */
export async function abrirDirecto(otroId: string): Promise<Error_> {
  if (!UUID.test(otroId)) return { error: "Compañero no válido." };
  let convId: string | null = null;
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("chat_abrir_directo", { p_otro: otroId });
    if (error) return { error: error.message || "No se pudo abrir la conversación." };
    convId = (data as string | null) ?? null;
  } catch (e) {
    return { error: mensajeError(e, "No se pudo abrir la conversación.") };
  }
  if (!convId) return { error: "No se pudo abrir la conversación." };
  redirect(`/chat/${convId}`);
}

/** UC-604: no leídos por conversación y total. Nunca lanza (el badge vive en todas las páginas). */
export async function obtenerNoLeidos(): Promise<{
  filas: { conversacion_id: string; no_leidos: number }[];
  total: number;
}> {
  try {
    const filas = await noLeidosPorConversacion();
    return { filas, total: totalNoLeidos(filas) };
  } catch {
    return { filas: [], total: 0 };
  }
}

/** Bandeja de conversaciones (orden y no leídos actualizados). */
export async function listarConversaciones(): Promise<ConversacionListada[] | null> {
  try {
    return await listConversaciones();
  } catch (e) {
    console.error("[chat] listarConversaciones", e);
    return null;
  }
}

/** Nombres de autores que no están en el directorio (p. ej. usuarios dados de baja). */
export async function resolverNombres(ids: string[]): Promise<Record<string, string>> {
  const validos = ids.filter((id) => UUID.test(id)).slice(0, 100);
  if (validos.length === 0) return {};
  try {
    return await nombresPorId(validos);
  } catch {
    return {};
  }
}
