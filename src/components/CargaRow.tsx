"use client";

import { useRouter } from "next/navigation";
import type { CargaEmpleado } from "@/lib/repos/dashboard";

/** Fila de "Carga por empleado": al pinchar abre las tareas de esa persona. */
export function CargaRow({ carga: c }: { carga: CargaEmpleado }) {
  const router = useRouter();
  // Sin id → tareas sin responsable asignado; no hay filtro por persona posible.
  const href = c.id ? `/tareas?responsable=${c.id}` : "/tareas";

  return (
    <tr
      onClick={() => router.push(href)}
      className="cursor-pointer border-t border-border hover:bg-surface-raised"
      title={c.id ? `Ver las tareas de ${c.nombre}` : "Ver tareas"}
    >
      <td className="px-4 py-2.5 text-fg">{c.nombre}</td>
      <td className="px-4 py-2.5 text-right text-fg">{c.abiertas}</td>
      <td className={`px-4 py-2.5 text-right ${c.vencidas ? "text-error" : "text-fg-muted"}`}>{c.vencidas}</td>
    </tr>
  );
}
