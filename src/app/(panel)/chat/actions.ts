"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import {
  listConversaciones,
  listMensajes,
  listMensajesPosteriores,
  noLeidosPorConversacion,
  nombresPorId,
} from "@/lib/repos/chat";
import { MENSAJES_POR_PAGINA, totalNoLeidos, validaTextoMensaje } from "@/lib/chat/core";
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

/** UC-603: envía un mensaje. El id lo genera el cliente (UI optimista y reintentos idempotentes). */
export async function enviarMensaje(entrada: {
  id: string;
  conversacionId: string;
  texto: string;
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

  const { data, error } = await supabase
    .from("mensajes")
    .insert({ id, conversacion_id: conversacionId, autor_id: user.id, texto: v.texto })
    .select(SELECT_MENSAJE)
    .single();

  if (error) {
    // Reintento de un envío que sí llegó a guardarse: devolvemos el existente.
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
  return { mensaje: data as Mensaje };
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
