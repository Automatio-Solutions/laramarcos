"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { abrirDirecto } from "@/app/(panel)/chat/actions";
import { filtraDirectorio } from "@/lib/chat/core";
import { ROL_LABEL, type CompaneroDirectorio } from "@/lib/types";
import { PuntoConectado } from "./PuntoConectado";

/**
 * UC-601: directorio de compañeros activos (todos, también para asesores) con buscador
 * insensible a mayúsculas y tildes. "Enviar mensaje" abre o reutiliza el directo.
 */
export function ChatDirectorio({
  directorio,
  yoId,
  onCerrar,
  conectados,
}: {
  directorio: CompaneroDirectorio[];
  yoId: string;
  onCerrar: () => void;
  /** Ids de los compañeros con la plataforma abierta (UC-613). */
  conectados?: ReadonlySet<string>;
}) {
  const [q, setQ] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [abriendo, setAbriendo] = useState<string | null>(null);
  const [pendiente, startTransition] = useTransition();
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCerrar();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onCerrar]);

  const companeros = filtraDirectorio(
    directorio.filter((c) => c.id !== yoId),
    q,
  );

  function abrir(c: CompaneroDirectorio) {
    setError(null);
    setAbriendo(c.id);
    startTransition(async () => {
      // Si va bien, la acción redirige a /chat/{id} y no vuelve.
      const r = await abrirDirecto(c.id);
      if (r?.error) setError(r.error);
      setAbriendo(null);
    });
  }

  return (
    <div
      onClick={onCerrar}
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 p-4 sm:p-8"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="chat-directorio-titulo"
        onClick={(e) => e.stopPropagation()}
        className="relative mt-8 flex max-h-[80vh] w-full max-w-lg flex-col rounded-lg border border-border bg-surface shadow-xl"
      >
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <h2 id="chat-directorio-titulo" className="text-base font-semibold text-fg">
            Nuevo mensaje
          </h2>
          <button
            type="button"
            onClick={onCerrar}
            aria-label="Cerrar"
            className="rounded-md p-1.5 text-fg-muted hover:bg-surface-raised hover:text-fg"
          >
            ✕
          </button>
        </div>
        <div className="border-b border-border px-5 py-3">
          <input
            ref={inputRef}
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Buscar compañero por nombre…"
            aria-label="Buscar compañero por nombre"
            className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-fg outline-none focus:border-accent"
          />
          {error && (
            <p role="alert" className="mt-2 text-xs text-error">
              {error}
            </p>
          )}
        </div>
        <ul className="min-h-0 flex-1 divide-y divide-border overflow-y-auto">
          {companeros.length === 0 && (
            <li className="px-5 py-10 text-center text-sm text-fg-muted">
              {q.trim() ? `Ningún compañero coincide con «${q.trim()}».` : "No hay compañeros activos."}
            </li>
          )}
          {companeros.map((c) => (
            <li key={c.id} className="flex items-center gap-3 px-5 py-2.5">
              <div className="min-w-0 flex-1">
                <p className="flex items-center gap-1.5 text-sm font-medium text-fg">
                  <span className="truncate">{c.nombre}</span>
                  {conectados?.has(c.id) && <PuntoConectado />}
                </p>
                <p className="truncate text-xs text-fg-muted">
                  {[c.oficina ?? "Sin oficina", ROL_LABEL[c.rol] ?? c.rol].join(" · ")}
                </p>
              </div>
              <button
                type="button"
                onClick={() => abrir(c)}
                disabled={pendiente}
                aria-label={`Enviar mensaje a ${c.nombre}`}
                className="shrink-0 rounded-md border border-border px-3 py-1.5 text-xs font-medium text-fg hover:bg-surface-raised disabled:opacity-60"
              >
                {abriendo === c.id ? "Abriendo…" : "Enviar mensaje"}
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
