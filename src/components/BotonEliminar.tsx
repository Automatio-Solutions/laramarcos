"use client";

import { useState, useTransition } from "react";
import { ConfirmModal } from "@/components/ConfirmModal";

/**
 * X roja de borrado con confirmación, para la última columna de una tabla.
 *
 * Corta la propagación del clic: en las tablas cuya fila entera es un enlace,
 * sin esto pulsar la X abriría el detalle en lugar de borrar.
 *
 * Quien lo usa decide si mostrarlo: la RLS solo deja borrar al staff, así que
 * enseñárselo a un asesor sería darle un "no tienes permiso" garantizado.
 */
export function BotonEliminar({
  id,
  descripcion,
  titulo,
  mensaje,
  onEliminar,
}: {
  id: string;
  /** Para el lector de pantalla: "Eliminar {descripcion}". */
  descripcion: string;
  titulo: string;
  mensaje: string;
  onEliminar: (id: string) => Promise<{ error?: string }>;
}) {
  const [abierto, setAbierto] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <>
      <button
        type="button"
        aria-label={`Eliminar ${descripcion}`}
        title="Eliminar"
        onClick={(e) => { e.preventDefault(); e.stopPropagation(); setError(null); setAbierto(true); }}
        className="rounded-md px-2 py-1 text-base font-semibold leading-none text-error transition-colors hover:bg-error/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-error"
      >
        ✕
      </button>

      {error && <p className="mt-1 text-xs text-error">{error}</p>}

      {abierto && (
        <ConfirmModal
          titulo={titulo}
          mensaje={mensaje}
          confirmLabel="Eliminar"
          danger
          pending={pending}
          onCancel={() => setAbierto(false)}
          onConfirm={() =>
            startTransition(async () => {
              const r = await onEliminar(id);
              if (r?.error) setError(r.error);
              setAbierto(false);
            })
          }
        />
      )}
    </>
  );
}
