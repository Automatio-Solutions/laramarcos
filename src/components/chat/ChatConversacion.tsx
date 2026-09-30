"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  cargarAnteriores,
  enviarMensaje,
  marcarLeida,
  obtenerMiembros,
  resolverEnlaces,
  resolverNombres,
} from "@/app/(panel)/chat/actions";
import {
  MENSAJES_POR_PAGINA,
  agrupaPorDia,
  detectaEnlaces,
  etiquetaDia,
  mezclaMensajes,
  type TipoEnlace,
} from "@/lib/chat/core";
import {
  avisarNoLeidos,
  limpiarConversacionAbierta,
  setConversacionAbierta,
  useMensajesRealtime,
  type CambioMensaje,
} from "@/lib/chat/realtime";
import type { Mensaje } from "@/lib/types";
import { ChatComposer } from "./ChatComposer";
import { ChatMensaje, type MensajeUI } from "./ChatMensaje";
import type { EstadoEnlace } from "./EnlaceCard";
import type { Miembro } from "./MencionPicker";

/** Distancia (px) al fondo por debajo de la cual se considera que el usuario "está abajo". */
const UMBRAL_FONDO = 120;
/** Distancia (px) al techo a partir de la cual se cargan mensajes anteriores. */
const UMBRAL_TECHO = 80;

/** Páginas anteriores que se cargan como mucho para llegar a un mensaje enlazado (?m=). */
const MAX_PAGINAS_OBJETIVO = 10;
/** Tiempo (ms) que se mantiene resaltado el mensaje enlazado. */
const DURACION_RESALTADO = 2500;

type Ajuste = { tipo: "fondo" } | { tipo: "restaurar"; alto: number; top: number } | null;

type Resuelto = { titulo: string; estado: string };

const claveEnlace = (tipo: TipoEnlace, id: string) => `${tipo}:${id}`;

/**
 * UC-602/UC-603: conversación abierta. Carga los 50 más recientes y, al subir, 50 más;
 * recibe mensajes en tiempo real; envía de forma optimista con reintento.
 */
