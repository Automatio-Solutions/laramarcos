"use client";

import { useCallback, useState } from "react";
import Link from "next/link";
import { listarConversaciones } from "@/app/(panel)/chat/actions";
import { useAvisoMensajes } from "@/lib/chat/realtime";
import type { CompaneroDirectorio, ConversacionListada } from "@/lib/types";
import { ChatDirectorio } from "./ChatDirectorio";

type Filtro = "todas" | "directos" | "canales" | "clientes";
type Seccion = "canales" | "directos" | "clientes";

const FILTROS: { id: Filtro; label: string }[] = [
  { id: "todas", label: "Todas" },
  { id: "directos", label: "Directos" },
  { id: "canales", label: "Canales" },
  { id: "clientes", label: "Clientes" },
];

const SECCIONES: { id: Seccion; label: string }[] = [
  { id: "canales", label: "Canales" },
  { id: "directos", label: "Directos" },
  { id: "clientes", label: "Clientes" },
];

function seccionDe(c: ConversacionListada): Seccion {
  if (c.tipo === "directo") return "directos";
  if (c.tipo === "cliente") return "clientes";
  return "canales";
}

const VACIO: Record<Filtro, string> = {
  todas: "No hay conversaciones.",
  directos: "Aún no tienes conversaciones directas. Pulsa «Nuevo mensaje».",
  canales: "No hay canales.",
  clientes: "Aún no hay conversaciones de clientes. Se abren desde la ficha de cada cliente.",
};

function Icono({ c }: { c: ConversacionListada }) {
  if (c.tipo === "cliente") {
    // Edificio: hilo interno de un cliente (UC-606).
    return (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="mx-auto h-3.5 w-3.5">
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M4 21V5a2 2 0 012-2h8a2 2 0 012 2v16M16 9h2a2 2 0 012 2v10M8 7h4M8 11h4M8 15h4M3 21h18"
        />
      </svg>
    );
  }
  return <>{c.tipo === "directo" ? "@" : "#"}</>;
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

  // UC-606 AC-20: los hilos de cliente solo aparecen cuando tienen mensajes (o están abiertos).
  const visibles = conversaciones.filter(
    (c) =>
      (c.tipo !== "cliente" || !!c.ultimo_mensaje_at || c.id === activaId) &&
      (filtro === "todas" || seccionDe(c) === filtro),
  );
  // UC-609: con "Todas", agrupadas por secciones (el orden dentro lo da el repositorio:
  // General, canales de oficina y luego lo más reciente).
  const grupos =
    filtro === "todas"
      ? SECCIONES.map((s) => ({ ...s, items: visibles.filter((c) => seccionDe(c) === s.id) })).filter(
          (g) => g.items.length > 0,
        )
      : [{ id: filtro, label: null, items: visibles }];

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
        {visibles.length === 0 && (
          <p className="px-5 py-8 text-center text-sm text-fg-muted">{VACIO[filtro]}</p>
        )}
        {grupos.map((g) => (
          <div key={g.id} className="mb-2">
            {g.label && (
              <h3 id={`chat-seccion-${g.id}`} className="px-5 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wide text-fg-muted">
                {g.label}
              </h3>
            )}
            <ul className="space-y-0.5 px-2" aria-labelledby={g.label ? `chat-seccion-${g.id}` : undefined}>
              {g.items.map((c) => {
                const activa = c.id === activaId;
                // La conversación abierta se está leyendo: no mostramos su contador.
                const n = activa ? 0 : c.no_leidos;
                return (
                  <li key={c.id}>
                    <Link
                      href={`/chat/${c.id}`}
                      aria-current={activa ? "page" : undefined}
                      aria-label={n > 0 ? `${c.titulo}, ${n} sin leer` : c.titulo}
                      data-tipo={c.tipo}
                      className={`flex items-center gap-2 rounded-md px-3 py-1.5 text-sm transition-colors duration-150 ${
                        activa ? "bg-primary-subtle text-fg" : "text-fg hover:bg-surface-raised"
                      }`}
                    >
                      <span aria-hidden className="w-4 shrink-0 text-center text-fg-muted">
                        <Icono c={c} />
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
          </div>
        ))}
      </nav>

      {directorioAbierto && (
        <ChatDirectorio directorio={directorio} yoId={yoId} onCerrar={cerrarDirectorio} />
      )}
    </aside>
  );
}
