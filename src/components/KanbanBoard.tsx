"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ESTADOS } from "@/lib/estados";
import { ConfirmModal } from "@/components/ConfirmModal";
import { updateEstadoTareaAction, archivarTareaAction, archivarCompletadasAction, eliminarTareaAction } from "@/app/(panel)/tareas/actions";
import type { TareaConRelaciones, EstadoTarea } from "@/lib/types";

type Pendiente =
  | { tipo: "archivar"; id: string; titulo: string }
  | { tipo: "eliminar"; id: string; titulo: string }
  | { tipo: "archivarTodas"; n: number };

export function KanbanBoard({ tareas: initial }: { tareas: TareaConRelaciones[] }) {
  const router = useRouter();
  const [tareas, setTareas] = useState(initial);
  const [dragId, setDragId] = useState<string | null>(null);
  const [arrastrando, setArrastrando] = useState(false);
  const [pendiente, setPendiente] = useState<Pendiente | null>(null);
  const [procesando, setProcesando] = useState(false);

  async function onDrop(estado: EstadoTarea) {
    if (!dragId) return;
    const id = dragId;
    setDragId(null);
    setTareas((prev) => prev.map((t) => (t.id === id ? { ...t, estado } : t)));
    await updateEstadoTareaAction(id, estado);
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
    } else {
      setTareas((prev) => prev.filter((t) => t.estado !== "completada"));
      await archivarCompletadasAction();
    }
    setProcesando(false);
    setPendiente(null);
  }

  return (
    <>
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
                        <button
                          onClick={(e) => { e.stopPropagation(); setPendiente({ tipo: "archivar", id: t.id, titulo: t.titulo }); }}
                          className="rounded p-1 text-fg-muted hover:bg-surface-raised hover:text-fg"
                          title="Archivar"
                        >
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="h-4 w-4">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M4 8h16M5 8l.8 10a1 1 0 001 .9h10.4a1 1 0 001-.9L20 8M4 8l1-3a1 1 0 011-.7h12a1 1 0 011 .7l1 3M10 12h4" />
                          </svg>
                        </button>
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

      {pendiente && (
        <ConfirmModal
          titulo={pendiente.tipo === "eliminar" ? "Eliminar tarea" : pendiente.tipo === "archivar" ? "Archivar tarea" : "Archivar completadas"}
          mensaje={
            pendiente.tipo === "eliminar"
              ? `¿Eliminar «${pendiente.titulo}»? Esta acción no se puede deshacer.`
              : pendiente.tipo === "archivar"
                ? `¿Archivar «${pendiente.titulo}»? Pasará al Archivo y saldrá del tablero.`
                : `¿Archivar las ${pendiente.n} tareas completadas?`
          }
          confirmLabel={pendiente.tipo === "eliminar" ? "Eliminar" : "Archivar"}
          danger={pendiente.tipo === "eliminar"}
          pending={procesando}
          onConfirm={confirmar}
          onCancel={() => setPendiente(null)}
        />
      )}
    </>
  );
}
