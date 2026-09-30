"use client";

// Realtime del chat interno (US-06). Solo en cliente.
// Supabase Realtime aplica la RLS de `mensajes` (chat_puede_ver) a los eventos
// postgres_changes, así que el socket DEBE ir autenticado con el JWT del usuario:
// si fuera con la clave anónima, no llegaría ningún evento.

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/client";
import { cargarPosteriores, obtenerNoLeidos } from "@/app/(panel)/chat/actions";
import { MENSAJES_POR_RELLENO, mezclaMensajes } from "@/lib/chat/core";
import type { Mensaje } from "@/lib/types";

/** Evento de ventana que avisa de que han cambiado los no leídos (p. ej. tras marcar leída). */
const EVENTO_NO_LEIDOS = "chat:no-leidos";

/** Tope de páginas al rellenar un hueco (20 × 200 mensajes); a partir de ahí se deja de pedir. */
const MAX_PAGINAS_RELLENO = 20;

export function avisarNoLeidos() {
  if (typeof window !== "undefined") window.dispatchEvent(new Event(EVENTO_NO_LEIDOS));
}

// ---- Conversación abierta (visible en esta pestaña) ----
// La registra ChatConversacion; el badge no cuenta sus mensajes porque se están leyendo.

let conversacionAbierta: string | null = null;
const oyentesAbierta = new Set<() => void>();

export function setConversacionAbierta(id: string | null) {
  if (conversacionAbierta === id) return;
  conversacionAbierta = id;
  oyentesAbierta.forEach((f) => f());
}

/** Quita la conversación abierta solo si sigue siendo `id` (evita pisar a otra recién montada). */
export function limpiarConversacionAbierta(id: string) {
  if (conversacionAbierta === id) setConversacionAbierta(null);
}

function suscribirAbierta(f: () => void) {
  oyentesAbierta.add(f);
  return () => {
    oyentesAbierta.delete(f);
  };
}

const leerAbierta = () => conversacionAbierta;
const leerAbiertaServidor = () => null;

// ---- Cliente de navegador ----

let cliente: SupabaseClient | null = null;

/** Instancia única del cliente de navegador, con el oyente de sesión registrado una vez. */
function clienteNavegador(): SupabaseClient {
  if (!cliente) {
    const supabase = createClient();
    supabase.auth.onAuthStateChange((evento, s) => {
      if (evento === "SIGNED_OUT") {
        void supabase.removeAllChannels();
        return;
      }
      if (s?.access_token && (evento === "TOKEN_REFRESHED" || evento === "SIGNED_IN")) {
        void supabase.realtime.setAuth(s.access_token);
      }
    });
    cliente = supabase;
  }
  return cliente;
}

/**
 * Cliente con Realtime autenticado para una suscripción nueva. El token NO se cachea:
 * se lee la sesión actual (cookies) en cada suscripción y se pasa al socket, de modo que
 * tras cerrar sesión y entrar con otro usuario en la misma pestaña se usa el token nuevo.
 */
async function clienteRealtime(): Promise<SupabaseClient> {
  const supabase = clienteNavegador();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (session?.access_token) await supabase.realtime.setAuth(session.access_token);
  return supabase;
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

    // Pide páginas hasta que una venga incompleta (con tope), así un corte largo
    // no deja un hueco permanente en el hilo.
    const rellenar = async () => {
      let desde = ultimaRef.current();
      if (!desde) return;
      let recuperados: Mensaje[] = [];
      try {
        for (let i = 0; i < MAX_PAGINAS_RELLENO && activo; i++) {
          const r = await cargarPosteriores(conversacionId, desde);
          if (!("mensajes" in r)) break;
          recuperados = mezclaMensajes(recuperados, r.mensajes);
          if (r.mensajes.length < MENSAJES_POR_RELLENO) break;
          desde = r.mensajes[r.mensajes.length - 1].created_at;
        }
      } catch {
        // Sin red: se entrega lo recuperado y se reintentará en la siguiente reconexión.
      }
      if (activo && recuperados.length > 0) {
        onCambioRef.current({ tipo: "upsert", mensajes: recuperados });
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
 * Tras una reconexión del canal, al volver la red o al volver a ver la pestaña también
 * refresca, por si se perdieron eventos durante el corte.
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
        let primeraSuscripcion = true;
        const canal = supabase
          .channel(nombreCanal("mensajes-nuevos"))
          .on("postgres_changes", { event: "INSERT", schema: "public", table: "mensajes" }, programar)
          .subscribe((estado) => {
            if (estado !== "SUBSCRIBED") return;
            // El primero no hace falta (el valor inicial viene del servidor);
            // los siguientes son reconexiones y pueden haber perdido eventos.
            if (primeraSuscripcion) primeraSuscripcion = false;
            else programar();
          });
        quitar = () => void supabase.removeChannel(canal);
      })
      .catch((e) => console.error("[chat] realtime", e));

    const alVolverVisible = () => {
      if (document.visibilityState === "visible") programar();
    };

    window.addEventListener(EVENTO_NO_LEIDOS, programar);
    window.addEventListener("online", programar);
    document.addEventListener("visibilitychange", alVolverVisible);
    return () => {
      activo = false;
      if (temporizador) clearTimeout(temporizador);
      window.removeEventListener(EVENTO_NO_LEIDOS, programar);
      window.removeEventListener("online", programar);
      document.removeEventListener("visibilitychange", alVolverVisible);
      quitar?.();
    };
  }, []);
}

/**
 * UC-604: no leídos por conversación y total, siempre al día. El total excluye la
 * conversación abierta en esta pestaña (se está leyendo), igual que la bandeja.
 */
export function useNoLeidos(inicial: number) {
  const [porConversacion, setPorConversacion] = useState<Record<string, number> | null>(null);
  const abierta = useSyncExternalStore(suscribirAbierta, leerAbierta, leerAbiertaServidor);

  useAvisoMensajes(() => {
    obtenerNoLeidos()
      .then(({ filas }) =>
        setPorConversacion(Object.fromEntries(filas.map((f) => [f.conversacion_id, f.no_leidos]))),
      )
      .catch(() => {
        // Sin red: se mantiene el último valor conocido.
      });
  });

  // Hasta la primera carga en cliente solo tenemos el total del servidor.
  const total =
    porConversacion === null
      ? inicial
      : Object.entries(porConversacion).reduce(
          (acc, [id, n]) => (id === abierta || n <= 0 ? acc : acc + n),
          0,
        );
  return { porConversacion: porConversacion ?? {}, total };
}
