"use client";

import { useId, useLayoutEffect, useMemo, useRef, useState } from "react";
import { descartarAdjunto, prepararAdjunto } from "@/app/(panel)/chat/actions";
import { createClient } from "@/lib/supabase/client";
import {
  ACCEPT_ADJUNTO,
  ERROR_SUBIDA_ADJUNTO,
  MAX_LONGITUD_MENSAJE,
  buscaMencionActiva,
  filtraDirectorio,
  formatoTamano,
  insertaMencion,
  mencionCompletada,
  mencionesVigentes,
  nombreConExtension,
  validaAdjunto,
  validaTextoMensaje,
  type AdjuntoMensaje,
} from "@/lib/chat/core";
import { IconoAdjunto } from "./AdjuntoCard";
import { MencionPicker, type Miembro } from "./MencionPicker";

type AdjuntoEnCurso = {
  clave: string;
  nombre: string;
  size: number;
  mime: string;
  estado: "subiendo" | "listo";
  path?: string;
};

const MAX_LINEAS = 6;
/** Opciones que muestra el selector de menciones. */
const MAX_OPCIONES = 8;

type Consulta = { inicio: number; consulta: string; cursor: number };

/**
 * Caja de escritura: Enter envía, Shift+Enter hace salto de línea; crece hasta ~6 líneas.
 * Se vacía al enviar: si el envío falla, el texto sigue disponible en el mensaje
 * marcado "No enviado" (botón Reintentar), así que nunca se pierde.
 *
 * UC-605: al escribir "@" y parte de un nombre se abre el selector de compañeros de la
 * conversación (flechas para moverse, Enter o Tab para elegir, Esc para cerrar). Mientras
 * está abierto, Enter elige en lugar de enviar. Una mención ya elegida no reabre el
 * selector: solo se abre de nuevo al escribir otra "@".
 *
 * UC-610: con `conversacionId`, el clip adjunta un fichero (PDF, imagen, Excel o Word, hasta
 * 20 MB). Se valida aquí y en el servidor, se sube directo a Storage con un enlace firmado y
 * se envía con el mensaje (el texto puede ir vacío). Si la subida falla no se envía nada.
 *
 * UC-613: avisa de que se está escribiendo (`onEscribiendo`) y de que se deja (`onDejo`: al
 * enviar, al vaciar la caja o al salir de ella).
 */
