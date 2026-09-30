"use client";

// Realtime del chat interno (US-06). Solo en cliente.
// Supabase Realtime aplica la RLS de `mensajes` (chat_puede_ver) a los eventos
// postgres_changes, así que el socket DEBE ir autenticado con el JWT del usuario:
// si fuera con la clave anónima, no llegaría ningún evento.

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import type { RealtimeChannel, SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/client";
import { cargarPosteriores, cargarUltimos, obtenerNoLeidos } from "@/app/(panel)/chat/actions";
import {
  ESCRIBIENDO_CADA_MS,
  ESCRIBIENDO_CADUCA_MS,
  MENSAJES_POR_RELLENO,
  mezclaMensajes,
} from "@/lib/chat/core";
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
 * posteriores al último conocido (`ultimaFecha`) y los entrega como `upsert`. En las
 * reconexiones y al volver (no en la primera suscripción, que ya trae el render inicial)
 * también relee la última página: las ediciones y borrados hechos durante el corte llegan
 * así como filas del servidor que sustituyen a las locales.
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
    const rellenar = async (releerVentana: boolean) => {
      let desde = ultimaRef.current();
      if (!desde) return;
      let recuperados: Mensaje[] = [];
      // En paralelo con el relleno: la última página tal como está ahora en el servidor.
      const ventana = releerVentana
        ? cargarUltimos(conversacionId).then(
            (r) => ("mensajes" in r ? r.mensajes : []),
            () => [] as Mensaje[],
          )
        : Promise.resolve([] as Mensaje[]);
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
      recuperados = mezclaMensajes(await ventana, recuperados);
      if (activo && recuperados.length > 0) {
        onCambioRef.current({ tipo: "upsert", mensajes: recuperados });
      }
    };

    clienteRealtime()
      .then((supabase) => {
        if (!activo) return;
        let primeraSuscripcion = true;
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
            if (estado !== "SUBSCRIBED") return;
            void rellenar(!primeraSuscripcion);
            primeraSuscripcion = false;
          });
        quitar = () => void supabase.removeChannel(canal);
      })
      .catch((e) => console.error("[chat] realtime", e));

    // Red recuperada o pestaña de nuevo visible: rellenamos por si se perdió algo.
    const alVolver = () => {
      if (document.visibilityState === "visible") void rellenar(true);
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
 * UC-606: mensajes nuevos de cualquier conversación visible (la RLS filtra los eventos), con
 * la fila completa, sin debounce: la ficha de un cliente sin hilo engancha el hilo en cuanto
 * llega su primer mensaje. `onResync` se llama tras una reconexión del canal, al volver la
 * red o al volver a ver la pestaña, por si se perdió el evento durante el corte.
 */
export function useMensajesNuevos(onNuevo: (m: Mensaje) => void, onResync: () => void) {
  const onNuevoRef = useRef(onNuevo);
  const onResyncRef = useRef(onResync);
  useEffect(() => {
    onNuevoRef.current = onNuevo;
    onResyncRef.current = onResync;
  });

  useEffect(() => {
    let activo = true;
    let quitar: (() => void) | null = null;
    const resync = () => {
      if (activo) onResyncRef.current();
    };

    clienteRealtime()
      .then((supabase) => {
        if (!activo) return;
        let primeraSuscripcion = true;
        const canal = supabase
          .channel(nombreCanal("mensajes-ficha"))
          .on("postgres_changes", { event: "INSERT", schema: "public", table: "mensajes" }, (payload) => {
            if (activo) onNuevoRef.current(payload.new as Mensaje);
          })
          .subscribe((estado) => {
            if (estado !== "SUBSCRIBED") return;
            if (primeraSuscripcion) primeraSuscripcion = false;
            else resync();
          });
        quitar = () => void supabase.removeChannel(canal);
      })
      .catch((e) => console.error("[chat] realtime", e));

    const alVolverVisible = () => {
      if (document.visibilityState === "visible") resync();
    };
    window.addEventListener("online", resync);
    document.addEventListener("visibilitychange", alVolverVisible);
    return () => {
      activo = false;
      window.removeEventListener("online", resync);
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

/**
 * Suscripción genérica a cambios de una tabla (postgres_changes) con el socket autenticado:
 * la RLS de la tabla decide qué eventos llegan. Llama a `alCambiar` con debounce de
 * `esperaMs`; también tras una reconexión y al volver la red o la pestaña, por si se
 * perdieron eventos durante el corte. Se limpia al desmontar o al cambiar tabla/filtro.
 */
export function useCambiosTabla(
  {
    tabla,
    filtro,
    evento = "*",
    esperaMs = 200,
  }: {
    tabla: string;
    filtro?: string;
    evento?: "INSERT" | "UPDATE" | "DELETE" | "*";
    esperaMs?: number;
  },
  alCambiar: () => void,
) {
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
      }, esperaMs);
    };

    clienteRealtime()
      .then((supabase) => {
        if (!activo) return;
        let primeraSuscripcion = true;
        const canal = supabase
          .channel(nombreCanal(`${tabla}:${filtro ?? "todo"}`))
          .on(
            "postgres_changes",
            { event: evento, schema: "public", table: tabla, ...(filtro ? { filter: filtro } : {}) },
            programar,
          )
          .subscribe((estado) => {
            if (estado !== "SUBSCRIBED") return;
            if (primeraSuscripcion) primeraSuscripcion = false;
            else programar();
          });
        quitar = () => void supabase.removeChannel(canal);
      })
      .catch((e) => console.error("[realtime]", tabla, e));

    const alVolverVisible = () => {
      if (document.visibilityState === "visible") programar();
    };
    window.addEventListener("online", programar);
    document.addEventListener("visibilitychange", alVolverVisible);
    return () => {
      activo = false;
      if (temporizador) clearTimeout(temporizador);
      window.removeEventListener("online", programar);
      document.removeEventListener("visibilitychange", alVolverVisible);
      quitar?.();
    };
  }, [tabla, filtro, evento, esperaMs]);
}

