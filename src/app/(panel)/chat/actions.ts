"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  abrirConversacionCliente,
  buscarConversacionCliente,
  buscarMensajesTexto,
  SELECT_MENSAJE,
  conversacionVisible,
  leerMensaje,
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
  BUSQUEDA_LIMITE,
  BUSQUEDA_MIN_CARACTERES,
  ERROR_TIPO_ADJUNTO,
  MENSAJES_POR_PAGINA,
  extensionAdjuntoAdmitida,
  mimeAdjunto,
  esStaffChat,
  mencionesVigentes,
  saneaNombreAdjunto,
  validaAdjunto,
  validaAdjuntoMensaje,
  type AdjuntoMensaje,
  textoAvisoMencion,
  totalNoLeidos,
  validaTextoMensaje,
} from "@/lib/chat/core";
import type { ConversacionListada, Mensaje, ResultadoBusqueda } from "@/lib/types";

// Chat interno (US-06). Todas las acciones usan el cliente con la sesión del
// usuario: la RLS (chat_puede_ver) decide qué puede leer y dónde puede escribir.
// Ninguna llama a revalidatePath: la UI se actualiza en cliente (optimista + Realtime)
// y así no se re-renderiza el layout en cada mensaje.

/** Bucket privado de Storage con los adjuntos del chat (sin políticas de cliente). */
const BUCKET_CHAT = "chat";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type Error_ = { error: string };

function mensajeError(e: unknown, porDefecto: string): string {
  console.error("[chat]", e);
  return porDefecto;
}

/** Máximo de menciones por mensaje (evita avisos masivos). */
const MAX_MENCIONES = 20;

type Supabase = Awaited<ReturnType<typeof createClient>>;
type Admin = ReturnType<typeof createAdminClient>;

/**
 * ¿Algún mensaje (no borrado) usa este objeto de Storage? Con el cliente de servicio: la
 * RLS del usuario no ve todas las conversaciones. El índice único de 0024 ya impide que dos
 * mensajes compartan ruta; esto es la segunda barrera antes de borrar un fichero. Ante la
 * duda (error de consulta) responde true: mejor un huérfano que borrar un fichero ajeno.
 */
async function adjuntoEnUso(admin: Admin, path: string): Promise<boolean> {
  const { data, error } = await admin
    .from("mensajes")
    .select("id")
    .eq("adjunto_path", path)
    .eq("borrado", false)
    .limit(1);
  if (error) {
    console.error("[chat] adjuntoEnUso", error);
    return true;
  }
  return (data ?? []).length > 0;
}

/** Borra un objeto del bucket del chat solo si ningún mensaje lo usa. Nunca lanza. */
async function quitarObjetoSiLibre(admin: Admin, path: string, contexto: string): Promise<void> {
  try {
    if (await adjuntoEnUso(admin, path)) return;
    const { error } = await admin.storage.from(BUCKET_CHAT).remove([path]);
    if (error) console.error(`[chat] ${contexto}`, error);
  } catch (e) {
    console.error(`[chat] ${contexto}`, e);
  }
}

/**
 * UC-610: metadatos REALES del objeto subido (tamaño y tipo que guardó Storage), no los que
 * declara el navegador. Error si no existe o si no son admisibles para el nombre dado; en
 * ese caso el objeto se elimina (si ningún mensaje lo usa).
 */
async function metadatosReales(
  admin: Admin,
  adjunto: AdjuntoMensaje,
): Promise<{ ok: true; mime: string; size: number } | { ok: false; error: string }> {
  const { data, error } = await admin.storage.from(BUCKET_CHAT).info(adjunto.path);
  if (error || !data) return { ok: false, error: "El archivo no se ha subido. Vuelve a adjuntarlo." };
  const meta = (data.metadata ?? {}) as { size?: unknown; mimetype?: unknown };
  const size = Number(data.size ?? meta.size);
  const mime = String(data.contentType ?? meta.mimetype ?? "").split(";")[0].trim().toLowerCase();
  // El tipo real debe ser admitido y coincidir con el de la extensión del nombre.
  const esperado = mimeAdjunto(adjunto.nombre);
  let motivo: string | null = null;
  if (!esperado || mime !== esperado) motivo = ERROR_TIPO_ADJUNTO;
  else if (!Number.isInteger(size)) motivo = "Adjunto no válido.";
  else {
    // Mismas reglas que al elegir el fichero (vacío, más de 20 MB).
    const v = validaAdjunto(adjunto.nombre, mime, size);
    if (!v.ok) motivo = v.error;
  }
  if (motivo) {
    await quitarObjetoSiLibre(admin, adjunto.path, "adjunto rechazado");
    return { ok: false, error: motivo };
  }
  return { ok: true, mime, size };
}

