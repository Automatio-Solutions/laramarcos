"use client";

import { ESTADOS } from "@/lib/estados";
import type { EstadoTarea } from "@/lib/types";

export function EstadoSelect({
  estado,
  action,
}: {
  estado: EstadoTarea;
  action: (estado: string) => Promise<void>;
}) {
  return (
    <select
      defaultValue={estado}
      onChange={(e) => action(e.target.value)}
      className="rounded-md border border-border bg-surface px-2 py-1 text-xs text-fg"
    >
      {ESTADOS.map((s) => (
        <option key={s.key} value={s.key}>{s.label}</option>
      ))}
    </select>
  );
}
