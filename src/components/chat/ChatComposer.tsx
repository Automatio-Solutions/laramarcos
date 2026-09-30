"use client";

import { useId, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  MAX_LONGITUD_MENSAJE,
  buscaMencionActiva,
  filtraDirectorio,
  insertaMencion,
  mencionCompletada,
  mencionesVigentes,
  validaTextoMensaje,
} from "@/lib/chat/core";
import { MencionPicker, type Miembro } from "./MencionPicker";

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
 */
export function ChatComposer({
  onEnviar,
  placeholder,
  miembros,
  yoId,
}: {
  onEnviar: (texto: string, menciones: string[]) => void;
  placeholder: string;
  /** Miembros de la conversación (null mientras cargan o si no están disponibles). */
  miembros?: Miembro[] | null;
  yoId?: string;
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

  function enviar() {
    const v = validaTextoMensaje(texto);
    if (!v.ok) {
      if (texto.trim()) setError(v.error);
      return;
    }
    setError(null);
    // Solo cuentan las menciones elegidas cuyo "@Nombre" sigue en el texto.
    onEnviar(v.texto, mencionesVigentes(v.texto, elegidas, yoId ?? null));
    setTexto("");
    setElegidas([]);
    setConsulta(null);
    setCerradaEn(null);
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
        <textarea
          ref={ref}
          value={texto}
          onChange={(e) => {
            setTexto(e.target.value);
            actualizarConsulta(e.target.value, e.target.selectionStart ?? e.target.value.length);
            if (error) setError(null);
          }}
          onSelect={(e) => {
            const el = e.currentTarget;
            actualizarConsulta(el.value, el.selectionStart ?? el.value.length);
          }}
          onBlur={() => setConsulta(null)}
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
          disabled={vacio || largo}
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
          <span role="alert" className="text-error">
            {error ?? `Máximo ${MAX_LONGITUD_MENSAJE} caracteres (${texto.length}).`}
          </span>
        )}
      </div>
    </form>
  );
}
