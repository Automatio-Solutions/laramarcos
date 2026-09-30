"use client";

import { useRef, useState } from "react";
import {
  abrirHiloCliente,
  abrirHiloClienteYEnviar,
  buscarHiloCliente,
  enviarMensaje,
  hiloClienteDeConversacion,
} from "@/app/(panel)/chat/actions";
import { useMensajesNuevos } from "@/lib/chat/realtime";
import { mezclaMensajes } from "@/lib/chat/core";
import type { Mensaje, Rol } from "@/lib/types";
import { ChatComposer } from "./ChatComposer";
import { ChatConversacion } from "./ChatConversacion";
import type { Miembro } from "./MencionPicker";

type Pendiente = { id: string; texto: string; menciones: string[] };


/**
 * UC-606: hilo de un cliente que todavía no tiene conversación. Visitar la ficha no crea
 * nada: se muestra la caja de escritura vacía y la conversación se crea
 * (chat_abrir_cliente) al enviar el primer mensaje. A partir de ahí se pinta la
 * conversación normal, con su suscripción en tiempo real. Si es otro compañero quien
 * escribe primero, el aviso de mensajes nuevos engancha esta vista al hilo recién creado.
 */
export function HiloClienteNuevo({
  clienteId,
  titulo,
  subtitulo,
  yo,
  nombresIniciales,
  miembros,
  rol = null,
}: {
  clienteId: string;
  titulo: string;
  subtitulo: string;
  yo: { id: string; nombre: string };
  nombresIniciales: Record<string, string>;
  /** Quienes verán el hilo (staff + la sede del cliente), para el selector de @. */
  miembros: Miembro[];
  /** Rol del usuario, para moderar (UC-612). */
  rol?: Rol | null;
}) {
  const [abierta, setAbierta] = useState<{ id: string; mensajes: Mensaje[] } | null>(null);
  /** Mensajes escritos antes de que exista la conversación, en orden. */
  const [pendientes, setPendientes] = useState<Pendiente[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const cola = useRef<Pendiente[]>([]);
  const enviados = useRef<Mensaje[]>([]);
  /** Conversación ya creada (aunque luego fallara el envío de algún mensaje). */
  const conv = useRef<{ id: string; mensajes: Mensaje[] } | null>(null);
  const enCurso = useRef(false);

  /** Conversaciones que ya se comprobó que NO son el hilo de este cliente (una consulta por cada una). */
  const ajenas = useRef(new Set<string>());
  /** Conversación que se está comprobando ahora (evita consultas duplicadas por ráfagas). */
  const comprobando = useRef<string | null>(null);
  /** Ya se pinta la conversación (o se está a punto): no se vuelve a enganchar. */
  const abiertaRef = useRef(false);
  const puedeEngancharse = () => !abiertaRef.current && !enCurso.current && cola.current.length === 0;
  const engancharse = (r: { id: string; mensajes: Mensaje[] }, extra: Mensaje[] = []) => {
    if (!puedeEngancharse()) return;
    abiertaRef.current = true;
    setAbierta({ id: r.id, mensajes: mezclaMensajes(r.mensajes, extra) });
  };

  // Si otro compañero escribe el primer mensaje, llega su INSERT por Realtime (la RLS filtra
  // los eventos) con la fila completa. UNA llamada al servidor confirma que la conversación
  // es el hilo de este cliente y trae sus últimos mensajes; se pinta al momento con ellos y
  // con la fila recibida. Tras un corte (o al volver a la pestaña) se busca el hilo por cliente.
  useMensajesNuevos(
    (m) => {
      const conv = m.conversacion_id;
      if (!conv || !puedeEngancharse() || ajenas.current.has(conv) || comprobando.current === conv) return;
      comprobando.current = conv;
      hiloClienteDeConversacion(clienteId, conv)
        .then((r) => {
          if (r) engancharse(r, [m]);
          else ajenas.current.add(conv);
        })
        .catch(() => {
          // Sin red: se sigue en estado vacío; el siguiente evento o la reconexión lo reintentan.
        })
        .finally(() => {
          if (comprobando.current === conv) comprobando.current = null;
        });
    },
    () => {
      if (!puedeEngancharse()) return;
      buscarHiloCliente(clienteId)
        .then((r) => {
          if (r) engancharse(r);
        })
        .catch(() => {});
    },
  );

  /** Envía la cola en orden; al primer fallo se detiene y deja reintentar. */
  async function procesar() {
    if (enCurso.current) return;
    enCurso.current = true;
    setEnviando(true);
    setError(null);
    try {
      if (!conv.current) {
        const p = cola.current[0];
        if (p) {
          // Primer mensaje: abrir el hilo y enviarlo en una sola llamada.
          const r = await abrirHiloClienteYEnviar(clienteId, p);
          if ("error" in r) throw new Error(r.error);
          conv.current = { id: r.id, mensajes: r.mensajes };
          enviados.current.push(r.enviado);
          cola.current = cola.current.slice(1);
          setPendientes(cola.current);
        } else {
          const r = await abrirHiloCliente(clienteId);
          if ("error" in r) throw new Error(r.error);
          conv.current = r;
        }
      }
      const { id } = conv.current;
      while (cola.current.length > 0) {
        const p = cola.current[0];
        // El id lo fija el cliente: reintentar el mismo mensaje es idempotente.
        const r = await enviarMensaje({ id: p.id, conversacionId: id, texto: p.texto, menciones: p.menciones });
        if ("error" in r) throw new Error(r.error);
        enviados.current.push(r.mensaje);
        cola.current = cola.current.slice(1);
        setPendientes(cola.current);
      }
      abiertaRef.current = true;
      setAbierta({ id, mensajes: mezclaMensajes(conv.current.mensajes, enviados.current) });
    } catch (e) {
      setError(e instanceof Error && e.message ? e.message : "No se pudo enviar el mensaje.");
    } finally {
      enCurso.current = false;
      setEnviando(false);
    }
  }

  function encolar(texto: string, menciones: string[]) {
    cola.current = [...cola.current, { id: crypto.randomUUID(), texto, menciones }];
    setPendientes(cola.current);
    // Si ya hay un envío en marcha, su bucle recogerá este mensaje.
    if (!enCurso.current && !error) void procesar();
  }

  if (abierta) {
    return (
      <ChatConversacion
        key={abierta.id}
        conversacionId={abierta.id}
        titulo={titulo}
        subtitulo={subtitulo}
        etiqueta="Conversación del cliente"
        mensajesIniciales={abierta.mensajes}
        yo={yo}
        nombresIniciales={nombresIniciales}
        enlaceCabecera={{ href: `/chat/${abierta.id}`, label: "Abrir en el chat" }}
        rol={rol}
      />
    );
  }

  return (
    <section
      className="flex min-h-0 min-w-0 flex-1 flex-col bg-surface"
      aria-label="Conversación del cliente"
    >
      <header className="flex shrink-0 items-center gap-3 border-b border-border px-5 py-3">
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-base font-semibold text-fg">{titulo}</h1>
          <p className="truncate text-xs text-fg-muted">{subtitulo}</p>
        </div>
      </header>
      <div role="log" aria-live="polite" aria-label="Mensajes" className="min-h-0 flex-1 overflow-y-auto py-3">
        {pendientes.length > 0 ? (
          <ul>
            {pendientes.map((p) => (
              <li key={p.id} className="px-5 py-2">
                <p className="whitespace-pre-wrap break-words text-sm text-fg opacity-60">{p.texto}</p>
              </li>
            ))}
            <li className="px-5 py-1">
              {enviando || !error ? (
                <p className="text-xs text-fg-muted">Enviando…</p>
              ) : (
                <p role="alert" className="text-xs text-error">
                  No enviado. {error}{" "}
                  <button type="button" onClick={() => void procesar()} className="font-medium underline">
                    Reintentar
                  </button>
                </p>
              )}
            </li>
          </ul>
        ) : (
          <p className="px-5 py-16 text-center text-sm text-fg-muted">
            Aún no hay mensajes. Escribe el primero.
          </p>
        )}
      </div>
      <ChatComposer
        placeholder={`Escribe en ${titulo}…`}
        miembros={miembros}
        yoId={yo.id}
        onEnviar={encolar}
      />
    </section>
  );
}
