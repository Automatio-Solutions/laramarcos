"use client";

import { useLayoutEffect, useRef, useState } from "react";
import { MAX_LONGITUD_MENSAJE, validaTextoMensaje } from "@/lib/chat/core";

const MAX_LINEAS = 6;

/**
 * Caja de escritura: Enter envía, Shift+Enter hace salto de línea; crece hasta ~6 líneas.
 * Se vacía al enviar: si el envío falla, el texto sigue disponible en el mensaje
 * marcado "No enviado" (botón Reintentar), así que nunca se pierde.
 */
export function ChatComposer({
  onEnviar,
  placeholder,
}: {
  onEnviar: (texto: string) => void;
  placeholder: string;
}) {
  const [texto, setTexto] = useState("");
  const [error, setError] = useState<string | null>(null);
  const ref = useRef<HTMLTextAreaElement>(null);

  // Autocrecimiento hasta MAX_LINEAS; a partir de ahí, scroll interno.
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    const linea = parseFloat(getComputedStyle(el).lineHeight) || 20;
    const max = linea * MAX_LINEAS + 8; // + padding vertical (py-1)
    el.style.height = `${Math.min(el.scrollHeight, max)}px`;
    el.style.overflowY = el.scrollHeight > max ? "auto" : "hidden";
  }, [texto]);

  function enviar() {
    const v = validaTextoMensaje(texto);
    if (!v.ok) {
      if (texto.trim()) setError(v.error);
      return;
    }
    setError(null);
    onEnviar(v.texto);
    setTexto("");
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
      className="shrink-0 border-t border-border bg-surface px-5 py-3"
    >
      <div className="flex items-end gap-2 rounded-lg border border-border bg-surface px-3 py-2 focus-within:border-accent">
        <textarea
          ref={ref}
          value={texto}
          onChange={(e) => {
            setTexto(e.target.value);
            if (error) setError(null);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault();
              enviar();
            }
          }}
          rows={1}
          placeholder={placeholder}
          aria-label="Escribe un mensaje"
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
          <kbd>Enter</kbd> para enviar · <kbd>Shift</kbd>+<kbd>Enter</kbd> nueva línea
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