// ============================================================================
// UC-613: canales privados de Realtime (presencia y "escribiendo…")
// ============================================================================
// Son canales con Realtime Authorization (`private: true`): la política de
// realtime.messages decide quién entra. Como `supabase.channel(topic)` reutiliza el canal
// si ya existe uno con ese nombre, cada tema se comparte entre componentes con un contador
// de referencias y se cierra con un pequeño retardo (así el doble montaje de React no lo
// destruye y lo vuelve a crear). Si el canal falla (p. ej. políticas aún sin desplegar),
// se abandona en silencio: el chat sigue funcionando sin presencia ni "escribiendo…".

/** Fallos seguidos al entrar en un canal privado antes de abandonarlo. */
const MAX_FALLOS_CANAL = 3;
/** Espera (ms) antes de cerrar un canal sin usuarios. */
const ESPERA_CIERRE_CANAL = 1500;

type OyenteCanal = (evento: string, payload: Record<string, unknown>, canal: RealtimeChannel) => void;

interface CanalCompartido {
  refs: number;
  canal: RealtimeChannel | null;
  suscrito: boolean;
  fallos: number;
  cierre: ReturnType<typeof setTimeout> | null;
  oyentes: Set<OyenteCanal>;
}

const canalesPrivados = new Map<string, CanalCompartido>();
const cerrandoCanales = new Map<string, Promise<unknown>>();

function emitirCanal(e: CanalCompartido, evento: string, payload: Record<string, unknown>) {
  const canal = e.canal;
  if (!canal) return;
  e.oyentes.forEach((f) => f(evento, payload, canal));
}

/**
 * Abre (o reutiliza) el canal privado `topic`. `configurar` añade los `.on(...)` al crearlo y
 * recibe el id del usuario de la sesión. Devuelve la entrada compartida y la función para
 * soltarla.
 */
