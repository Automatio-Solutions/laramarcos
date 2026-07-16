"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { setUsuarioActivoAction } from "@/app/(panel)/usuarios/actions";

export function UsuarioAcciones({
  id,
  activo,
  esYo,
}: {
  id: string;
  activo: boolean;
  esYo: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState("");

  function toggle() {
    setError("");
    startTransition(async () => {
      const res = await setUsuarioActivoAction(id, !activo);
      if (!res.ok) setError(res.message ?? "No se pudo actualizar.");
    });
  }

  return (
    <div className="flex items-center justify-end gap-3">
      {error && <span className="text-xs text-error">{error}</span>}
      <Link href={`/usuarios/${id}`} className="text-sm font-medium text-accent hover:underline">
        Editar
      </Link>
      {!esYo && (
        <button
          type="button"
          onClick={toggle}
          disabled={pending}
          className={`text-sm font-medium hover:underline disabled:opacity-50 ${
            activo ? "text-error" : "text-success"
          }`}
        >
          {pending ? "…" : activo ? "Dar de baja" : "Reactivar"}
        </button>
      )}
    </div>
  );
}
