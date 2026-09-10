"use client";

import { useState, useTransition } from "react";
import { ConfirmModal } from "@/components/ConfirmModal";

/**
 * Botón de borrado de un presupuesto, para la última columna de la lista.
 *
 * Corta la propagación del clic: la fila entera es un enlace al presupuesto,
 * así que sin esto pulsar la X abriría el detalle en lugar de borrar.
 */
export function EliminarPresupuesto({
  id,
  cliente,
  estado,
  onEliminar,
}: {
  id: string;
  cliente: string;
  estado: string;
  onEliminar: (id: string) => Promise<{ error?: string }>;
}) {
  const [abierto, setAbierto] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const aceptado = estado === "aceptado";

  return (
    <>
      <button
        type="button"
        aria-label={`Eliminar el presupuesto de ${cliente}`}
        title="Eliminar"
        onClick={(e) => { e.preventDefault(); e.stopPropagation(); setError(null); setAbierto(true); }}
        className="rounded-md px-2 py-1 text-base font-semibold leading-none text-error transition-colors hover:bg-error/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-error"
      >
        ✕
      </button>

      {error && <p className="mt-1 text-xs text-error">{error}</p>}

      {abierto && (
        <ConfirmModal
          titulo="Eliminar presupuesto"
          mensaje={
            aceptado
              ? `El presupuesto de ${cliente} está ACEPTADO y tiene una tarea asociada, que no se borrará. Perderás el registro de lo que se presupuestó y se aceptó. ¿Seguro?`
              : `Se eliminará el presupuesto de ${cliente}. Esta acción no se puede deshacer.`
          }
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