function adquirirCanalPrivado(
  topic: string,
  configurar: (supabase: SupabaseClient, userId: string, emitir: (ev: string, p: Record<string, unknown>) => void) => RealtimeChannel,
): { entrada: CanalCompartido; soltar: () => void } {
  let e = canalesPrivados.get(topic);
  if (!e) {
    const nueva: CanalCompartido = {
      refs: 0,
      canal: null,
      suscrito: false,
      fallos: 0,
      cierre: null,
      oyentes: new Set(),
    };
    e = nueva;
    canalesPrivados.set(topic, nueva);
    void (async () => {
      try {
        // Si se está cerrando un canal con el mismo tema, se espera a que termine.
        await cerrandoCanales.get(topic);
        const supabase = await clienteRealtime();
        const {
          data: { session },
        } = await supabase.auth.getSession();
        const userId = session?.user?.id;
        if (!userId || canalesPrivados.get(topic) !== nueva) return;
        const emitir = (ev: string, p: Record<string, unknown>) => emitirCanal(nueva, ev, p);
        const canal = configurar(supabase, userId, emitir);
        nueva.canal = canal;
        canal.subscribe((estado) => {
          if (canalesPrivados.get(topic) !== nueva) return;
          if (estado === "SUBSCRIBED") {
            nueva.suscrito = true;
            nueva.fallos = 0;
            emitir("estado", { suscrito: true });
            return;
          }
          nueva.suscrito = false;
          emitir("estado", { suscrito: false });
          if (estado === "CHANNEL_ERROR" || estado === "TIMED_OUT") {
            nueva.fallos += 1;
            // Sin permiso (políticas sin desplegar) o caído de forma persistente: se abandona.
            if (nueva.fallos >= MAX_FALLOS_CANAL) {
              nueva.canal = null;
              void supabase.removeChannel(canal).catch(() => {});
            }
          }
        });
      } catch {
        // Sin Realtime: la UI funciona igual, sin presencia ni "escribiendo…".
      }
    })();
  }
  const entrada = e;
  if (entrada.cierre) {
    clearTimeout(entrada.cierre);
    entrada.cierre = null;
  }
  entrada.refs += 1;
  let suelto = false;
  const soltar = () => {
    if (suelto) return;
    suelto = true;
    entrada.refs -= 1;
    if (entrada.refs > 0) return;
    entrada.cierre = setTimeout(() => {
      if (entrada.refs > 0 || canalesPrivados.get(topic) !== entrada) return;
      canalesPrivados.delete(topic);
      const canal = entrada.canal;
      entrada.canal = null;
      entrada.suscrito = false;
      if (!canal) return;
      const cierre = (async () => {
        try {
          const supabase = clienteNavegador();
          await supabase.removeChannel(canal);
        } catch {
          // Ya estaba cerrado.
        }
      })();
      cerrandoCanales.set(topic, cierre);
      void cierre.finally(() => {
        if (cerrandoCanales.get(topic) === cierre) cerrandoCanales.delete(topic);
      });
    }, ESPERA_CIERRE_CANAL);
  };
  return { entrada, soltar };
}

// ---- Presencia (UC-613 AC-40) ----

let conectados: ReadonlySet<string> = new Set();
const oyentesPresencia = new Set<() => void>();
const SIN_CONECTADOS: ReadonlySet<string> = new Set();

function publicarConectados(ids: ReadonlySet<string>) {
  const iguales = ids.size === conectados.size && [...ids].every((id) => conectados.has(id));
  if (iguales) return;
  conectados = ids;
  oyentesPresencia.forEach((f) => f());
}

function suscribirPresencia(f: () => void) {
  oyentesPresencia.add(f);
  return () => {
    oyentesPresencia.delete(f);
  };
}

let salidaRegistrada = false;

/**
 * UC-613: compañeros con la plataforma abierta. Una sola suscripción por pestaña al canal
 * privado `presencia` (compartida entre componentes), que anuncia al usuario con su id como
 * clave. Al cerrar la pestaña se hace `untrack`; si el navegador no llega a hacerlo, la
 * salida se detecta al cerrarse el socket. Devuelve el conjunto de ids conectados.
 */
export function usePresencia(): ReadonlySet<string> {
  const ids = useSyncExternalStore(suscribirPresencia, () => conectados, () => SIN_CONECTADOS);

  useEffect(() => {
    const { entrada, soltar } = adquirirCanalPrivado("presencia", (supabase, userId, emitir) => {
      const canal = supabase.channel("presencia", {
        config: { private: true, presence: { key: userId } },
      });
      canal.on("presence", { event: "sync" }, () => emitir("sync", {}));
      return canal;
    });

    const oyente: OyenteCanal = (evento, payload, canal) => {
      if (evento === "sync") {
        publicarConectados(new Set(Object.keys(canal.presenceState())));
      } else if (evento === "estado") {
        if (payload.suscrito) {
          void (async () => {
            const {
              data: { session },
            } = await clienteNavegador().auth.getSession();
            if (session?.user?.id) await canal.track({ userId: session.user.id });
          })().catch(() => {});
        } else {
          publicarConectados(SIN_CONECTADOS);
        }
      }
    };
    entrada.oyentes.add(oyente);

    if (!salidaRegistrada && typeof window !== "undefined") {
      salidaRegistrada = true;
      window.addEventListener("pagehide", () => {
        const e = canalesPrivados.get("presencia");
        if (e?.canal && e.suscrito) void e.canal.untrack().catch(() => {});
      });
    }

    // Canal ya abierto por otro componente: se toma el estado actual.
    if (entrada.canal && entrada.suscrito) {
      publicarConectados(new Set(Object.keys(entrada.canal.presenceState())));
    }

    return () => {
      entrada.oyentes.delete(oyente);
      // Al cerrarse el canal (último componente) el servidor da de baja la presencia.
      soltar();
    };
  }, []);

  return ids;
}