/**
 * UC-603/UC-605/UC-610: envía un mensaje. El id lo genera el cliente (UI optimista y
 * reintentos idempotentes). Las menciones se validan en servidor: solo miembros de la
 * conversación cuyo "@Nombre" siga en el texto y que no sean el autor. Cada mencionado recibe
 * un aviso en la campana con enlace al mensaje; si el aviso falla, el mensaje se envía igualmente.
 * Con adjunto (ya subido con prepararAdjunto) el texto puede ir vacío; la ruta, el tipo y el
 * tamaño se vuelven a validar y se comprueba que el fichero existe.
 */
export async function enviarMensaje(entrada: {
  id: string;
  conversacionId: string;
  texto: string;
  menciones?: string[];
  adjunto?: AdjuntoMensaje | null;
}): Promise<{ mensaje: Mensaje } | Error_> {
  const { id, conversacionId } = entrada;
  if (!UUID.test(id) || !UUID.test(conversacionId)) return { error: "Mensaje no válido." };
  let adjunto: AdjuntoMensaje | null = null;
  if (entrada.adjunto) {
    const a = validaAdjuntoMensaje(entrada.adjunto, conversacionId);
    if (!a.ok) return { error: a.error };
    adjunto = a.adjunto;
  }
  const v = validaTextoMensaje(entrada.texto ?? "", !!adjunto);
  if (!v.ok) return { error: v.error };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Tu sesión ha caducado. Vuelve a entrar." };

  if (adjunto) {
    // Tamaño y tipo se toman del objeto que guardó Storage, no de lo que declaró el navegador.
    try {
      const real = await metadatosReales(createAdminClient(), adjunto);
      if (!real.ok) return { error: real.error };
      adjunto = { ...adjunto, mime: real.mime, size: real.size };
    } catch (e) {
      return { error: mensajeError(e, "No se pudo comprobar el archivo adjunto.") };
    }
  }

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

  const fila: Record<string, unknown> = {
    id,
    conversacion_id: conversacionId,
    autor_id: user.id,
    texto: v.texto,
    menciones,
  };
  if (adjunto) {
    fila.adjunto_path = adjunto.path;
    fila.adjunto_nombre = adjunto.nombre;
    fila.adjunto_mime = adjunto.mime;
    fila.adjunto_size = adjunto.size;
  }

  const { data, error } = await supabase
    .from("mensajes")
    .insert(fila)
    .select(SELECT_MENSAJE)
    .single();

  if (error) {
    // Reintento de un envío que sí llegó a guardarse: devolvemos el existente (sin volver a avisar).
    if (error.code === "23505") {
      const existente = await leerMensaje(id).catch(() => null);
      if (existente) return { mensaje: existente };
      // 0024: la ruta del adjunto ya la usa otro mensaje (no se toca ese fichero).
      if (adjunto) return { error: "Ese archivo ya está en otro mensaje. Vuelve a adjuntarlo." };
    }
    return { error: mensajeError(error, "No se pudo enviar el mensaje.") };
  }

  if (menciones.length > 0) {
    const autor = miembros.find((m) => m.id === user.id)?.nombre ?? "Un compañero";
    await avisarMenciones(supabase, conversacionId, id, autor, menciones);
  }
  return { mensaje: data as unknown as Mensaje };
}

/**
 * UC-610: prepara la subida de un adjunto. Revalida tipo y tamaño, comprueba con la RLS que
 * el usuario ve la conversación y devuelve una URL firmada de subida (creada con el cliente
 * de servicio: el bucket no tiene políticas para el navegador). El fichero va directo del
 * navegador a Storage, sin pasar por las funciones de la app.
 */
export async function prepararAdjunto(
  conversacionId: string,
  nombre: string,
  mime: string,
  size: number,
): Promise<{ path: string; token: string; mime: string } | Error_> {
  if (!UUID.test(conversacionId)) return { error: "Conversación no disponible." };
  const v = validaAdjunto(String(nombre ?? ""), mime, Number(size));
  if (!v.ok) return { error: v.error };
  // El nombre guardado debe llevar una extensión admitida (CHECK de 0024).
  if (!extensionAdjuntoAdmitida(String(nombre))) return { error: ERROR_TIPO_ADJUNTO };
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { error: "Tu sesión ha caducado. Vuelve a entrar." };
    if (!(await conversacionVisible(conversacionId))) return { error: "Conversación no disponible." };

    const path = `${conversacionId.toLowerCase()}/${crypto.randomUUID()}/${saneaNombreAdjunto(nombre)}`;
    const { data, error } = await createAdminClient()
      .storage.from(BUCKET_CHAT)
      .createSignedUploadUrl(path);
    if (error || !data) {
      return { error: mensajeError(error, "No se pudo preparar la subida del archivo.") };
    }
    return { path: data.path, token: data.token, mime: v.mime };
  } catch (e) {
    return { error: mensajeError(e, "No se pudo preparar la subida del archivo.") };
  }
}

