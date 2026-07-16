"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ESTADOS_TABLERO } from "@/lib/estados";
import { ConfirmModal } from "@/components/ConfirmModal";
import { updateEstadoTareaAction, archivarTareaAction, archivarCompletadasAction, eliminarTareaAction } from "@/app/(panel)/tareas/actions";
import type { TareaConRelaciones, EstadoTarea } from "@/lib/types";

type Pendiente =
  | { tipo: "archivar"; id: string; titulo: string }
  | { tipo: "eliminar"; id: string; titulo: string }
  | { tipo: "archivarTodas"; n: number }
  | { tipo: "completar"; id: string; titulo: string; n: number };

export function KanbanBoard({ tareas: initial }: { tareas: TareaConRelaciones[] }) {
  const router = useRouter();
  const [tareas, setTareas] = useState(initial);
  const [dragId, setDragId] = useState<string | null>(null);
  const [arrastrando, setArrastrando] = useState(false);
  const [pendiente, setPendiente] = useState<Pendiente | null>(null);
  const [procesando, setProcesando] = useState(false);

  async function aplicarEstado(id: string, estado: EstadoTarea) {
    setTareas((prev) => prev.map((t) => (t.id === id ? { ...t, estado } : t)));
    await updateEstadoTareaAction(id, estado);
  }

  /** Botón de flujo de la tarjeta: avanza al siguiente paso sin arrastrar. */
  async function avanzar(t: TareaConRelaciones) {
    if (t.estado === "pendiente") {
      await aplicarEstado(t.id, "en_curso");
    } else if (t.estado === "en_curso") {
      // Misma regla que al arrastrar: si quedan subtareas, pedir confirmación
      if (t.subtareas_pendientes > 0) {
        setPendiente({ tipo: "completar", id: t.id, titulo: t.titulo, n: t.subtareas_pendientes });
      } else {
        await aplicarEstado(t.id, "completada");
      }
    } else if (t.estado === "completada") {
      setPendiente({ tipo: "archivar", id: t.id, titulo: t.titulo });
    }
  }

  async function onDrop(estado: EstadoTarea) {
    if (!dragId) return;
    const id = dragId;
    setDragId(null);
    const t = tareas.find((x) => x.id === id);
    // Confirmar si se marca como completada con subtareas pendientes
    if (estado === "completada" && t && t.subtareas_pendientes > 0) {
      setPendiente({ tipo: "completar", id, titulo: t.titulo, n: t.subtareas_pendientes });
      return;
    }
    await aplicarEstado(id, estado);
  }

  async function confirmar() {
    if (!pendiente) return;
    setProcesando(true);
    if (pendiente.tipo === "archivar") {
      setTareas((prev) => prev.filter((t) => t.id !== pendiente.id));
      await archivarTareaAction(pendiente.id);
    } else if (pendiente.tipo === "eliminar") {
      setTareas((prev) => prev.filter((t) => t.id !== pendiente.id));
      await eliminarTareaAction(pendiente.id);
    } else if (pendiente.tipo === "completar") {
      await aplicarEstado(pendiente.id, "completada");
    } else {
      setTareas((prev) => prev.filter((t) => t.estado !== "completada"));
      await archivarCompletadasAction();
    }
    setProcesando(false);
    setPendiente(null);
  }

  return (
    <>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        {ESTADOS_TABLERO.map((col) => {
          const items = tareas.filter((t) => t.estado === col.key);
          return (
            <div
              key={col.key}
              onDragOver={(e) => e.preventDefault()}
              onDrop={() => onDrop(col.key)}
              className="flex flex-col rounded-lg border border-border bg-surface-raised"
            >
              <div className="flex items-center justify-between border-b border-border px-3 py-2">
                <span className="text-sm font-semibold text-fg">{col.label}</span>
                <div className="flex items-center gap-2">
                  {col.key === "completada" && items.length > 0 && (
                    <button onClick={() => setPendiente({ tipo: "archivarTodas", n: items.length })} className="rounded border border-border px-1.5 py-0.5 text-[10px] text-fg-muted hover:bg-surface" title="Archivar todas las completadas">
                      Archivar todas
                    </button>
                  )}
                  <span className="rounded-full bg-surface px-2 text-xs text-fg-muted">{items.length}</span>
                </div>
              </div>
              <div className="flex-1 space-y-2 p-2">
                {items.map((t) => (
                  <article
                    key={t.id}
                    draggable
                    onDragStart={() => { setDragId(t.id); setArrastrando(true); }}
                    onDragEnd={() => setTimeout(() => setArrastrando(false), 0)}
                    onClick={() => { if (!arrastrando) router.push(`/tareas/${t.id}`); }}
                    className="cursor-pointer rounded-md border border-border bg-surface p-3 shadow-sm transition hover:border-accent active:cursor-grabbing"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <p className="flex-1 text-sm font-medium text-fg">{t.titulo}</p>
                      <div className="flex shrink-0 gap-1">
                        {/* En "Completada" el botón de flujo ya archiva; no duplicamos el icono */}
                        {t.estado !== "completada" && (
                          <button
                            onClick={(e) => { e.stopPropagation(); setPendiente({ tipo: "archivar", id: t.id, titulo: t.titulo }); }}
                            className="rounded p-1 text-fg-muted hover:bg-surface-raised hover:text-fg"
                            title="Archivar"
                          >
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="h-4 w-4">
                              <path strokeLinecap="round" strokeLinejoin="round" d="M4 8h16M5 8l.8 10a1 1 0 001 .9h10.4a1 1 0 001-.9L20 8M4 8l1-3a1 1 0 011-.7h12a1 1 0 011 .7l1 3M10 12h4" />
                            </svg>
                          </button>
                        )}
                        <button
                          onClick={(e) => { e.stopPropagation(); setPendiente({ tipo: "eliminar", id: t.id, titulo: t.titulo }); }}
                          className="rounded p-1 text-error hover:bg-error/10"
                          title="Eliminar"
                        >
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} className="h-4 w-4">
                            <path strokeLinecap="round" d="M6 6l12 12M18 6L6 18" />
                          </svg>
                        </button>
                      </div>
                    </div>
                    {t.bloqueada_por.length > 0 && (
                      <p className="mt-1 inline-block rounded bg-error/10 px-1.5 py-0.5 text-[11px] font-medium text-error">
                        🔒 Bloqueada por: {t.bloqueada_por.join(", ")}
                      </p>
                    )}
                    <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-fg-muted">
                      {t.cliente_nombre && <span>{t.cliente_nombre}</span>}
                      {t.vencimiento && <span>· {new Date(t.vencimiento).toLocaleDateString("es-ES")}</span>}
                      {t.subtareas_pendientes > 0 && <span>· {t.subtareas_pendientes} subtarea(s) pendiente(s)</span>}
                    </div>
                    {t.responsable_nombre && (
                      <p className="mt-1 text-xs text-fg-muted">👤 {t.responsable_nombre}</p>
                    )}
                    {/* Botón de flujo: evita tener que arrastrar la tarjeta */}
                    <button
                      onClick={(e) => { e.stopPropagation(); avanzar(t); }}
                      className={`mt-2.5 w-full rounded-md px-3 py-1.5 text-xs font-medium text-white transition ${
                        t.estado === "pendiente" ? "bg-primary hover:bg-[var(--color-primary-hover)]"
                          : t.estado === "en_curso" ? "bg-success hover:opacity-90"
                            : "bg-secondary hover:opacity-90"
                      }`}
                    >
                      {t.estado === "pendiente" ? "Empezar tarea"
                        : t.estado === "en_curso" ? "Completar tarea"
                          : "Archivar"}
                    </button>
                  </article>
                ))}
                {items.length === 0 && <p className="px-1 py-4 text-center text-xs text-fg-muted">—</p>}
              </div>
            </div>
          );
        })}
      </div>

      {pendiente && (
        <ConfirmModal
          titulo={
            pendiente.tipo === "eliminar" ? "Eliminar tarea"
              : pendiente.tipo === "archivar" ? "Archivar tarea"
                : pendiente.tipo === "completar" ? "Marcar como completada"
                  : "Archivar completadas"
          }
          mensaje={
            pendiente.tipo === "eliminar"
              ? `¿Eliminar «${pendiente.titulo}»? Esta acción no se puede deshacer.`
              : pendiente.tipo === "archivar"
                ? `¿Archivar «${pendiente.titulo}»? Pasará al Archivo y saldrá del tablero.`
                : pendiente.tipo === "completar"
                  ? `«${pendiente.titulo}» tiene ${pendiente.n} subtarea(s) sin completar. ¿Marcarla como completada de todos modos?`
                  : `¿Archivar las ${pendiente.n} tareas completadas?`
          }
          confirmLabel={
            pendiente.tipo === "eliminar" ? "Eliminar"
              : pendiente.tipo === "completar" ? "Completar"
                : "Archivar"
          }
          danger={pendiente.tipo === "eliminar"}
          pending={procesando}
          onConfirm={confirmar}
          onCancel={() => setPendiente(null)}
        />
      )}
    </>
  );
}
