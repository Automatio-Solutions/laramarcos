"use client";

import { useState } from "react";
import Link from "next/link";
import { marcarLeidaAction, marcarTodasLeidasAction } from "@/app/(panel)/notificaciones-actions";
import type { Notificacion } from "@/lib/types";

export function NotificacionesBell({
  notificaciones,
  noLeidas,
}: {
  notificaciones: Notificacion[];
  noLeidas: number;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className="relative rounded-md p-2 text-fg hover:bg-surface-raised"
        aria-label="Notificaciones"
      >
        🔔
        {noLeidas > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-error px-1 text-[10px] font-bold text-white">
            {noLeidas}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 z-10 mt-2 w-80 rounded-lg border border-border bg-surface shadow-lg">
          <div className="flex items-center justify-between border-b border-border px-3 py-2">
            <span className="text-sm font-semibold text-fg">Notificaciones</span>
            {noLeidas > 0 && (
              <form action={marcarTodasLeidasAction}>
                <button className="text-xs text-accent hover:underline">Marcar todas</button>
              </form>
            )}
          </div>
          <ul className="max-h-96 divide-y divide-border overflow-auto">
            {notificaciones.length === 0 && (
              <li className="px-3 py-6 text-center text-sm text-fg-muted">Sin notificaciones.</li>
            )}
            {notificaciones.map((n) => (
              <li key={n.id} className={`px-3 py-2.5 text-sm ${n.leida ? "" : "bg-primary-subtle/40"}`}>
                <div className="flex items-start justify-between gap-2">
                  <Link
                    href={n.enlace ?? "#"}
                    onClick={() => { if (!n.leida) marcarLeidaAction(n.id); setOpen(false); }}
                    className="flex-1 text-fg hover:text-accent"
                  >
                    {n.mensaje}
                  </Link>
                  {!n.leida && (
                    <form action={marcarLeidaAction.bind(null, n.id)}>
                      <button className="text-[10px] text-fg-muted hover:underline">✓</button>
                    </form>
                  )}
                </div>
                <span className="text-[10px] text-fg-muted">{new Date(n.created_at).toLocaleString("es-ES")}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
