import { unstable_rethrow } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { abrirConversacionCliente, getDirectorio, listMensajes } from "@/lib/repos/chat";
import { MENSAJES_POR_PAGINA } from "@/lib/chat/core";
import type { CompaneroDirectorio } from "@/lib/types";
import { ChatConversacion } from "./ChatConversacion";

/** Caja neutra cuando el hilo no se puede abrir (sin acceso o chat no disponible). */
export function ConversacionClienteNoDisponible() {
  return (
    <div
      role="status"
      className="flex h-40 items-center justify-center rounded-lg border border-dashed border-border bg-surface px-6 text-center text-sm text-fg-muted"
    >
      Conversación no disponible
    </div>
  );
}

/**
 * UC-606: hilo interno del cliente dentro de su ficha. Abre (o crea) la conversación con
 * `chat_abrir_cliente`, que comprueba el acceso con las mismas reglas que la ficha (AC-19),
 * y la pinta con el componente del chat, en tiempo real (AC-18). Si algo falla, muestra una
 * caja neutra: nunca rompe la ficha.
 */
export async function ConversacionCliente({
  clienteId,
  clienteNombre,
}: {
  clienteId: string;
  clienteNombre: string;
}) {
  let datos: {
    convId: string;
    yo: { id: string; nombre: string };
    mensajes: Awaited<ReturnType<typeof listMensajes>>;
    directorio: CompaneroDirectorio[];
  } | null = null;
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) throw new Error("sin sesión");
    const convId = await abrirConversacionCliente(clienteId);
    const [mensajes, directorio] = await Promise.all([
      listMensajes(convId, { limite: MENSAJES_POR_PAGINA }),
      getDirectorio().catch(() => [] as CompaneroDirectorio[]),
    ]);
    const yoNombre = directorio.find((c) => c.id === user.id)?.nombre ?? "Yo";
    datos = { convId, yo: { id: user.id, nombre: yoNombre }, mensajes, directorio };
  } catch (e) {
    unstable_rethrow(e);
    console.error("[chat] conversación de cliente", e);
  }
  if (!datos) return <ConversacionClienteNoDisponible />;

  return (
    <div className="flex h-[560px] min-h-0 overflow-hidden rounded-lg border border-border">
      <ChatConversacion
        key={datos.convId}
        conversacionId={datos.convId}
        titulo={clienteNombre}
        subtitulo="Hilo interno del despacho sobre este cliente"
        etiqueta="Conversación del cliente"
        mensajesIniciales={datos.mensajes}
        yo={datos.yo}
        nombresIniciales={Object.fromEntries(datos.directorio.map((c) => [c.id, c.nombre]))}
        enlaceCabecera={{ href: `/chat/${datos.convId}`, label: "Abrir en el chat" }}
      />
    </div>
  );
}
