"use client";

import { useEffect, useRef } from "react";

export type Miembro = { id: string; nombre: string };

/** Iniciales para el avatar ("María López" → "ML"). */
function iniciales(nombre: string): string {
  const partes = nombre.trim().split(/\s+/).filter(Boolean);
  if (partes.length === 0) return "?";
  const a = partes[0][0] ?? "";
  const b = partes.length > 1 ? (partes[partes.length - 1][0] ?? "") : "";
  return (a + b).toUpperCase();
}

/**
 * UC-605 AC-15: lista de compañeros de la conversación para completar una @mención.
 * El foco se queda en la caja de texto: el teclado (flechas, Enter/Tab, Esc) lo gestiona
 * ChatComposer; aquí solo se pinta y se admite el clic.
 */
export function MencionPicker({
  id,
  opciones,
  indice,
  onElegir,
  onIndice,
}: {
  id: string;
  opciones: Miembro[];
  indice: number;
  onElegir: (m: Miembro) => void;
  onIndice: (i: number) => void;
}) {
  const listaRef = useRef<HTMLUListElement>(null);

  // Mantiene visible la opción activa al moverse con las flechas.
  useEffect(() => {
    const el = listaRef.current?.querySelector<HTMLElement>(`[data-indice="${indice}"]`);
    el?.scrollIntoView({ block: "nearest" });
  }, [indice]);

  return (
    <ul
      ref={listaRef}
      id={id}
      role="listbox"
      aria-label="Mencionar a un compañero"
      className="absolute bottom-full left-5 z-20 mb-1 max-h-60 w-72 overflow-y-auto rounded-lg border border-border bg-surface py-1 shadow-lg"
    >
      {opciones.map((m, i) => {
        const activa = i === indice;
        return (
          <li
            key={m.id}
            id={`${id}-${i}`}
            data-indice={i}
            role="option"
            aria-selected={activa}
            onMouseDown={(e) => e.preventDefault()} // no quitar el foco a la caja de texto
            onMouseEnter={() => onIndice(i)}
            onClick={() => onElegir(m)}
            className={`flex cursor-pointer items-center gap-2 px-3 py-1.5 text-sm ${
              activa ? "bg-primary-subtle text-fg" : "text-fg hover:bg-surface-raised"
            }`}
          >
            <span
              aria-hidden
              className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary-subtle text-[10px] font-semibold text-primary"
            >
              {iniciales(m.nombre)}
            </span>
            <span className="truncate">{m.nombre}</span>
          </li>
        );
      })}
    </ul>
  );
}
