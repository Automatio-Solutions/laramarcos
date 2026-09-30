"use client";

import { useLayoutEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  MAX_LONGITUD_MENSAJE,
  formatoHoraMensaje,
  refsUnicas,
  trocearTexto,
  type EnlaceDetectado,
} from "@/lib/chat/core";
import type { Mensaje } from "@/lib/types";
import { AdjuntoCard, IconoAdjunto } from "./AdjuntoCard";
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
 * UC-610: tarjeta del adjunto. UC-612: editar en línea (autor) y borrar (autor o staff),
 * marca "(editado)" y "Mensaje eliminado".
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
  puedeEditar = false,
  puedeBorrar = false,
  onGuardarEdicion,
  onBorrar,
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
  puedeEditar?: boolean;
  puedeBorrar?: boolean;
  /** Guarda el texto editado; devuelve el error a mostrar o null si fue bien. */
  onGuardarEdicion?: (id: string, texto: string) => Promise<string | null>;
  /** Pide confirmación y borra el mensaje. */
  onBorrar?: (m: MensajeUI) => void;
}) {
  const { estado } = mensaje;
  const [editando, setEditando] = useState(false);
  const borrado = mensaje.borrado;
  const confirmado = !estado;
  const conAcciones = confirmado && !borrado && !editando && (puedeEditar || puedeBorrar);
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
      className={`chat-entra group relative flex gap-3 px-5 py-1.5 transition-colors duration-1000 ${
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
          {mensaje.editado_at && !borrado && (
            <span
              data-editado
              className="text-xs text-fg-muted"
              title={`Editado: ${formatoHoraMensaje(mensaje.editado_at)}`}
              suppressHydrationWarning
            >
              (editado)
            </span>
          )}
          {meMencionan && <span className="sr-only">Te mencionan</span>}
        </div>
        {borrado ? (
          <p data-borrado className="text-sm italic text-fg-muted">
            Mensaje eliminado
          </p>
        ) : editando ? (
          <EditorMensaje
            inicial={mensaje.texto}
            vacioPermitido={!!mensaje.adjunto_path}
            onCancelar={() => setEditando(false)}
            onGuardar={async (texto) => {
              const error = (await onGuardarEdicion?.(mensaje.id, texto)) ?? null;
              if (!error) setEditando(false);
              return error;
            }}
          />
        ) : (
          mensaje.texto && (
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
          )
        )}
        {!borrado && mensaje.adjunto_path && mensaje.adjunto_nombre && (
          confirmado ? (
            <AdjuntoCard
              mensajeId={mensaje.id}
              nombre={mensaje.adjunto_nombre}
              mime={mensaje.adjunto_mime}
              size={mensaje.adjunto_size}
            />
          ) : (
            <p className="mt-1 flex items-center gap-1.5 text-xs text-fg-muted">
              <IconoAdjunto mime={mensaje.adjunto_mime} className="h-4 w-4" />
              {mensaje.adjunto_nombre}
            </p>
          )
        )}
        {resolverEnlace &&
          !borrado &&
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
      {conAcciones && (
        <div
          role="group"
          aria-label="Acciones del mensaje"
          className="absolute right-4 top-0 flex -translate-y-1/2 gap-0.5 rounded-md border border-border bg-surface p-0.5 opacity-0 shadow-sm transition-opacity duration-100 focus-within:opacity-100 group-hover:opacity-100"
        >
          {puedeEditar && (
            <button
              type="button"
              onClick={() => setEditando(true)}
              aria-label="Editar mensaje"
              title="Editar"
              className="rounded p-1 text-fg-muted hover:bg-surface-raised hover:text-fg"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden className="h-3.5 w-3.5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 20h4L19 9l-4-4L4 16v4zM13.5 6.5l4 4" />
              </svg>
            </button>
          )}
          {puedeBorrar && (
            <button
              type="button"
              onClick={() => onBorrar?.(mensaje)}
              aria-label="Borrar mensaje"
              title="Borrar"
              className="rounded p-1 text-fg-muted hover:bg-error/10 hover:text-error"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden className="h-3.5 w-3.5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 7h16M10 11v6M14 11v6M6 7l1 12a2 2 0 002 2h6a2 2 0 002-2l1-12M9 7V4h6v3" />
              </svg>
            </button>
          )}
        </div>
      )}
    </li>
  );
}

/**
 * UC-612: edición en línea. Enter guarda, Shift+Enter hace salto de línea, Esc cancela.
 */
function EditorMensaje({
  inicial,
  vacioPermitido,
  onGuardar,
  onCancelar,
}: {
  inicial: string;
  vacioPermitido: boolean;
  onGuardar: (texto: string) => Promise<string | null>;
  onCancelar: () => void;
}) {
  const [texto, setTexto] = useState(inicial);
  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);
  const ref = useRef<HTMLTextAreaElement>(null);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 240)}px`;
  }, [texto]);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.focus();
    el.setSelectionRange(el.value.length, el.value.length);
  }, []);

  async function guardar() {
    if (guardando) return;
    const limpio = texto.trim();
    if (!limpio && !vacioPermitido) {
      setError("El mensaje está vacío.");
      return;
    }
    if (limpio === inicial.trim()) {
      onCancelar();
      return;
    }
    setGuardando(true);
    setError(null);
    const e = await onGuardar(texto);
    setGuardando(false);
    if (e) setError(e);
  }

  const largo = texto.length > MAX_LONGITUD_MENSAJE;

  return (
    <div className="mt-1" data-editor-mensaje>
      <textarea
        ref={ref}
        value={texto}
        onChange={(e) => {
          setTexto(e.target.value);
          if (error) setError(null);
        }}
        onKeyDown={(e) => {
          if (e.nativeEvent.isComposing) return;
          if (e.key === "Escape") {
            e.preventDefault();
            e.stopPropagation();
            onCancelar();
            return;
          }
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            if (!largo) void guardar();
          }
        }}
        rows={1}
        aria-label="Editar el texto del mensaje"
        disabled={guardando}
        className="w-full resize-none rounded-md border border-accent bg-surface px-2 py-1 text-sm leading-5 text-fg outline-none"
      />
      <div className="mt-1 flex items-center gap-2 text-[11px] text-fg-muted">
        <span>
          <kbd>Enter</kbd> guardar · <kbd>Esc</kbd> cancelar
        </span>
        <button
          type="button"
          onClick={() => void guardar()}
          disabled={guardando || largo}
          className="rounded px-1.5 py-0.5 font-medium text-accent hover:bg-surface-raised disabled:opacity-50"
        >
          {guardando ? "Guardando…" : "Guardar"}
        </button>
        <button
          type="button"
          onClick={onCancelar}
          disabled={guardando}
          className="rounded px-1.5 py-0.5 font-medium hover:bg-surface-raised disabled:opacity-50"
        >
          Cancelar
        </button>
        {(error || largo) && (
          <span role="alert" className="text-error">
            {error ?? `Máximo ${MAX_LONGITUD_MENSAJE} caracteres (${texto.length}).`}
          </span>
        )}
      </div>
    </div>
  );
}