// ---- "Escribiendo…" (UC-613 AC-39) ----

export interface Escribiendo {
  /** Nombres de quienes están escribiendo ahora (sin uno mismo). */
  nombres: string[];
  /** Llamar al teclear: avisa como mucho cada 2 s. */
  avisarEscribiendo: () => void;
  /** Llamar al enviar, al vaciar la caja o al salir de ella. */
  avisarDejo: () => void;
  /** Quita a un usuario de la lista (p. ej. al llegar su mensaje). */
  quitar: (userId: string) => void;
}

/**
 * UC-613: "Fulano está escribiendo…" en una conversación, por Broadcast en el canal privado
 * `chat:<conversación>`. Nada se guarda en la base de datos. Cada aviso caduca a los 5 s.
 */
export function useEscribiendo(
  conversacionId: string,
  yo: { id: string; nombre: string },
): Escribiendo {
  const [activos, setActivos] = useState<Record<string, string>>({});
  const temporizadores = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  const entradaRef = useRef<CanalCompartido | null>(null);
  const ultimoEnvio = useRef(0);
  const yoRef = useRef(yo);
  useEffect(() => {
    yoRef.current = yo;
  });

  const quitar = useCallback((userId: string) => {
    const t = temporizadores.current.get(userId);
    if (t) clearTimeout(t);
    temporizadores.current.delete(userId);
    setActivos((a) => {
      if (!(userId in a)) return a;
      const sig = { ...a };
      delete sig[userId];
      return sig;
    });
  }, []);

  useEffect(() => {
    const topic = `chat:${conversacionId}`;
    const timers = temporizadores.current;
    const { entrada, soltar } = adquirirCanalPrivado(topic, (supabase, _userId, emitir) => {
      const canal = supabase.channel(topic, {
        config: { private: true, broadcast: { self: false } },
      });
      canal
        .on("broadcast", { event: "escribiendo" }, ({ payload }) => emitir("escribiendo", payload ?? {}))
        .on("broadcast", { event: "dejo" }, ({ payload }) => emitir("dejo", payload ?? {}));
      return canal;
    });
    entradaRef.current = entrada;

    const oyente: OyenteCanal = (evento, payload) => {
      const userId = typeof payload.userId === "string" ? payload.userId : null;
      if (!userId || userId === yoRef.current.id) return;
      if (evento === "dejo") {
        quitar(userId);
        return;
      }
      if (evento !== "escribiendo") return;
      const nombre = typeof payload.nombre === "string" && payload.nombre.trim() ? payload.nombre.trim().slice(0, 80) : "Alguien";
      const previo = timers.get(userId);
      if (previo) clearTimeout(previo);
      timers.set(
        userId,
        setTimeout(() => quitar(userId), ESCRIBIENDO_CADUCA_MS),
      );
      setActivos((a) => (a[userId] === nombre ? a : { ...a, [userId]: nombre }));
    };
    entrada.oyentes.add(oyente);

    return () => {
      entrada.oyentes.delete(oyente);
      timers.forEach(clearTimeout);
      timers.clear();
      setActivos({});
      if (entradaRef.current === entrada) entradaRef.current = null;
      soltar();
    };
  }, [conversacionId, quitar]);

  const enviar = useCallback((evento: "escribiendo" | "dejo") => {
    const e = entradaRef.current;
    // Solo por el socket y con el canal dentro (sin caer al envío por REST).
    if (!e?.canal || !e.suscrito) return false;
    void e.canal
      .send({
        type: "broadcast",
        event: evento,
        payload: { userId: yoRef.current.id, nombre: yoRef.current.nombre },
      })
      .catch(() => {});
    return true;
  }, []);

  const avisarEscribiendo = useCallback(() => {
    const ahora = Date.now();
    if (ahora - ultimoEnvio.current < ESCRIBIENDO_CADA_MS) return;
    if (enviar("escribiendo")) ultimoEnvio.current = ahora;
  }, [enviar]);

  const avisarDejo = useCallback(() => {
    // Solo si se había avisado de que se escribía.
    if (ultimoEnvio.current === 0) return;
    ultimoEnvio.current = 0;
    enviar("dejo");
  }, [enviar]);

  return { nombres: Object.values(activos), avisarEscribiendo, avisarDejo, quitar };
}
