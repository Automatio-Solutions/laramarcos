import type { SupabaseClient } from "@supabase/supabase-js";
import { ficherosHuerfanos } from "@/lib/chat/core";

/** Tope de ficheros que se revisan y se borran por ejecución (cabe holgado en el cron). */
const MAX_LISTADO_CHAT = 1000;
const MAX_BORRADO_CHAT = 200;

/**
 * Chat (UC-610): borra del almacén privado 'chat' los adjuntos que se subieron y nunca se
 * enviaron (pestaña cerrada, envío cancelado…) y los que quedaron tras un borrado fallido.
 * Solo los que ningún mensaje usa y llevan más de 24 h. Estructura: conversación/uuid/fichero.
 */
export async function ejecutarLimpiezaChat(admin: SupabaseClient, ahora = new Date()) {
  const bucket = admin.storage.from("chat");
  const objetos: { ruta: string; creado: string | null }[] = [];
  const { data: convs, error } = await bucket.list("", { limit: MAX_LISTADO_CHAT });
  if (error) throw new Error(error.message);
  for (const conv of convs ?? []) {
    const { data: subidas } = await bucket.list(conv.name, { limit: MAX_LISTADO_CHAT });
    for (const s of subidas ?? []) {
      const { data: ficheros } = await bucket.list(`${conv.name}/${s.name}`, { limit: 10 });
      for (const f of ficheros ?? []) {
        objetos.push({ ruta: `${conv.name}/${s.name}/${f.name}`, creado: f.created_at ?? null });
      }
      if (objetos.length >= MAX_LISTADO_CHAT) break;
    }
    if (objetos.length >= MAX_LISTADO_CHAT) break;
  }
  if (!objetos.length) return { revisados: 0, borrados: 0 };

  // Rutas en uso por algún mensaje (en lotes para no hacer URLs enormes).
  const usados = new Set<string>();
  for (let i = 0; i < objetos.length; i += 100) {
    const rutas = objetos.slice(i, i + 100).map((o) => o.ruta);
    const { data, error: e } = await admin.from("mensajes").select("adjunto_path").in("adjunto_path", rutas);
    if (e) throw new Error(e.message); // ante la duda, no se borra nada
    for (const m of data ?? []) usados.add(m.adjunto_path as string);
  }

  const aBorrar = ficherosHuerfanos(objetos, usados, ahora).slice(0, MAX_BORRADO_CHAT);
  if (aBorrar.length) {
    const { error: eBorrar } = await bucket.remove(aBorrar);
    if (eBorrar) throw new Error(eBorrar.message);
  }
  return { revisados: objetos.length, borrados: aBorrar.length };
}
