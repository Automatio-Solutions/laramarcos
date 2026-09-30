"use client";

import { formatoHoraMensaje } from "@/lib/chat/core";
import type { Mensaje } from "@/lib/types";

/** Mensaje tal y como lo maneja la UI: con estado de envío si aún no está confirmado. */
export type MensajeUI = Mensaje & { estado?: "enviando" | "error" };

/** Iniciales para el avatar ("María López" → "ML"). */
function iniciales(nombre: string): string {
  const partes = nombre.trim().split(/\s+/).filter(Boolean);
  if (partes.length === 0) return "?";
  const a = partes[0][0] ?? "";
  const b = partes.length > 1 ? (partes[partes.length - 1][0] ?? "") : "";
  return (a + b).toUpperCase();
}

/** UC-603 AC-02/AC-03: autor, hora y texto (saltos de línea conservados); estados de envío. */
export function ChatMensaje({
  mensaje,
  autor,
  onReintentar,
}: {
  mensaje: MensajeUI;
  autor: string;
  onReintentar?: (m: MensajeUI) => void;
}) {
  const { estado } = mensaje;
  return (
    <li className="chat-entra flex gap-3 px-5 py-1.5 hover:bg-surface-raised/60">
      <span
        aria-hidden
        className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary-subtle text-xs font-semibold text-primary"
      >
        {iniciales(autor)}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2">
          <span className="text-sm font-semibold text-fg">{autor}</span>
          <time dateTime={mensaje.created_at} className="text-xs text-fg-muted" suppressHydrationWarning>
            {formatoHoraMensaje(mensaje.created_at)}
          </time>
        </div>
        <p
          className={`whitespace-pre-wrap break-words text-sm leading-relaxed ${
            estado === "enviando" ? "text-fg-muted" : "text-fg"
          }`}
        >
          {mensaje.texto}
        </p>
        {estado === "enviando" && <span className="text-xs text-fg-muted">Enviando…</span>}
        {estado === "error" && (
          <span role="alert" className="text-xs text-error">
            No enviado ·{" "}
            <button
              type="button"
              onClick={() => onReintentar?.(mensaje)}
              className="font-medium underline hover:no-underline"
              aria-label="Reintentar el envío del mensaje"
            >
              Reintentar
            </button>
          </span>
        )}
      </div>
    </li>
  );
}
