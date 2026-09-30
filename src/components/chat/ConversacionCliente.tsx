import { unstable_rethrow } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { buscarConversacionCliente, getDirectorio, listMensajes, rolActual } from "@/lib/repos/chat";
import { MENSAJES_POR_PAGINA } from "@/lib/chat/core";
import type { CompaneroDirectorio, Rol } from "@/lib/types";
import { ChatConversacion } from "./ChatConversacion";
import { HiloClienteNuevo } from "./HiloClienteNuevo";

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
 * UC-606: hilo interno del cliente dentro de su ficha. Visitar la ficha NO crea nada: se
 * busca (solo lectura, con la RLS) la conversación del cliente y, si existe, se pinta con el
 * componente del chat, en tiempo real (AC-18). Si aún no existe, se muestra la caja de
 * escritura vacía y la conversación se crea con `chat_abrir_cliente` al enviar el primer
 * mensaje (mismas reglas de acceso que la ficha, AC-19). Si el usuario no ve el cliente o
 * algo falla, muestra una caja neutra: nunca rompe la ficha.
 */
export async function ConversacionCliente({
  clienteId,
  clienteNombre,
}: {
  clienteId: string;
  clienteNombre: string;
}) {
  let datos:
    | {
        convId: string | null;
        yo: { id: string; nombre: string };
        mensajes: Awaited<ReturnType<typeof listMensajes>>;
        directorio: CompaneroDirectorio[];
        miembros: { id: string; nombre: string }[];
        rol: Rol | null;
      }
    | null = null;
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) throw new Error("sin sesión");
    // Mismas reglas que la ficha: si la RLS no devuelve el cliente, no hay hilo.
    const { data: cliente, error } = await supabase
      .from("clientes")
      .select("id,oficina")
      .eq("id", clienteId)
      .maybeSingle();
    if (error) throw error;
    if (cliente) {
      const [convId, directorio, rol] = await Promise.all([
        buscarConversacionCliente(clienteId),
        getDirectorio().catch(() => [] as CompaneroDirectorio[]),
        rolActual(),
      ]);
      const mensajes = convId ? await listMensajes(convId, { limite: MENSAJES_POR_PAGINA }) : [];
      const yoNombre = directorio.find((c) => c.id === user.id)?.nombre ?? "Yo";
      // Quienes verán el hilo (como chat_miembros para tipo cliente): staff + su sede.
      const miembros = directorio
        .filter(
          (c) =>
            c.rol === "responsable" ||
            c.rol === "admin" ||
            (c.oficina !== null && c.oficina === cliente.oficina),
        )
        .map((c) => ({ id: c.id, nombre: c.nombre }));
      datos = { convId, yo: { id: user.id, nombre: yoNombre }, mensajes, directorio, miembros, rol };
    }
  } catch (e) {
    unstable_rethrow(e);
    console.error("[chat] conversación de cliente", e);
  }
  if (!datos) return <ConversacionClienteNoDisponible />;

  const nombresIniciales = Object.fromEntries(datos.directorio.map((c) => [c.id, c.nombre]));
  const subtitulo = "Hilo interno del despacho sobre este cliente";

  return (
    <div className="flex h-[560px] min-h-0 overflow-hidden rounded-lg border border-border">
      {datos.convId ? (
        <ChatConversacion
          key={datos.convId}
          conversacionId={datos.convId}
          titulo={clienteNombre}
          subtitulo={subtitulo}
          etiqueta="Conversación del cliente"
          mensajesIniciales={datos.mensajes}
          yo={datos.yo}
          nombresIniciales={nombresIniciales}
          enlaceCabecera={{ href: `/chat/${datos.convId}`, label: "Abrir en el chat" }}
          rol={datos.rol}
        />
      ) : (
        <HiloClienteNuevo
          clienteId={clienteId}
          titulo={clienteNombre}
          subtitulo={subtitulo}
          yo={datos.yo}
          nombresIniciales={nombresIniciales}
          miembros={datos.miembros}
          rol={datos.rol}
        />
      )}
    </div>
  );
}
