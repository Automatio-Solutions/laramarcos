"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ESTADOS } from "@/lib/estados";
import { updateEstadoTareaAction, archivarTareaAction, archivarCompletadasAction, eliminarTareaAction } from "@/app/(panel)/tareas/actions";
import type { TareaConRelaciones, EstadoTarea } from "@/lib/types";

export function KanbanBoard({ tareas: initial }: { tareas: TareaConRelaciones[] }) {
  const router = useRouter();
  const [tareas, setTareas] = useState(initial);
  const [dragId, setDragId] = useState<string | null>(null);
  const [arrastrando, setArrastrando] = useState(false);

  async function onDrop(estado: EstadoTarea) {
    if (!dragId) return;
    const id = dragId;
    setDragId(null);
    setTareas((prev) => prev.map((t) => (t.id === id ? { ...t, estado } : t)));
    await updateEstadoTareaAction(id, estado); // persiste (AC-03)
  }

  async function archivar(id: string, titulo: string) {
    if (!confirm(`¿Archivar la tarea "${titulo}"? Pasará al Archivo y desaparecerá del tablero.`)) return;
    setTareas((prev) => prev.filter((t) => t.id !== id)); // optimista
    await archivarTareaAction(id);
  }

  async function eliminar(id: string, titulo: string) {
    if (!confirm(`¿ELIMINAR la tarea "${titulo}"? Esta acción no se puede deshacer.`)) return;
    setTareas((prev) => prev.filter((t) => t.id !== id));
    await eliminarTareaAction(id);
  }

  async function archivarTodasCompletadas() {
    const n = tareas.filter((t) => t.estado === "completada").length;
    if (!confirm(`¿Archivar las ${n} tareas completadas?`)) return;
    setTareas((prev) => prev.filter((t) => t.estado !== "completada"));
    await archivarCompletadasAction();
  }

  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
      {ESTADOS.map((col) => {
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
                  <button onClick={archivarTodasCompletadas} className="rounded border border-border px-1.5 py-0.5 text-[10px] text-fg-muted hover:bg-surface" title="Archivar todas las completadas">
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
                  className="group cursor-pointer rounded-md border border-border bg-surface p-3 shadow-sm transition hover:border-accent active:cursor-grabbing"
                >
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-sm font-medium text-fg">{t.titulo}</p>
                    <div className="flex shrink-0 gap-1 opacity-0 transition group-hover:opacity-100">
                      <button
                        onClick={(e) => { e.stopPropagation(); archivar(t.id, t.titulo); }}
                        className="rounded px-1 text-xs text-fg-muted hover:text-fg"
                        title="Archivar"
                      >
                        🗄
                      </button>
                      <button
                        onClick={(e) => { e.stopPropagation(); eliminar(t.id, t.titulo); }}
                        className="rounded px-1 text-xs text-fg-muted hover:text-error"
                        title="Eliminar"
                      >
                        🗑
                      </button>
                    </div>
                  </div>
                  <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-fg-muted">
                    {t.cliente_nombre && <span>{t.cliente_nombre}</span>}
                    {t.vencimiento && <span>· {new Date(t.vencimiento).toLocaleDateString("es-ES")}</span>}
                  </div>
                  {t.responsable_nombre && (
                    <p className="mt-1 text-xs text-fg-muted">👤 {t.responsable_nombre}</p>
                  )}
                </article>
              ))}
              {items.length === 0 && <p className="px-1 py-4 text-center text-xs text-fg-muted">—</p>}
            </div>
          </div>
        );
      })}
    </div>
  );
}
