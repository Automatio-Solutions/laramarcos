"use client";

import { useCallback, useState } from "react";
import Link from "next/link";
import { listarConversaciones } from "@/app/(panel)/chat/actions";
import { useAvisoMensajes } from "@/lib/chat/realtime";
import type { CompaneroDirectorio, ConversacionListada } from "@/lib/types";
import { ChatDirectorio } from "./ChatDirectorio";

type Filtro = "todas" | "directos" | "canales";

const FILTROS: { id: Filtro; label: string }[] = [
  { id: "todas", label: "Todas" },
  { id: "directos", label: "Directos" },
  { id: "canales", label: "Canales" },
];

const esCanal = (c: ConversacionListada) => c.tipo === "general" || c.tipo === "oficina";

function icono(c: ConversacionListada): string {
  if (c.tipo === "directo") return "@";
  if (c.tipo === "cliente") return "▣";
  return "#";
}

/**
 * UC-602/UC-604: bandeja de conversaciones. General primero, luego canales de oficina
 * y el resto por actividad (el orden lo da el repositorio). Las que tienen mensajes sin
 * leer van en negrita con su contador; se refresca en tiempo real.
 */
export function ChatLista({
  conversaciones: iniciales,
  activaId,
  directorio,
  yoId,
}: {
  conversaciones: ConversacionListada[];
  activaId: string | null;
  directorio: CompaneroDirectorio[];
  yoId: string;
}) {
  const [conversaciones, setConversaciones] = useState(iniciales);
  const [filtro, setFiltro] = useState<Filtro>("todas");
  const [directorioAbierto, setDirectorioAbierto] = useState(false);

  // Mensaje nuevo en cualquier conversación visible o cambio de leídos → recarga la bandeja
  // (trae contadores, orden por actividad y directos que otro haya abierto conmigo).
  useAvisoMensajes(() => {
    listarConversaciones()
      .then((r) => {
        if (r) setConversaciones(r);
      })
      .catch(() => {});
  });

  const cerrarDirectorio = useCallback(() => setDirectorioAbierto(false), []);

  const visibles = conversaciones.filter((c) =>
    filtro === "todas" ? true : filtro === "canales" ? esCanal(c) : c.tipo === "directo",
  );

  return (
    <aside className="flex w-80 shrink-0 flex-col border-r border-border bg-surface" aria-label="Conversaciones">
      <div className="shrink-0 space-y-3 border-b border-border px-4 py-3">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold text-fg">Chat</h2>
          <button
            type="button"
            onClick={() => setDirectorioAbierto(true)}
            aria-label="Nuevo mensaje: elegir compañero"
            className="rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-white transition-colors duration-150 hover:bg-primary-hover"
          >
            Nuevo mensaje
          </button>
        </div>
        <div role="group" aria-label="Filtrar conversaciones" className="flex rounded-md bg-surface-raised p-0.5">
          {FILTROS.map((f) => (
            <button
              key={f.id}
              type="button"
              onClick={() => setFiltro(f.id)}
              aria-pressed={filtro === f.id}
              className={`flex-1 rounded px-2 py-1 text-xs font-medium transition-colors duration-150 ${
                filtro === f.id ? "bg-surface text-fg shadow-sm" : "text-fg-muted hover:text-fg"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      <nav aria-label="Lista de conversaciones" className="min-h-0 flex-1 overflow-y-auto py-2">
        <ul className="space-y-0.5 px-2">
          {visibles.length === 0 && (
            <li className="px-3 py-8 text-center text-sm text-fg-muted">
              {filtro === "directos"
                ? "Aún no tienes conversaciones directas. Pulsa «Nuevo mensaje»."
                : "No hay conversaciones."}
            </li>
          )}
          {visibles.map((c) => {
            const activa = c.id === activaId;
            // La conversación abierta se está leyendo: no mostramos su contador.
            const n = activa ? 0 : c.no_leidos;
            return (
              <li key={c.id}>
                <Link
                  href={`/chat/${c.id}`}
                  aria-current={activa ? "page" : undefined}
                  aria-label={n > 0 ? `${c.titulo}, ${n} sin leer` : c.titulo}
                  className={`flex items-center gap-2 rounded-md px-3 py-1.5 text-sm transition-colors duration-150 ${
                    activa ? "bg-primary-subtle text-fg" : "text-fg hover:bg-surface-raised"
                  }`}
                >
                  <span aria-hidden className="w-4 shrink-0 text-center text-fg-muted">
                    {icono(c)}
                  </span>
                  <span className={`min-w-0 flex-1 truncate ${n > 0 ? "font-bold" : activa ? "font-medium" : ""}`}>
                    {c.titulo}
                  </span>
                  {n > 0 && (
                    <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-accent px-1.5 text-[11px] font-bold text-white">
                      {n > 99 ? "99+" : n}
                    </span>
                  )}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      {directorioAbierto && (
        <ChatDirectorio directorio={directorio} yoId={yoId} onCerrar={cerrarDirectorio} />
      )}
    </aside>
  );
}