export function ChatConversacion({
  conversacionId,
  titulo,
  subtitulo,
  mensajesIniciales,
  yo,
  nombresIniciales,
  mensajeObjetivo = null,
  enlaceCabecera,
  etiqueta,
}: {
  conversacionId: string;
  titulo: string;
  subtitulo?: string;
  mensajesIniciales: Mensaje[];
  yo: { id: string; nombre: string };
  nombresIniciales: Record<string, string>;
  /** Mensaje al que saltar y resaltar (enlace ?m= de una notificación). */
  mensajeObjetivo?: string | null;
  /** Enlace a la derecha de la cabecera (p. ej. "Ver ficha" en hilos de cliente). */
  enlaceCabecera?: { href: string; label: string };
  /** Nombre accesible de la sección (por defecto "Conversación: <título>"). */
  etiqueta?: string;
}) {
  const [mensajes, setMensajes] = useState<MensajeUI[]>(mensajesIniciales);
  const [hayMas, setHayMas] = useState(mensajesIniciales.length >= MENSAJES_POR_PAGINA);
  const [cargando, setCargando] = useState(false);
  const [errorAnteriores, setErrorAnteriores] = useState<string | null>(null);
  const [nombres, setNombres] = useState<Record<string, string>>(() => ({
    ...nombresIniciales,
    [yo.id]: yo.nombre,
  }));

  const scrollRef = useRef<HTMLDivElement>(null);
  const pegadoAbajo = useRef(true);
  const ajuste = useRef<Ajuste>({ tipo: "fondo" });
  const mensajesRef = useRef(mensajes);
  const cargandoRef = useRef(false);
  const pidiendoNombres = useRef(new Set<string>());
  const temporizadorLeida = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [miembros, setMiembros] = useState<Miembro[] | null>(null);
  const [enlaces, setEnlaces] = useState<Record<string, Resuelto | null>>({});
  const pidiendoEnlaces = useRef(new Set<string>());
  const [resaltadoId, setResaltadoId] = useState<string | null>(null);

  useEffect(() => {
    mensajesRef.current = mensajes;
  }, [mensajes]);

  // Posición del scroll tras cada cambio: al fondo (abrir / mensaje nuevo estando abajo)
  // o conservando la posición al anteponer mensajes anteriores.
  useLayoutEffect(() => {
    const el = scrollRef.current;
    const a = ajuste.current;
    if (!el || !a) return;
    el.scrollTop = a.tipo === "fondo" ? el.scrollHeight : el.scrollHeight - a.alto + a.top;
    ajuste.current = null;
  }, [mensajes]);

  // ---- Leído (UC-604 AC-03) ----
  const marcar = useCallback(() => {
    marcarLeida(conversacionId)
      .then(avisarNoLeidos)
      .catch(() => {});
  }, [conversacionId]);

  const marcarPronto = useCallback(() => {
    if (document.visibilityState !== "visible") return;
    if (temporizadorLeida.current) clearTimeout(temporizadorLeida.current);
    temporizadorLeida.current = setTimeout(marcar, 500);
  }, [marcar]);

  // Conversación abierta y visible: el badge global no cuenta sus mensajes (se están leyendo).
  useEffect(() => {
    const registrar = () =>
      document.visibilityState === "visible"
        ? setConversacionAbierta(conversacionId)
        : limpiarConversacionAbierta(conversacionId);
    registrar();
    document.addEventListener("visibilitychange", registrar);
    return () => {
      document.removeEventListener("visibilitychange", registrar);
      limpiarConversacionAbierta(conversacionId);
    };
  }, [conversacionId]);

  useEffect(() => {
    marcar();
    const alVolver = () => {
      if (document.visibilityState === "visible") marcar();
    };
    document.addEventListener("visibilitychange", alVolver);
    return () => {
      document.removeEventListener("visibilitychange", alVolver);
      if (temporizadorLeida.current) clearTimeout(temporizadorLeida.current);
    };
  }, [marcar]);

  // ---- Nombres de autores que no conocemos (bajas, mensajes por Realtime) ----
  useEffect(() => {
    const faltan = [
      ...new Set(
        mensajes
          .flatMap((m) => [m.autor_id, ...(m.menciones ?? [])])
          .filter((id): id is string => !!id && !nombres[id] && !pidiendoNombres.current.has(id)),
      ),
    ];
    if (faltan.length === 0) return;
    faltan.forEach((id) => pidiendoNombres.current.add(id));
    resolverNombres(faltan)
      .then((r) => setNombres((n) => ({ ...n, ...r })))
      .catch(() => faltan.forEach((id) => pidiendoNombres.current.delete(id)));
  }, [mensajes, nombres]);

  // ---- Miembros para el selector de @menciones (UC-605), una vez por conversación ----
  useEffect(() => {
    let activo = true;
    obtenerMiembros(conversacionId)
      .then((r) => {
        if (activo && "miembros" in r) setMiembros(r.miembros);
      })
      .catch(() => {
        // Sin miembros no hay selector; se puede seguir escribiendo.
      });
    return () => {
      activo = false;
    };
  }, [conversacionId]);

  // ---- Enlaces a tareas y clientes (UC-608): se resuelven en lote y se guardan ----
  useEffect(() => {
    const tareas: string[] = [];
    const clientes: string[] = [];
    for (const m of mensajes) {
      if (m.borrado) continue;
      for (const e of detectaEnlaces(m.texto)) {
        const k = claveEnlace(e.tipo, e.id);
        if (k in enlaces || pidiendoEnlaces.current.has(k)) continue;
        pidiendoEnlaces.current.add(k);
        (e.tipo === "tarea" ? tareas : clientes).push(e.id);
      }
    }
    if (tareas.length === 0 && clientes.length === 0) return;
    const claves = [
      ...tareas.map((id) => claveEnlace("tarea", id)),
      ...clientes.map((id) => claveEnlace("cliente", id)),
    ];
    // Lo que no vuelve (sin permiso, inexistente o error) queda como "no disponible" (AC-24).
    const marcar = (r: { tareas: Record<string, Resuelto>; clientes: Record<string, Resuelto> } | null) =>
      setEnlaces((prev) => {
        const sig = { ...prev };
        for (const id of tareas) sig[claveEnlace("tarea", id)] = r?.tareas[id] ?? null;
        for (const id of clientes) sig[claveEnlace("cliente", id)] = r?.clientes[id] ?? null;
        return sig;
      });
    resolverEnlaces({ tareas, clientes })
      .then((r) => marcar("error" in r ? null : r))
      .catch(() => marcar(null))
      .finally(() => claves.forEach((k) => pidiendoEnlaces.current.delete(k)));
  }, [mensajes, enlaces]);

  const resolverEnlace = useCallback(
    (tipo: TipoEnlace, id: string): EstadoEnlace => {
      const k = claveEnlace(tipo, id);
      return k in enlaces ? enlaces[k] : undefined;
    },
    [enlaces],
  );

  // ---- Tiempo real (UC-603 AC-01) ----
  const alCambio = useCallback(
    (c: CambioMensaje) => {
      if (c.tipo === "borrado") {
        setMensajes((ms) => ms.filter((m) => m.id !== c.id));
        return;
      }
      if (pegadoAbajo.current) ajuste.current = { tipo: "fondo" };
      setMensajes((ms) => mezclaMensajes(ms, c.mensajes));
      if (c.mensajes.some((m) => m.autor_id !== yo.id)) marcarPronto();
    },
    [marcarPronto, yo.id],
  );

  const ultimaFecha = useCallback(() => {
    const confirmados = mensajesRef.current.filter((m) => !m.estado);
    return confirmados.length > 0
      ? confirmados[confirmados.length - 1].created_at
      : "1970-01-01T00:00:00Z";
  }, []);

  useMensajesRealtime(conversacionId, alCambio, ultimaFecha);

  // ---- Paginación hacia atrás (UC-602 AC-03) ----
  /** Carga la página anterior a `antesDe`. Devuelve lo cargado, o null si falla o ya hay otra en curso. */
  async function cargarPagina(antesDe: string): Promise<Mensaje[] | null> {
    if (cargandoRef.current) return null;
    cargandoRef.current = true;
    setCargando(true);
    setErrorAnteriores(null);
    try {
      const r = await cargarAnteriores(conversacionId, antesDe);
      if ("error" in r) {
        setErrorAnteriores(r.error);
        return null;
      }
      const el = scrollRef.current;
      if (el) ajuste.current = { tipo: "restaurar", alto: el.scrollHeight, top: el.scrollTop };
      setMensajes((ms) => mezclaMensajes(r.mensajes, ms));
      setHayMas(r.mensajes.length >= MENSAJES_POR_PAGINA);
      return r.mensajes;
    } catch {
      setErrorAnteriores("Sin conexión. No se pudieron cargar los mensajes anteriores.");
      return null;
    } finally {
      cargandoRef.current = false;
      setCargando(false);
    }
  }

  async function cargarMas() {
    const primero = mensajesRef.current.find((m) => !m.estado);
    if (primero) await cargarPagina(primero.created_at);
  }

  // ---- Salto a un mensaje enlazado (?m=, UC-605 AC-16) ----
  // Si no está en lo cargado, pide páginas anteriores (máx. 10); si no aparece, no hace nada.
  const cargarPaginaRef = useRef(cargarPagina);
  useEffect(() => {
    cargarPaginaRef.current = cargarPagina;
  });

  useEffect(() => {
    if (!mensajeObjetivo) return;
    const objetivo = mensajeObjetivo;
    let cancelado = false;
    let temporizador: ReturnType<typeof setTimeout> | null = null;

    const resaltar = (intentos: number) => {
      if (cancelado) return;
      const el = document.getElementById(`mensaje-${objetivo}`);
      if (!el) {
        // Aún no pintado: se reintenta en el siguiente fotograma (máx. ~10).
        if (intentos > 0) requestAnimationFrame(() => resaltar(intentos - 1));
        return;
      }
      el.scrollIntoView({ block: "center" });
      const cont = scrollRef.current;
      if (cont) pegadoAbajo.current = cont.scrollHeight - cont.scrollTop - cont.clientHeight < UMBRAL_FONDO;
      setResaltadoId(objetivo);
      temporizador = setTimeout(() => setResaltadoId((r) => (r === objetivo ? null : r)), DURACION_RESALTADO);
    };

    (async () => {
      let encontrado = mensajesRef.current.some((m) => m.id === objetivo);
      let antesDe = mensajesRef.current.find((m) => !m.estado)?.created_at ?? null;
      for (let i = 0; !encontrado && antesDe && i < MAX_PAGINAS_OBJETIVO && !cancelado; i++) {
        const pagina = await cargarPaginaRef.current(antesDe);
        if (!pagina || pagina.length === 0) break;
        encontrado = pagina.some((m) => m.id === objetivo);
        if (pagina.length < MENSAJES_POR_PAGINA) break;
        antesDe = pagina[0].created_at;
      }
      if (encontrado && !cancelado) requestAnimationFrame(() => resaltar(10));
    })().catch(() => {
      // Sin red: se deja la conversación donde está.
    });

    return () => {
      cancelado = true;
      if (temporizador) clearTimeout(temporizador);
    };
  }, [mensajeObjetivo]);

  function alHacerScroll() {
    const el = scrollRef.current;
    if (!el) return;
    pegadoAbajo.current = el.scrollHeight - el.scrollTop - el.clientHeight < UMBRAL_FONDO;
    if (el.scrollTop < UMBRAL_TECHO && hayMas && !errorAnteriores) void cargarMas();
  }

  // ---- Envío optimista con reintento (UC-603 AC-03) ----
  async function enviarConId(id: string, texto: string, menciones: string[] = []) {
    ajuste.current = { tipo: "fondo" };
    setMensajes((ms) => {
      const existente = ms.find((m) => m.id === id);
      if (existente) return ms.map((m) => (m.id === id ? { ...m, estado: "enviando" } : m));
      const optimista: MensajeUI = {
        id,
        conversacion_id: conversacionId,
        autor_id: yo.id,
        autor_nombre: yo.nombre,
        texto,
        menciones,
        editado_at: null,
        borrado: false,
        created_at: new Date().toISOString(),
        estado: "enviando",
      };
      return mezclaMensajes(ms, [optimista]);
    });

    let confirmado: Mensaje | null = null;
    try {
      const r = await enviarMensaje({ id, conversacionId, texto, menciones });
      if ("mensaje" in r) confirmado = r.mensaje;
    } catch {
      // Sin conexión: se marca como no enviado.
    }
    if (confirmado) {
      const fila = confirmado;
      setMensajes((ms) => mezclaMensajes(ms, [fila]));
    } else {
      setMensajes((ms) =>
        ms.map((m) => (m.id === id && m.estado === "enviando" ? { ...m, estado: "error" } : m)),
      );
    }
  }

  function autorDe(m: MensajeUI): string {
    if (!m.autor_id) return "Usuario eliminado";
    return m.autor_nombre ?? nombres[m.autor_id] ?? "…";
  }

  const grupos = agrupaPorDia(mensajes);

  return (
    <section
      className="flex min-h-0 min-w-0 flex-1 flex-col bg-surface"
      aria-label={etiqueta ?? `Conversación: ${titulo}`}
    >
      <header className="flex shrink-0 items-center gap-3 border-b border-border px-5 py-3">
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-base font-semibold text-fg">{titulo}</h1>
          {subtitulo && <p className="truncate text-xs text-fg-muted">{subtitulo}</p>}
        </div>
        {enlaceCabecera && (
          <Link
            href={enlaceCabecera.href}
            className="shrink-0 rounded-md border border-border px-3 py-1 text-xs font-medium text-fg transition-colors duration-150 hover:bg-surface-raised"
          >
            {enlaceCabecera.label}
          </Link>
        )}
      </header>

      <div
        ref={scrollRef}
        onScroll={alHacerScroll}
        role="log"
        aria-live="polite"
        aria-label="Mensajes"
        className="min-h-0 flex-1 overflow-y-auto py-3"
      >
        {hayMas && (
          <div className="flex justify-center py-2">
            <button
              type="button"
              onClick={() => void cargarMas()}
              disabled={cargando}
              className="rounded-md px-3 py-1 text-xs font-medium text-accent hover:bg-surface-raised disabled:opacity-60"
            >
              {cargando ? "Cargando…" : "Cargar mensajes anteriores"}
            </button>
          </div>
        )}
        {errorAnteriores && (
          <p role="alert" className="px-5 py-2 text-center text-xs text-error">
            {errorAnteriores}{" "}
            <button type="button" onClick={() => void cargarMas()} className="font-medium underline">
              Reintentar
            </button>
          </p>
        )}

        {mensajes.length === 0 ? (
          <p className="px-5 py-16 text-center text-sm text-fg-muted">
            Aún no hay mensajes. Escribe el primero.
          </p>
        ) : (
          <ol>
            {grupos.map((g) => (
              <li key={g.dia}>
                <div role="separator" className="my-3 flex items-center gap-3 px-5">
                  <span className="h-px flex-1 bg-border" />
                  <span className="text-xs font-medium text-fg-muted" suppressHydrationWarning>
                    {etiquetaDia(g.dia)}
                  </span>
                  <span className="h-px flex-1 bg-border" />
                </div>
                <ul>
                  {g.mensajes.map((m) => (
                    <ChatMensaje
                      key={m.id}
                      mensaje={m}
                      autor={autorDe(m)}
                      onReintentar={(x) => void enviarConId(x.id, x.texto, x.menciones)}
                      nombres={nombres}
                      yoId={yo.id}
                      enlaces={m.borrado ? [] : detectaEnlaces(m.texto)}
                      resolverEnlace={resolverEnlace}
                      resaltado={m.id === resaltadoId}
                    />
                  ))}
                </ul>
              </li>
            ))}
          </ol>
        )}
      </div>

      <ChatComposer
        placeholder={`Escribe en ${titulo}…`}
        miembros={miembros}
        yoId={yo.id}
        onEnviar={(texto, menciones) => void enviarConId(crypto.randomUUID(), texto, menciones)}
      />
    </section>
  );
}
