"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { buscarMensajes } from "@/app/(panel)/chat/actions";
import {
  BUSQUEDA_ESPERA_MS,
  BUSQUEDA_MIN_CARACTERES,
  extractoBusqueda,
  formatoHoraMensaje,
  resaltaCoincidencias,
} from "@/lib/chat/core";
import type { ResultadoBusqueda } from "@/lib/types";

type Estado =
  | { tipo: "cargando" }
  | { tipo: "ok"; q: string; resultados: ResultadoBusqueda[] }
  | { tipo: "error"; mensaje: string };

/**
 * UC-611: resultados de la búsqueda de mensajes (sustituyen a la lista de conversaciones
 * mientras se busca). Espera 300 ms tras la última tecla; cada resultado muestra la
 * conversación, el autor, la fecha y un extracto con las palabras resaltadas, y abre la
 * conversación situada en ese mensaje (?m=).
 */
export function ChatBusqueda({
  q,
  titulos,
}: {
  /** Texto buscado (ya con 2 o más caracteres). */
  q: string;
  /** Título de cada conversación visible, por id. */
  titulos: Record<string, string>;
}) {
  const [estado, setEstado] = useState<Estado>({ tipo: "cargando" });
  const consulta = q.trim();

  useEffect(() => {
    if (consulta.length < BUSQUEDA_MIN_CARACTERES) return;
    let vigente = true;
    const t = setTimeout(() => {
      setEstado({ tipo: "cargando" });
      buscarMensajes(consulta)
        .then((r) => {
          if (!vigente) return;
          setEstado("error" in r ? { tipo: "error", mensaje: r.error } : { tipo: "ok", q: consulta, resultados: r.resultados });
        })
        .catch(() => {
          if (vigente) setEstado({ tipo: "error", mensaje: "Sin conexión. No se pudo buscar." });
        });
    }, BUSQUEDA_ESPERA_MS);
    return () => {
      vigente = false;
      clearTimeout(t);
    };
  }, [consulta]);

  if (estado.tipo === "error") {
    return (
      <p role="alert" className="px-5 py-8 text-center text-sm text-error">
        {estado.mensaje}
      </p>
    );
  }
  if (estado.tipo === "cargando") {
    return (
      <p role="status" className="px-5 py-8 text-center text-sm text-fg-muted">
        Buscando…
      </p>
    );
  }
  if (estado.resultados.length === 0) {
    return (
      <p role="status" className="px-5 py-8 text-center text-sm text-fg-muted">
        Sin resultados para «{estado.q}»
      </p>
    );
  }

  return (
    <>
      <p role="status" className="sr-only">
        {estado.resultados.length} resultados
      </p>
      <ul aria-label="Resultados de la búsqueda" className="space-y-0.5 px-2">
        {estado.resultados.map((r) => {
          const titulo = titulos[r.conversacion_id] ?? "Conversación";
          const texto = r.texto
            ? extractoBusqueda(r.texto, estado.q)
            : r.adjunto_nombre
              ? `Adjunto: ${r.adjunto_nombre}`
              : "";
          return (
            <li key={r.id}>
              <Link
                href={`/chat/${r.conversacion_id}?m=${r.id}`}
                data-resultado-busqueda={r.id}
                className="block rounded-md px-3 py-2 transition-colors duration-150 hover:bg-surface-raised"
              >
                <span className="flex items-baseline gap-2">
                  <span className="min-w-0 flex-1 truncate text-xs font-semibold text-fg">{titulo}</span>
                  <time
                    dateTime={r.created_at}
                    className="shrink-0 text-[11px] text-fg-muted"
                    suppressHydrationWarning
                  >
                    {formatoHoraMensaje(r.created_at)}
                  </time>
                </span>
                <span className="block truncate text-[11px] text-fg-muted">
                  {r.autor_id ? (r.autor_nombre ?? "Compañero") : "Usuario eliminado"}
                </span>
                <span className="mt-0.5 line-clamp-2 block break-words text-xs text-fg">
                  {resaltaCoincidencias(texto, estado.q).map((t, i) =>
                    t.marca ? (
                      <mark key={i} className="rounded-sm bg-warning/30 px-0.5 text-fg">
                        {t.texto}
                      </mark>
                    ) : (
                      <span key={i}>{t.texto}</span>
                    ),
                  )}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </>
  );
}
