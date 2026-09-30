"use client";

import Link from "next/link";
import type { TipoEnlace } from "@/lib/chat/core";

/** Resultado de resolver un enlace: datos, no disponible (null) o aún cargando (undefined). */
export type EstadoEnlace = { titulo: string; estado: string } | null | undefined;

const ETIQUETA: Record<TipoEnlace, string> = { tarea: "Tarea", cliente: "Cliente" };

/** Colores del estado (tareas y clientes). */
function claseEstado(estado: string): string {
  switch (estado) {
    case "Completada":
    case "Activo":
      return "bg-success/10 text-success";
    case "Bloqueada":
    case "Baja":
      return "bg-error/10 text-error";
    case "En curso":
      return "bg-info/10 text-info";
    default:
      return "bg-surface-raised text-fg-muted";
  }
}

function Icono({ tipo }: { tipo: TipoEnlace }) {
  return tipo === "tarea" ? (
    <svg aria-hidden viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="h-4 w-4">
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 11l3 3 8-8M20 12v7a2 2 0 01-2 2H6a2 2 0 01-2-2V5a2 2 0 012-2h9" />
    </svg>
  ) : (
    <svg aria-hidden viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="h-4 w-4">
      <path strokeLinecap="round" strokeLinejoin="round" d="M4 21V5a2 2 0 012-2h8a2 2 0 012 2v16M16 9h2a2 2 0 012 2v10M8 7h4M8 11h4M8 15h4M3 21h18" />
    </svg>
  );
}

/**
 * UC-608: tarjeta bajo el mensaje para un enlace a una tarea o a un cliente de la plataforma.
 * AC-23: título y estado; toda la tarjeta lleva a la página. AC-24: sin permiso (o si no
 * existe) se muestra "Elemento no disponible", sin título ni datos y sin enlace.
 */
export function EnlaceCard({
  tipo,
  ruta,
  resultado,
}: {
  tipo: TipoEnlace;
  ruta: string;
  resultado: EstadoEnlace;
}) {
  const base =
    "mt-1.5 flex max-w-md items-center gap-3 rounded-lg border border-border bg-surface px-3 py-2 text-sm";

  if (resultado === undefined) {
    return (
      <div className={`${base} text-fg-muted`} aria-busy="true" aria-label={`Enlace a ${ETIQUETA[tipo].toLowerCase()}: cargando`}>
        <Icono tipo={tipo} />
        <span>Cargando…</span>
      </div>
    );
  }

  if (resultado === null) {
    return (
      <div className={`${base} text-fg-muted`} role="note" aria-label="Elemento no disponible">
        <Icono tipo={tipo} />
        <span>Elemento no disponible</span>
      </div>
    );
  }

  return (
    <Link
      href={ruta}
      aria-label={`${ETIQUETA[tipo]}: ${resultado.titulo} (${resultado.estado})`}
      data-enlace={tipo}
      className={`${base} transition-colors duration-150 hover:border-accent hover:bg-surface-raised`}
    >
      <span className="text-accent">
        <Icono tipo={tipo} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[11px] font-medium uppercase tracking-wide text-fg-muted">{ETIQUETA[tipo]}</span>
        <span className="block truncate font-medium text-fg">{resultado.titulo}</span>
      </span>
      <span className={`shrink-0 rounded-md px-2 py-0.5 text-xs font-medium ${claseEstado(resultado.estado)}`}>
        {resultado.estado}
      </span>
    </Link>
  );
}
