"use client";

// Realtime del chat interno (US-06). Solo en cliente.
// Supabase Realtime aplica la RLS de `mensajes` (chat_puede_ver) a los eventos
// postgres_changes, así que el socket DEBE ir autenticado con el JWT del usuario:
// si fuera con la clave anónima, no llegaría ningún evento.

import { useEffect, useRef, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/client";
import { cargarPosteriores, obtenerNoLeidos } from "@/app/(panel)/chat/actions";
import type { Mensaje } from "@/lib/types";

/** Evento de ventana que avisa de que han cambiado los no leídos (p. ej. tras marcar leída). */
export const EVENTO_NO_LEIDOS = "chat:no-leidos";

export function avisarNoLeidos() {
  if (typeof window !== "undefined") window.dispatchEvent(new Event(EVENTO_NO_LEIDOS));
}

let preparado: Promise<SupabaseClient> | null = null;

/**
 * Cliente de navegador con Realtime autenticado (una sola vez por pestaña):
 * pasa el access_token de la sesión al socket y lo renueva en cada refresco de token.
 */
function clienteRealtime(): Promise<SupabaseClient> {
  if (!preparado) {
    preparado = (async () => {
      const supabase = createClient();
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (session?.access_token) await supabase.realtime.setAuth(session.access_token);
      supabase.auth.onAuthStateChange((evento, s) => {
        if (s?.access_token && (evento === "TOKEN_REFRESHED" || evento === "SIGNED_IN")) {
          void supabase.realtime.setAuth(s.access_token);
        }
      });
      return supabase;
    })().catch((e) => {
      preparado = null;
      throw e;
    });
  }
  return preparado;
}

let secuencia = 0;
/** Nombre de canal único por suscripción (dos componentes no comparten canal). */
const nombreCanal = (base: string) => `${base}:${++secuencia}:${Date.now().toString(36)}`;

export type CambioMensaje =
  | { tipo: "upsert"; mensajes: Mensaje[] }
  | { tipo: "borrado"; id: string };

/**
 * UC-603 AC-01: cambios en los mensajes de una conversación.
 * Al suscribirse, tras una reconexión o al volver la red / la pestaña, recupera los mensajes
 * posteriores al último conocido (`ultimaFecha`) y los entrega como `upsert`.
 */
export function useMensajesRealtime(
  conversacionId: string,
  onCambio: (c: CambioMensaje) => void,
  ultimaFecha: () => string | null,
) {
  const onCambioRef = useRef(onCambio);
  const ultimaRef = useRef(ultimaFecha);
  useEffect(() => {
    onCambioRef.current = onCambio;
    ultimaRef.current = ultimaFecha;
  });

  useEffect(() => {
    let activo = true;
    let quitar: (() => void) | null = null;

    const rellenar = async () => {
      const desde = ultimaRef.current();
      if (!desde) return;
      try {
        const r = await cargarPosteriores(conversacionId, desde);
        if (activo && "mensajes" in r && r.mensajes.length > 0) {
          onCambioRef.current({ tipo: "upsert", mensajes: r.mensajes });
        }
      } catch {
        // Sin red: se reintentará en la siguiente reconexión.
      }
    };

    clienteRealtime()
      .then((supabase) => {
        if (!activo) return;
        const canal = supabase
          .channel(nombreCanal(`mensajes:${conversacionId}`))
          .on(
            "postgres_changes",
            {
              event: "*",
              schema: "public",
              table: "mensajes",
              filter: `conversacion_id=eq.${conversacionId}`,
            },
            (payload) => {
              if (payload.eventType === "DELETE") {
                const id = (payload.old as { id?: string }).id;
                if (id) onCambioRef.current({ tipo: "borrado", id });
                return;
              }
              onCambioRef.current({ tipo: "upsert", mensajes: [payload.new as Mensaje] });
            },
          )
          .subscribe((estado) => {
            // Cada SUBSCRIBED (el primero y los de cada reconexión) rellena el hueco:
            // lo escrito entre el render en servidor y la suscripción, o durante el corte.
            if (estado === "SUBSCRIBED") void rellenar();
          });
        quitar = () => void supabase.removeChannel(canal);
      })
      .catch((e) => console.error("[chat] realtime", e));

    // Red recuperada o pestaña de nuevo visible: rellenamos por si se perdió algo.
    const alVolver = () => {
      if (document.visibilityState === "visible") void rellenar();
    };
    window.addEventListener("online", alVolver);
    document.addEventListener("visibilitychange", alVolver);

    return () => {
      activo = false;
      window.removeEventListener("online", alVolver);
      document.removeEventListener("visibilitychange", alVolver);
      quitar?.();
    };
  }, [conversacionId]);
}

/**
 * Llama a `alCambiar` (con debounce de 300 ms) cuando llega un mensaje a cualquier
 * conversación visible (la RLS filtra los eventos) o cuando se dispara `chat:no-leidos`.
 */
export function useAvisoMensajes(alCambiar: () => void) {
  const alCambiarRef = useRef(alCambiar);
  useEffect(() => {
    alCambiarRef.current = alCambiar;
  });

  useEffect(() => {
    let activo = true;
    let temporizador: ReturnType<typeof setTimeout> | null = null;
    let quitar: (() => void) | null = null;

    const programar = () => {
      if (temporizador) clearTimeout(temporizador);
      temporizador = setTimeout(() => {
        if (activo) alCambiarRef.current();
      }, 300);
    };

    clienteRealtime()
      .then((supabase) => {
        if (!activo) return;
        const canal = supabase
          .channel(nombreCanal("mensajes-nuevos"))
          .on("postgres_changes", { event: "INSERT", schema: "public", table: "mensajes" }, programar)
          .subscribe();
        quitar = () => void supabase.removeChannel(canal);
      })
      .catch((e) => console.error("[chat] realtime", e));

    window.addEventListener(EVENTO_NO_LEIDOS, programar);
    window.addEventListener("online", programar);
    return () => {
      activo = false;
      if (temporizador) clearTimeout(temporizador);
      window.removeEventListener(EVENTO_NO_LEIDOS, programar);
      window.removeEventListener("online", programar);
      quitar?.();
    };
  }, []);
}

/** UC-604: no leídos por conversación y total, siempre al día. */
export function useNoLeidos(inicial: number) {
  const [estado, setEstado] = useState<{ porConversacion: Record<string, number>; total: number }>(
    { porConversacion: {}, total: inicial },
  );
  useAvisoMensajes(() => {
    obtenerNoLeidos()
      .then(({ filas, total }) =>
        setEstado({
          porConversacion: Object.fromEntries(filas.map((f) => [f.conversacion_id, f.no_leidos])),
          total,
        }),
      )
      .catch(() => {
        // Sin red: se mantiene el último valor conocido.
      });
  });
  return estado;
}
