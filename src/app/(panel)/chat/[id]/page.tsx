import { unstable_rethrow } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import {
  getConversacion,
  getDirectorio,
  listConversaciones,
  listMensajes,
  type ConversacionDetalle,
} from "@/lib/repos/chat";
import { MENSAJES_POR_PAGINA } from "@/lib/chat/core";
import { ChatLista } from "@/components/chat/ChatLista";
import { ChatConversacion } from "@/components/chat/ChatConversacion";
import { ChatNoDisponible } from "@/components/chat/ChatNoDisponible";
import { ROL_LABEL, type CompaneroDirectorio } from "@/lib/types";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Línea secundaria de la cabecera según el tipo de conversación. */
function subtituloDe(
  conv: ConversacionDetalle,
  yoId: string,
  directorio: CompaneroDirectorio[],
): string | undefined {
  switch (conv.tipo) {
    case "general":
      return "Todo el despacho";
    case "oficina":
      return `Canal de la oficina de ${conv.oficina ?? conv.nombre ?? ""}`.trim();
    case "cliente":
      return conv.cliente_oficina ? `Cliente · ${conv.cliente_oficina}` : "Cliente";
    case "directo": {
      const otroId = conv.usuario_a === yoId ? conv.usuario_b : conv.usuario_a;
      const otro = directorio.find((c) => c.id === otroId);
      if (!otro) return "Mensaje directo";
      return [otro.oficina, ROL_LABEL[otro.rol]].filter(Boolean).join(" · ");
    }
  }
}

/** UC-602/UC-603: bandeja (320 px) + conversación abierta, a toda la altura bajo la barra superior. */
export default async function ChatConversacionPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ [clave: string]: string | string[] | undefined }>;
}) {
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  // ?m=<mensaje>: enlace de una notificación de mención (UC-605 AC-16).
  const m = typeof sp.m === "string" && UUID.test(sp.m) ? sp.m.toLowerCase() : null;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return <Marco><ChatNoDisponible /></Marco>;

  const valido = UUID.test(id);
  let datos;
  try {
    const [conversaciones, conversacion, mensajes, directorio] = await Promise.all([
      listConversaciones(),
      valido ? getConversacion(id) : Promise.resolve(null),
      valido ? listMensajes(id, { limite: MENSAJES_POR_PAGINA }) : Promise.resolve([]),
      getDirectorio(),
    ]);
    datos = { conversaciones, conversacion, mensajes, directorio };
  } catch (e) {
    unstable_rethrow(e);
    console.error("[chat] /chat/[id]", e);
    return <Marco><ChatNoDisponible /></Marco>;
  }

  const { conversaciones, conversacion, mensajes, directorio } = datos;
  const yoNombre = directorio.find((c) => c.id === user.id)?.nombre ?? "Yo";
  const nombres = Object.fromEntries(directorio.map((c) => [c.id, c.nombre]));
  const listada = conversaciones.find((c) => c.id === id);

  return (
    <Marco>
      <ChatLista
        conversaciones={conversaciones}
        activaId={conversacion ? id : null}
        directorio={directorio}
        yoId={user.id}
      />
      {conversacion ? (
        <ChatConversacion
          key={conversacion.id}
          conversacionId={conversacion.id}
          titulo={listada?.titulo ?? conversacion.cliente_nombre ?? conversacion.nombre ?? "Conversación"}
          subtitulo={subtituloDe(conversacion, user.id, directorio)}
          mensajeObjetivo={m}
          enlaceCabecera={
            conversacion.tipo === "cliente" && conversacion.cliente_id
              ? { href: `/clientes/${conversacion.cliente_id}`, label: "Ver ficha" }
              : undefined
          }
          mensajesIniciales={mensajes}
          yo={{ id: user.id, nombre: yoNombre }}
          nombresIniciales={nombres}
        />
      ) : (
        // UC-603 AC-04: sin acceso (o inexistente) la RLS no devuelve nada.
        <ChatNoDisponible
          titulo="Conversación no disponible"
          detalle="No existe o no tienes acceso a ella. Elige otra conversación de la lista."
        />
      )}
    </Marco>
  );
}

/** Ocupa el alto de la ventana menos la barra superior (h-14): sin scroll de página. */
function Marco({ children }: { children: React.ReactNode }) {
  return <div className="flex h-[calc(100dvh-3.5rem)] min-h-0 overflow-hidden">{children}</div>;
}
