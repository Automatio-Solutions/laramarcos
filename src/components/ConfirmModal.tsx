"use client";

import { useEffect } from "react";

export function ConfirmModal({
  titulo,
  mensaje,
  confirmLabel = "Confirmar",
  danger = false,
  pending = false,
  onConfirm,
  onCancel,
}: {
  titulo: string;
  mensaje: string;
  confirmLabel?: string;
  danger?: boolean;
  pending?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onCancel(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onCancel]);

  return (
    <div onClick={onCancel} className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4">
      <div onClick={(e) => e.stopPropagation()} className="w-full max-w-sm rounded-lg border border-border bg-surface p-6 shadow-xl">
        <h3 className="text-lg font-semibold text-primary">{titulo}</h3>
        <p className="mt-2 text-sm text-fg-muted">{mensaje}</p>
        <div className="mt-6 flex justify-end gap-3">
          <button onClick={onCancel} disabled={pending} className="rounded-md border border-border px-4 py-2 text-sm font-medium text-fg hover:bg-surface-raised disabled:opacity-60">
            Cancelar
          </button>
          <button
            onClick={onConfirm}
            disabled={pending}
            className={`rounded-md px-4 py-2 text-sm font-medium text-white disabled:opacity-60 ${danger ? "bg-error hover:opacity-90" : "bg-primary hover:bg-[var(--color-primary-hover)]"}`}
          >
            {pending ? "…" : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
