"use client";

import { useState } from "react";
import type { PasoPlantilla } from "@/lib/types";

export function PlantillaEditor({
  servicioId,
  pasosIniciales,
  action,
}: {
  servicioId: string;
  pasosIniciales: PasoPlantilla[];
  action: (servicioId: string, fd: FormData) => Promise<void>;
}) {
  const [pasos, setPasos] = useState<{ nombre: string; plazo: number }[]>(
    pasosIniciales.length
      ? pasosIniciales.map((p) => ({ nombre: p.nombre, plazo: p.plazo_relativo_dias }))
      : [{ nombre: "", plazo: 0 }],
  );

  const update = (i: number, k: "nombre" | "plazo", v: string) =>
    setPasos((prev) => prev.map((p, idx) => (idx === i ? { ...p, [k]: k === "plazo" ? Number(v) : v } : p)));

  return (
    <form action={action.bind(null, servicioId)} className="max-w-2xl space-y-4">
      <div className="space-y-2">
        {pasos.map((p, i) => (
          <div key={i} className="flex items-center gap-2">
            <span className="w-6 text-sm text-fg-muted">{i + 1}.</span>
            <input
              name="paso_nombre"
              value={p.nombre}
              onChange={(e) => update(i, "nombre", e.target.value)}
              placeholder="Paso (ej: Notaría)"
              className="flex-1 rounded-md border border-border bg-surface px-3 py-2 text-sm text-fg outline-none focus:border-primary"
            />
            <input
              name="paso_plazo"
              type="number"
              value={p.plazo}
              onChange={(e) => update(i, "plazo", e.target.value)}
              className="w-28 rounded-md border border-border bg-surface px-3 py-2 text-sm text-fg outline-none focus:border-primary"
              title="Días desde el inicio"
            />
            <span className="text-xs text-fg-muted">días</span>
            <button
              type="button"
              onClick={() => setPasos((prev) => prev.filter((_, idx) => idx !== i))}
              className="text-sm text-error hover:underline"
            >
              ✕
            </button>
          </div>
        ))}
      </div>

      <button
        type="button"
        onClick={() => setPasos((prev) => [...prev, { nombre: "", plazo: 0 }])}
        className="text-sm font-medium text-accent hover:underline"
      >
        + Añadir paso
      </button>

      <div>
        <button className="rounded-md bg-primary px-5 py-2 font-medium text-white hover:bg-[var(--color-primary-hover)]">
          Guardar plantilla
        </button>
      </div>
    </form>
  );
}