export function ChatComposer({
  onEnviar,
  placeholder,
  miembros,
  yoId,
  conversacionId,
  onEscribiendo,
  onDejo,
}: {
  onEnviar: (texto: string, menciones: string[], adjunto: AdjuntoMensaje | null) => void;
  placeholder: string;
  /** Miembros de la conversación (null mientras cargan o si no están disponibles). */
  miembros?: Miembro[] | null;
  yoId?: string;
  /** Conversación donde se suben los adjuntos (sin ella no se puede adjuntar). */
  conversacionId?: string;
  onEscribiendo?: () => void;
  onDejo?: () => void;
}) {
  const [texto, setTexto] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [consulta, setConsulta] = useState<Consulta | null>(null);
  const [indice, setIndice] = useState(0);
  /** Posición de la "@" cuyo selector se cerró con Esc (no se reabre hasta cambiar de @). */
  const [cerradaEn, setCerradaEn] = useState<number | null>(null);
  const [elegidas, setElegidas] = useState<Miembro[]>([]);
  const ref = useRef<HTMLTextAreaElement>(null);
  const cursorPendiente = useRef<number | null>(null);
  const listaId = useId();
  const [adjunto, setAdjunto] = useState<AdjuntoEnCurso | null>(null);
  const subidaActual = useRef<string | null>(null);
  const ficheroRef = useRef<HTMLInputElement>(null);

  // Autocrecimiento hasta MAX_LINEAS; a partir de ahí, scroll interno.
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    const linea = parseFloat(getComputedStyle(el).lineHeight) || 20;
    const max = linea * MAX_LINEAS + 8; // + padding vertical (py-1)
    el.style.height = `${Math.min(el.scrollHeight, max)}px`;
    el.style.overflowY = el.scrollHeight > max ? "auto" : "hidden";
    // Tras insertar una mención, el cursor va detrás de "@Nombre ".
    if (cursorPendiente.current !== null) {
      el.setSelectionRange(cursorPendiente.current, cursorPendiente.current);
      cursorPendiente.current = null;
    }
  }, [texto]);

  const opciones = useMemo(() => {
    if (!consulta || !miembros || consulta.inicio === cerradaEn) return [];
    // Una mención ya elegida ("@Nombre ") no reabre el selector (p. ej. al recolocar el
    // cursor tras insertarla): así Enter al final de "gracias @Bruno Pérez " envía.
    if (mencionCompletada(consulta.consulta, elegidas)) return [];
    const otros = miembros.filter((m) => m.id !== yoId);
    return filtraDirectorio(otros, consulta.consulta).slice(0, MAX_OPCIONES);
  }, [consulta, miembros, yoId, cerradaEn, elegidas]);
  const abierto = opciones.length > 0;
  const activo = Math.min(indice, Math.max(0, opciones.length - 1));

  /** Recalcula la mención en curso a partir del texto y la posición del cursor. */
  function actualizarConsulta(valor: string, cursor: number) {
    const c = buscaMencionActiva(valor, cursor);
    setConsulta((prev) => {
      if (!c) return null;
      if (prev && prev.inicio === c.inicio && prev.consulta === c.consulta) return prev;
      return { ...c, cursor };
    });
    if (!c || c.inicio !== consulta?.inicio || c.consulta !== consulta?.consulta) setIndice(0);
    if (!c || c.inicio !== cerradaEn) setCerradaEn(null);
  }

  function elegir(m: Miembro) {
    if (!consulta) return;
    const r = insertaMencion(texto, consulta.inicio, consulta.cursor, m.nombre);
    cursorPendiente.current = r.cursor;
    setTexto(r.texto);
    setElegidas((xs) => (xs.some((x) => x.id === m.id) ? xs : [...xs, m]));
    setConsulta(null);
    setIndice(0);
    ref.current?.focus();
  }

  // ---- Adjuntos (UC-610) ----
  async function subir(file: File) {
    if (!conversacionId) return;
    setError(null);
    const v = validaAdjunto(file.name, file.type, file.size);
    if (!v.ok) {
      setError(v.error);
      return;
    }
    // Uno por mensaje: el anterior (si ya estaba subido) se descarta.
    if (adjunto?.path) void descartarAdjunto(conversacionId, adjunto.path);
    const clave = crypto.randomUUID();
    subidaActual.current = clave;
    // Sin extensión (aceptado por el tipo del navegador): se le añade la de su tipo.
    const nombre = nombreConExtension(file.name, v.mime);
    setAdjunto({ clave, nombre, size: file.size, mime: v.mime, estado: "subiendo" });
    let mensajeError = ERROR_SUBIDA_ADJUNTO;
    try {
      const prep = await prepararAdjunto(conversacionId, nombre, file.type || v.mime, file.size);
      if ("error" in prep) {
        mensajeError = prep.error;
        throw new Error(prep.error);
      }
      const { error: e } = await createClient()
        .storage.from("chat")
        // Con un Blob, storage-js sube en multipart y Storage guarda el tipo de la PARTE (el
        // del navegador), no `contentType`: se re-etiqueta con el tipo de la extensión, que es
        // el que el servidor exige al enviar (metadatos reales del objeto).
        .uploadToSignedUrl(prep.path, prep.token, file.slice(0, file.size, prep.mime), {
          contentType: prep.mime,
        });
      if (e) throw e;
      if (subidaActual.current !== clave) {
        // Se quitó (o se cambió) mientras subía: no se usa.
        void descartarAdjunto(conversacionId, prep.path);
        return;
      }
      setAdjunto((a) => (a && a.clave === clave ? { ...a, estado: "listo", path: prep.path } : a));
    } catch {
      if (subidaActual.current !== clave) return;
      subidaActual.current = null;
      setAdjunto(null);
      setError(mensajeError);
    }
  }

  function quitarAdjunto() {
    if (adjunto?.path && conversacionId) void descartarAdjunto(conversacionId, adjunto.path);
    subidaActual.current = null;
    setAdjunto(null);
    ref.current?.focus();
  }

  const subiendo = adjunto?.estado === "subiendo";
  const listo = adjunto?.estado === "listo" && adjunto.path ? adjunto : null;

  function enviar() {
    if (subiendo) return;
    const v = validaTextoMensaje(texto, !!listo);
    if (!v.ok) {
      if (texto.trim()) setError(v.error);
      return;
    }
    setError(null);
    // Solo cuentan las menciones elegidas cuyo "@Nombre" sigue en el texto.
    onEnviar(
      v.texto,
      mencionesVigentes(v.texto, elegidas, yoId ?? null),
      listo ? { path: listo.path!, nombre: listo.nombre, mime: listo.mime, size: listo.size } : null,
    );
    onDejo?.();
    setTexto("");
    setElegidas([]);
    setConsulta(null);
    setCerradaEn(null);
    subidaActual.current = null;
    setAdjunto(null);
    ref.current?.focus();
  }

  const vacio = texto.trim().length === 0;
  const largo = texto.length > MAX_LONGITUD_MENSAJE;

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        enviar();
      }}
      className="relative shrink-0 border-t border-border bg-surface px-5 py-3"
    >
      {adjunto && (
        <div
          data-adjunto-chip={adjunto.estado}
          role="status"
          aria-label={`Adjunto: ${adjunto.nombre}${subiendo ? ", subiendo" : ""}`}
          className="mb-2 flex max-w-sm items-center gap-2 rounded-lg border border-border bg-surface-raised px-2.5 py-1.5"
        >
          <IconoAdjunto mime={adjunto.mime} className="h-6 w-6" />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-xs font-medium text-fg" title={adjunto.nombre}>
              {adjunto.nombre}
            </span>
            <span className="block text-[11px] text-fg-muted">
              {formatoTamano(adjunto.size)}
              {subiendo && " · Subiendo…"}
            </span>
            {subiendo && (
              <span aria-hidden className="mt-1 block h-1 overflow-hidden rounded-full bg-border">
                <span className="block h-full w-1/2 animate-pulse rounded-full bg-accent" />
              </span>
            )}
          </span>
          <button
            type="button"
            onClick={quitarAdjunto}
            aria-label="Quitar adjunto"
            className="rounded p-1 text-fg-muted hover:bg-surface hover:text-fg"
          >
            ×
          </button>
        </div>
      )}
      {abierto && (
        <MencionPicker
          id={listaId}
          opciones={opciones}
          indice={activo}
          onElegir={elegir}
          onIndice={setIndice}
        />
      )}
      <div className="flex items-end gap-2 rounded-lg border border-border bg-surface px-3 py-2 focus-within:border-accent">
        {conversacionId && (
          <>
            <button
              type="button"
              onClick={() => ficheroRef.current?.click()}
              disabled={subiendo}
              aria-label="Adjuntar archivo"
              title="Adjuntar archivo (PDF, imagen, Excel o Word, máx. 20 MB)"
              className="rounded-md p-1.5 text-fg-muted transition-colors duration-150 hover:bg-surface-raised hover:text-fg disabled:opacity-40"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden className="h-4 w-4">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M21 11.5l-8.6 8.6a5 5 0 01-7.1-7.1l8.6-8.6a3.3 3.3 0 014.7 4.7l-8.6 8.6a1.7 1.7 0 01-2.4-2.4l7.9-7.9"
                />
              </svg>
            </button>
            <input
              ref={ficheroRef}
              type="file"
              hidden
              accept={ACCEPT_ADJUNTO}
              aria-label="Seleccionar archivo para adjuntar"
              data-testid="chat-adjunto-input"
              onChange={(e) => {
                const f = e.target.files?.[0];
                // Se vacía para poder volver a elegir el mismo fichero.
                e.target.value = "";
                if (f) void subir(f);
              }}
            />
          </>
        )}
        <textarea
          ref={ref}
          value={texto}
          onChange={(e) => {
            setTexto(e.target.value);
            actualizarConsulta(e.target.value, e.target.selectionStart ?? e.target.value.length);
            if (error) setError(null);
            if (e.target.value.trim()) onEscribiendo?.();
            else onDejo?.();
          }}
          onSelect={(e) => {
            const el = e.currentTarget;
            actualizarConsulta(el.value, el.selectionStart ?? el.value.length);
          }}
          onBlur={() => {
            setConsulta(null);
            onDejo?.();
          }}
          onKeyDown={(e) => {
            if (e.nativeEvent.isComposing) return;
            if (abierto) {
              if (e.key === "ArrowDown") {
                e.preventDefault();
                setIndice((activo + 1) % opciones.length);
                return;
              }
              if (e.key === "ArrowUp") {
                e.preventDefault();
                setIndice((activo - 1 + opciones.length) % opciones.length);
                return;
              }
              if (e.key === "Enter" || e.key === "Tab") {
                e.preventDefault();
                elegir(opciones[activo]);
                return;
              }
              if (e.key === "Escape") {
                e.preventDefault();
                setCerradaEn(consulta?.inicio ?? null);
                return;
              }
            }
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              enviar();
            }
          }}
          rows={1}
          placeholder={placeholder}
          aria-label="Escribe un mensaje"
          aria-autocomplete="list"
          aria-controls={abierto ? listaId : undefined}
          aria-activedescendant={abierto ? `${listaId}-${activo}` : undefined}
          className="max-h-40 flex-1 resize-none bg-transparent py-1 text-sm leading-5 text-fg outline-none placeholder:text-fg-muted"
        />
        <button
          type="submit"
          disabled={(vacio && !listo) || largo || subiendo}
          aria-label="Enviar mensaje"
          className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-white transition-colors duration-150 hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-40"
        >
          Enviar
        </button>
      </div>
      <div className="mt-1 flex justify-between text-[11px] text-fg-muted">
        <span>
          <kbd>Enter</kbd> para enviar · <kbd>Shift</kbd>+<kbd>Enter</kbd> nueva línea · <kbd>@</kbd> para
          mencionar
        </span>
        {(error || largo) && (
          <span role="alert" data-error-composer className="text-error">
            {error ?? `Máximo ${MAX_LONGITUD_MENSAJE} caracteres (${texto.length}).`}
          </span>
        )}
      </div>
    </form>
  );
}
