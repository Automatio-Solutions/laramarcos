"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { cargarAnteriores, enviarMensaje, marcarLeida, resolverNombres } from "@/app/(panel)/chat/actions";
import { MENSAJES_POR_PAGINA, agrupaPorDia, etiquetaDia, mezclaMensajes } from "@/lib/chat/core";
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

/** Distancia (px) al fondo por debajo de la cual se considera que el usuario "está abajo". */
const UMBRAL_FONDO = 120;
/** Distancia (px) al techo a partir de la cual se cargan mensajes anteriores. */
const UMBRAL_TECHO = 80;

type Ajuste = { tipo: "fondo" } | { tipo: "restaurar"; alto: number; top: number } | null;

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
}: {
  conversacionId: string;
  titulo: string;
  subtitulo?: string;
  mensajesIniciales: Mensaje[];
  yo: { id: string; nombre: string };
  nombresIniciales: Record<string, string>;
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
          .map((m) => m.autor_id)
          .filter((id): id is string => !!id && !nombres[id] && !pidiendoNombres.current.has(id)),
      ),
    ];
    if (faltan.length === 0) return;
    faltan.forEach((id) => pidiendoNombres.current.add(id));
    resolverNombres(faltan)
      .then((r) => setNombres((n) => ({ ...n, ...r })))
      .catch(() => faltan.forEach((id) => pidiendoNombres.current.delete(id)));
  }, [mensajes, nombres]);

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
  async function cargarMas() {
    if (cargandoRef.current) return;
    const primero = mensajesRef.current.find((m) => !m.estado);
    if (!primero) return;
    cargandoRef.current = true;
    setCargando(true);
    setErrorAnteriores(null);
    try {
      const r = await cargarAnteriores(conversacionId, primero.created_at);
      if ("error" in r) {
        setErrorAnteriores(r.error);
      } else {
        const el = scrollRef.current;
        if (el) ajuste.current = { tipo: "restaurar", alto: el.scrollHeight, top: el.scrollTop };
        setMensajes((ms) => mezclaMensajes(r.mensajes, ms));
        setHayMas(r.mensajes.length >= MENSAJES_POR_PAGINA);
      }
    } catch {
      setErrorAnteriores("Sin conexión. No se pudieron cargar los mensajes anteriores.");
    } finally {
      cargandoRef.current = false;
      setCargando(false);
    }
  }

  function alHacerScroll() {
    const el = scrollRef.current;
    if (!el) return;
    pegadoAbajo.current = el.scrollHeight - el.scrollTop - el.clientHeight < UMBRAL_FONDO;
    if (el.scrollTop < UMBRAL_TECHO && hayMas && !errorAnteriores) void cargarMas();
  }

  // ---- Envío optimista con reintento (UC-603 AC-03) ----
  async function enviarConId(id: string, texto: string) {
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
        menciones: [],
        editado_at: null,
        borrado: false,
        created_at: new Date().toISOString(),
        estado: "enviando",
      };
      return mezclaMensajes(ms, [optimista]);
    });

    let confirmado: Mensaje | null = null;
    try {
      const r = await enviarMensaje({ id, conversacionId, texto });
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
    <section className="flex min-h-0 min-w-0 flex-1 flex-col bg-surface" aria-label={`Conversación: ${titulo}`}>
      <header className="shrink-0 border-b border-border px-5 py-3">
        <h1 className="truncate text-base font-semibold text-fg">{titulo}</h1>
        {subtitulo && <p className="truncate text-xs text-fg-muted">{subtitulo}</p>}
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
                      onReintentar={(x) => void enviarConId(x.id, x.texto)}
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
        onEnviar={(texto) => void enviarConId(crypto.randomUUID(), texto)}
      />
    </section>
  );
}