/**
 * UC-610: quita un adjunto subido que al final no se envía (el usuario lo descarta). Solo si
 * la conversación es visible para el usuario y ningún mensaje lo usa. Nunca lanza.
 */
export async function descartarAdjunto(conversacionId: string, path: string): Promise<void> {
  try {
    if (!UUID.test(conversacionId)) return;
    const conv = conversacionId.toLowerCase();
    if (typeof path !== "string" || !path.startsWith(`${conv}/`) || path.includes("..")) return;
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user || !(await conversacionVisible(conversacionId))) return;
    await quitarObjetoSiLibre(createAdminClient(), path, "descartarAdjunto");
  } catch (e) {
    console.error("[chat] descartarAdjunto", e);
  }
}

/**
 * UC-612: el autor edita el texto de su mensaje (la BBDD pone editado_at y audita el texto
 * anterior). Un mensaje con adjunto puede quedarse sin texto.
 */
export async function editarMensaje(
  id: string,
  texto: string,
): Promise<{ mensaje: Mensaje } | Error_> {
  if (!UUID.test(id)) return { error: "Mensaje no válido." };
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { error: "Tu sesión ha caducado. Vuelve a entrar." };
    const actual = await leerMensaje(id);
    if (!actual || actual.borrado) return { error: "El mensaje ya no está disponible." };
    if (actual.autor_id !== user.id) return { error: "Solo el autor puede editar el mensaje." };
    const v = validaTextoMensaje(texto ?? "", !!actual.adjunto_path);
    if (!v.ok) return { error: v.error };

    const { data, error } = await supabase
      .from("mensajes")
      .update({ texto: v.texto })
      .eq("id", id)
      .eq("autor_id", user.id)
      .eq("borrado", false)
      .select(SELECT_MENSAJE)
      .maybeSingle();
    if (error) return { error: mensajeError(error, "No se pudo editar el mensaje.") };
    if (!data) return { error: "No se pudo editar el mensaje." };
    return { mensaje: data as unknown as Mensaje };
  } catch (e) {
    return { error: mensajeError(e, "No se pudo editar el mensaje.") };
  }
}

/**
 * UC-612: borra un mensaje (el autor, o un responsable/administrador para moderar). La BBDD
 * vacía texto, menciones y adjunto y audita el borrado; el fichero adjunto se elimina de
 * Storage después (su ruta se lee ANTES de borrar).
 */
export async function borrarMensaje(id: string): Promise<{ ok: true } | Error_> {
  if (!UUID.test(id)) return { error: "Mensaje no válido." };
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { error: "Tu sesión ha caducado. Vuelve a entrar." };
    const actual = await leerMensaje(id);
    if (!actual) return { error: "El mensaje ya no está disponible." };
    if (actual.borrado) return { ok: true };
    if (actual.autor_id !== user.id) {
      const { data: yo } = await supabase.from("usuarios").select("rol").eq("id", user.id).maybeSingle();
      if (!esStaffChat((yo as { rol?: string } | null)?.rol)) {
        return { error: "Solo el autor o un responsable pueden borrar el mensaje." };
      }
    }
    const ruta = actual.adjunto_path ?? null;

    const { data, error } = await supabase
      .from("mensajes")
      .update({ borrado: true })
      .eq("id", id)
      .select("id")
      .maybeSingle();
    if (error) return { error: mensajeError(error, "No se pudo borrar el mensaje.") };
    if (!data) return { error: "No se pudo borrar el mensaje." };

    // Solo si ningún otro mensaje usa el fichero (el borrado ya dejó la ruta de este a null).
    if (ruta) await quitarObjetoSiLibre(createAdminClient(), ruta, "borrar adjunto");
    return { ok: true };
  } catch (e) {
    return { error: mensajeError(e, "No se pudo borrar el mensaje.") };
  }
}

/**
 * UC-611: busca en los mensajes de las conversaciones visibles (función chat_buscar: sin
 * tildes, en español, del más reciente al más antiguo). Menos de 2 caracteres: sin resultados.
 */
