"use client";

import Link from "next/link";
import { formatoHoraMensaje, refsUnicas, trocearTexto, type EnlaceDetectado } from "@/lib/chat/core";
import type { Mensaje } from "@/lib/types";
import { EnlaceCard, type EstadoEnlace } from "./EnlaceCard";

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

/**
 * UC-603 AC-02/AC-03: autor, hora y texto (saltos de línea conservados); estados de envío.
 * UC-605 AC-17: menciones resaltadas (con más fuerza la propia).
 * UC-608: enlaces internos como enlace en el texto y tarjeta bajo el mensaje.
 */
export function ChatMensaje({
  mensaje,
  autor,
  onReintentar,
  nombres = {},
  yoId,
  enlaces,
  resolverEnlace,
  resaltado = false,
}: {
  mensaje: MensajeUI;
  autor: string;
  onReintentar?: (m: MensajeUI) => void;
  /** Nombres por id, para localizar las menciones en el texto. */
  nombres?: Record<string, string>;
  yoId?: string;
  /** Enlaces detectados en el texto (se calculan fuera para no repetir el trabajo). */
  enlaces?: EnlaceDetectado[];
  resolverEnlace?: (tipo: EnlaceDetectado["tipo"], id: string) => EstadoEnlace;
  /** Mensaje destino de un enlace ?m=: se resalta un momento. */
  resaltado?: boolean;
}) {
  const { estado } = mensaje;
  const mencionados = (mensaje.menciones ?? [])
    .map((id) => ({ id, nombre: nombres[id] ?? "" }))
    .filter((m) => m.nombre);
  const trozos = trocearTexto(mensaje.texto, mencionados, enlaces);
  const meMencionan = !!yoId && (mensaje.menciones ?? []).includes(yoId);
  const tarjetas = enlaces ? refsUnicas(enlaces) : [];

  return (
    <li
      id={`mensaje-${mensaje.id}`}
      data-mensaje-id={mensaje.id}
      aria-current={resaltado ? "true" : undefined}
      className={`chat-entra flex gap-3 px-5 py-1.5 transition-colors duration-1000 ${
        resaltado ? "bg-accent/10" : "hover:bg-surface-raised/60"
      }`}
    >
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
          {meMencionan && <span className="sr-only">Te mencionan</span>}
        </div>
        <p
          className={`whitespace-pre-wrap break-words text-sm leading-relaxed ${
            estado === "enviando" ? "text-fg-muted" : "text-fg"
          }`}
        >
          {trozos.map((t, i) => {
            if (t.tipo === "mencion") {
              const propia = t.id === yoId;
              return (
                <span
                  key={i}
                  data-mencion={propia ? "propia" : "otra"}
                  title={propia ? "Te mencionan" : undefined}
                  className={
                    propia
                      ? "rounded bg-accent/15 px-0.5 font-semibold text-accent"
                      : "font-medium text-accent"
                  }
                >
                  {t.texto}
                </span>
              );
            }
            if (t.tipo === "enlace") {
              return (
                <Link key={i} href={t.enlace.ruta} className="text-accent underline hover:no-underline">
                  {t.texto}
                </Link>
              );
            }
            return <span key={i}>{t.texto}</span>;
          })}
        </p>
        {resolverEnlace &&
          tarjetas.map((e) => (
            <EnlaceCard
              key={`${e.tipo}:${e.id}`}
              tipo={e.tipo}
              ruta={e.ruta}
              resultado={resolverEnlace(e.tipo, e.id)}
            />
          ))}
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
