"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { normalizaTexto } from "@/lib/ocr/core";

export interface OpcionCliente {
  id: string;
  razon_social: string;
  cif?: string | null;
}

// Con ~600 clientes, pintar más de esto no ayuda: se sigue escribiendo.
const MAX_RESULTADOS = 50;

/**
 * Buscador de cliente: se escribe parte del nombre o del CIF y se elige de la
 * lista (ratón o flechas + Enter). Sustituye al desplegable de ~600 clientes.
 * Sirve en formularios normales (`name` → input oculto con el id) y controlado
 * (`value` + `onChange`). `extra` añade opciones fijas arriba, como "Detectar por
 * carpeta".
 */
export function ClienteBuscador({
  clientes,
  name,
  value,
  defaultValue,
  onChange,
  required,
  disabled,
  extra = [],
  className = "",
}: {
  clientes: OpcionCliente[];
  name?: string;
  value?: string;
  defaultValue?: string | null;
  onChange?: (id: string) => void;
  required?: boolean;
  disabled?: boolean;
  extra?: { id: string; etiqueta: string }[];
  className?: string;
}) {
  const [interno, setInterno] = useState(defaultValue ?? "");
  const seleccionado = value ?? interno;
  const etiquetaDe = (id: string) =>
    extra.find((e) => e.id === id)?.etiqueta ?? clientes.find((c) => c.id === id)?.razon_social ?? "";

  // null = no se está escribiendo: se ve el cliente elegido.
  const [escrito, setEscrito] = useState<string | null>(null);
  const texto = escrito ?? etiquetaDe(seleccionado);
  const [abierto, setAbierto] = useState(false);
  const [activo, setActivo] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listaId = useId();

  const indice = useMemo(
    () => clientes.map((c) => ({ c, clave: normalizaTexto(`${c.razon_social} ${c.cif ?? ""}`) })),
    [clientes],
  );

  const opciones = useMemo(() => {
    const q = normalizaTexto(texto);
    const palabras = q.split(" ").filter(Boolean);
    const fijas = extra.map((e) => ({ id: e.id, etiqueta: e.etiqueta, cif: null as string | null }));
    // Sin escribir nada nuevo se enseña todo, para poder cambiar la selección.
    if (!palabras.length || escrito === null) {
      return [...fijas, ...clientes.slice(0, MAX_RESULTADOS).map((c) => ({ id: c.id, etiqueta: c.razon_social, cif: c.cif ?? null }))];
    }
    const encontrados = indice
      .filter(({ clave }) => palabras.every((p) => clave.includes(p)))
      .slice(0, MAX_RESULTADOS)
      .map(({ c }) => ({ id: c.id, etiqueta: c.razon_social, cif: c.cif ?? null }));
    return [...fijas.filter((f) => palabras.every((p) => normalizaTexto(f.etiqueta).includes(p))), ...encontrados];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [texto, escrito, indice, extra]);

  // El campo visible es el que valida: "required" solo cuenta si hay un cliente elegido.
  useEffect(() => {
    inputRef.current?.setCustomValidity(required && !seleccionado ? "Elige un cliente de la lista." : "");
  }, [required, seleccionado]);

  function elegir(id: string) {
    if (value === undefined) setInterno(id);
    onChange?.(id);
    setEscrito(null);
    setAbierto(false);
  }

  function cerrar() {
    setAbierto(false);
    // Lo escrito sin elegir no cuenta: vuelve a la selección vigente.
    setEscrito(null);
  }

  return (
    <div className={`relative ${className}`}>
      {name && <input type="hidden" name={name} value={seleccionado} />}
      <input
        ref={inputRef}
        type="text"
        role="combobox"
        aria-expanded={abierto}
        aria-controls={listaId}
        aria-autocomplete="list"
        value={texto}
        disabled={disabled}
        required={required}
        placeholder="Buscar cliente por nombre o CIF…"
        autoComplete="off"
        onFocus={(e) => { e.target.select(); setAbierto(true); setActivo(0); }}
        onChange={(e) => { setEscrito(e.target.value); setAbierto(true); setActivo(0); }}
        onBlur={cerrar}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") { e.preventDefault(); setAbierto(true); setActivo((a) => Math.min(a + 1, opciones.length - 1)); }
          else if (e.key === "ArrowUp") { e.preventDefault(); setActivo((a) => Math.max(a - 1, 0)); }
          else if (e.key === "Enter" && abierto) {
            e.preventDefault(); // no enviar el formulario al elegir
            if (opciones[activo]) elegir(opciones[activo].id);
          } else if (e.key === "Escape") cerrar();
        }}
        className="w-full min-w-64 rounded-md border border-border bg-surface px-3 py-2 text-sm text-fg"
      />
      {abierto && !disabled && (
        <ul
          id={listaId}
          role="listbox"
          className="absolute z-20 mt-1 max-h-72 w-full min-w-72 overflow-y-auto rounded-md border border-border bg-surface py-1 text-sm shadow-lg"
        >
          {opciones.length === 0 && <li className="px-3 py-2 text-fg-muted">Ningún cliente coincide.</li>}
          {opciones.map((o, i) => (
            <li
              key={o.id}
              role="option"
              aria-selected={o.id === seleccionado}
              // mousedown en vez de click: se adelanta al blur del campo.
              onMouseDown={(e) => { e.preventDefault(); elegir(o.id); }}
              onMouseEnter={() => setActivo(i)}
              className={`flex cursor-pointer justify-between gap-3 px-3 py-1.5 ${i === activo ? "bg-surface-raised" : ""} ${o.id === seleccionado ? "font-medium text-primary" : "text-fg"}`}
            >
              <span className="truncate">{o.etiqueta}</span>
              {o.cif && <span className="shrink-0 font-mono text-xs text-fg-muted">{o.cif}</span>}
            </li>
          ))}
          {opciones.length >= MAX_RESULTADOS && (
            <li className="px-3 py-1.5 text-xs text-fg-muted">Sigue escribiendo para acotar…</li>
          )}
        </ul>
      )}
    </div>
  );
}
