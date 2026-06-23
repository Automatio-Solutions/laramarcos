"use client";

import { useState } from "react";
import Link from "next/link";
import { ESTADOS } from "@/lib/estados";
import { updateEstadoTareaAction } from "@/app/(panel)/tareas/actions";
import type { TareaConRelaciones, EstadoTarea } from "@/lib/types";

export function KanbanBoard({ tareas: initial }: { tareas: TareaConRelaciones[] }) {
  const [tareas, setTareas] = useState(initial);
  const [dragId, setDragId] = useState<string | null>(null);

  async function onDrop(estado: EstadoTarea) {
    if (!dragId) return;
    const id = dragId;
    setDragId(null);
    setTareas((prev) => prev.map((t) => (t.id === id ? { ...t, estado } : t)));
    await updateEstadoTareaAction(id, estado); // persiste (AC-03)
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
              <span className="rounded-full bg-surface px-2 text-xs text-fg-muted">{items.length}</span>
            </div>
            <div className="flex-1 space-y-2 p-2">
              {items.map((t) => (
                <article
                  key={t.id}
                  draggable
                  onDragStart={() => setDragId(t.id)}
                  className="cursor-grab rounded-md border border-border bg-surface p-3 shadow-sm active:cursor-grabbing"
                >
                  <Link href={`/tareas/${t.id}`} className="block text-sm font-medium text-fg hover:text-accent">
                    {t.titulo}
                  </Link>
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