export async function buscarMensajes(
  q: string,
): Promise<{ resultados: ResultadoBusqueda[] } | Error_> {
  const limpio = String(q ?? "").trim().slice(0, 200);
  if (limpio.length < BUSQUEDA_MIN_CARACTERES) return { resultados: [] };
  try {
    return { resultados: await buscarMensajesTexto(limpio, BUSQUEDA_LIMITE) };
  } catch (e) {
    return { error: mensajeError(e, "La búsqueda no está disponible ahora mismo.") };
  }
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

/**
 * Tras una reconexión de Realtime: la última página de la conversación tal como está ahora,
 * para recoger ediciones y borrados hechos durante el corte (el relleno solo trae lo nuevo).
 */
export async function cargarUltimos(
  conversacionId: string,
): Promise<{ mensajes: Mensaje[] } | Error_> {
  if (!UUID.test(conversacionId)) return { error: "Conversación no disponible." };
  try {
    return { mensajes: await listMensajes(conversacionId, { limite: MENSAJES_POR_PAGINA }) };
  } catch (e) {
    return { error: mensajeError(e, "No se pudieron recuperar los mensajes.") };
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

/**
 * UC-606: crea (o recupera, si otro compañero se adelantó) el hilo interno de un cliente al
 * enviar el primer mensaje desde su ficha. Devuelve su id y los últimos mensajes que ya
 * tuviera. chat_abrir_cliente comprueba el acceso con las reglas de la ficha (AC-19).
 */
export async function abrirHiloCliente(
  clienteId: string,
): Promise<{ id: string; mensajes: Mensaje[] } | Error_> {
  if (!UUID.test(clienteId)) return { error: "Conversación no disponible." };
  try {
    const id = await abrirConversacionCliente(clienteId);
    const mensajes = await listMensajes(id, { limite: MENSAJES_POR_PAGINA });
    return { id, mensajes };
  } catch (e) {
    return { error: mensajeError(e, "No se pudo abrir la conversación del cliente.") };
  }
}

/**
 * UC-606: primer envío desde la ficha en UNA llamada: abre (o recupera) el hilo del cliente y
 * envía el mensaje, leyendo en paralelo los que ya tuviera. Ahorra una ida y vuelta frente a
 * abrirHiloCliente + enviarMensaje, que es lo que más pesa en la latencia del primer mensaje.
 */
export async function abrirHiloClienteYEnviar(
  clienteId: string,
  primero: { id: string; texto: string; menciones?: string[] },
): Promise<{ id: string; mensajes: Mensaje[]; enviado: Mensaje } | Error_> {
  if (!UUID.test(clienteId)) return { error: "Conversación no disponible." };
  try {
    const id = await abrirConversacionCliente(clienteId);
    const [envio, mensajes] = await Promise.all([
      enviarMensaje({ ...primero, conversacionId: id }),
      listMensajes(id, { limite: MENSAJES_POR_PAGINA }),
    ]);
    if ("error" in envio) return envio;
    return { id, mensajes, enviado: envio.mensaje };
  } catch (e) {
    return { error: mensajeError(e, "No se pudo abrir la conversación del cliente.") };
  }
}

/**
 * UC-606: hilo de un cliente SI YA EXISTE (solo lectura), con sus últimos mensajes; null si
 * aún no hay hilo o no es visible. Lo usa la ficha en estado vacío para engancharse cuando
 * otro compañero escribe el primer mensaje.
 */
export async function buscarHiloCliente(
  clienteId: string,
): Promise<{ id: string; mensajes: Mensaje[] } | null> {
  if (!UUID.test(clienteId)) return null;
  try {
    const id = await buscarConversacionCliente(clienteId);
    if (!id) return null;
    return { id, mensajes: await listMensajes(id, { limite: MENSAJES_POR_PAGINA }) };
  } catch (e) {
    mensajeError(e, "");
    return null;
  }
}

/**
 * UC-606: la ficha (sin hilo todavía) recibe por Realtime un mensaje de la conversación
 * `conversacionId`. En UNA llamada comprueba que es el hilo de ESTE cliente y devuelve sus
 * últimos mensajes (consultas en paralelo); null si no lo es o no es visible.
 */
export async function hiloClienteDeConversacion(
  clienteId: string,
  conversacionId: string,
): Promise<{ id: string; mensajes: Mensaje[] } | null> {
  if (!UUID.test(clienteId) || !UUID.test(conversacionId)) return null;
  try {
    const supabase = await createClient();
    const [conv, mensajes] = await Promise.all([
      supabase
        .from("conversaciones")
        .select("id,tipo,cliente_id")
        .eq("id", conversacionId)
        .maybeSingle(),
      listMensajes(conversacionId, { limite: MENSAJES_POR_PAGINA }),
    ]);
    if (conv.error) throw conv.error;
    const c = conv.data as { id: string; tipo: string; cliente_id: string | null } | null;
    if (!c || c.tipo !== "cliente" || c.cliente_id?.toLowerCase() !== clienteId.toLowerCase()) {
      return null;
    }
    return { id: c.id, mensajes };
  } catch (e) {
    mensajeError(e, "");
    return null;
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
