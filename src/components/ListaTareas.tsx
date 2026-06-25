"use client";

import { useRouter } from "next/navigation";
import { ESTADO_LABEL } from "@/lib/estados";
import type { TareaConRelaciones } from "@/lib/types";

export function ListaTareas({ tareas }: { tareas: TareaConRelaciones[] }) {
  const router = useRouter();
  return (
    <div className="overflow-hidden rounded-lg border border-border bg-surface">
      <table className="w-full text-sm">
        <thead className="bg-surface-raised text-left text-fg-muted">
          <tr>
            <th className="px-4 py-3 font-medium">Tarea</th>
            <th className="px-4 py-3 font-medium">Cliente</th>
            <th className="px-4 py-3 font-medium">Responsable</th>
            <th className="px-4 py-3 font-medium">Estado</th>
            <th className="px-4 py-3 font-medium">Vencimiento</th>
          </tr>
        </thead>
        <tbody>
          {tareas.length === 0 && <tr><td colSpan={5} className="px-4 py-10 text-center text-fg-muted">No hay tareas.</td></tr>}
          {tareas.map((t) => (
            <tr
              key={t.id}
              onClick={() => router.push(`/tareas/${t.id}`)}
              className="cursor-pointer border-t border-border hover:bg-surface-raised"
            >
              <td className="px-4 py-3 font-medium text-fg">
                {t.titulo}
                {t.bloqueada_por.length > 0 && (
                  <span className="ml-2 inline-block rounded bg-error/10 px-1.5 py-0.5 text-[11px] font-medium text-error">
                    🔒 Bloqueada por: {t.bloqueada_por.join(", ")}
                  </span>
                )}
              </td>
              <td className="px-4 py-3 text-fg-muted">{t.cliente_nombre ?? "—"}</td>
              <td className="px-4 py-3 text-fg-muted">{t.responsable_nombre ?? "—"}</td>
              <td className="px-4 py-3 text-fg">{ESTADO_LABEL[t.estado]}</td>
              <td className="px-4 py-3 text-fg-muted">{t.vencimiento ? new Date(t.vencimiento).toLocaleDateString("es-ES") : "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
