import { etiquetaTipoAdjunto, formatoTamano, tipoAdjunto, type TipoAdjunto } from "@/lib/chat/core";

const COLOR: Record<TipoAdjunto, string> = {
  pdf: "text-error",
  imagen: "text-accent",
  excel: "text-success",
  word: "text-info",
  otro: "text-fg-muted",
};

/** Icono de documento con la familia del fichero (PDF, imagen, Excel, Word). */
export function IconoAdjunto({ mime, className = "h-8 w-8" }: { mime: string | null | undefined; className?: string }) {
  const tipo = tipoAdjunto(mime);
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} aria-hidden className={`${className} shrink-0 ${COLOR[tipo]}`}>
      {tipo === "imagen" ? (
        <>
          <rect x="3" y="4" width="18" height="16" rx="2" />
          <circle cx="9" cy="10" r="1.6" />
          <path strokeLinecap="round" strokeLinejoin="round" d="M21 16l-5-5-8 9" />
        </>
      ) : (
        <>
          <path strokeLinejoin="round" d="M14 3H7a2 2 0 00-2 2v14a2 2 0 002 2h10a2 2 0 002-2V8z" />
          <path strokeLinejoin="round" d="M14 3v5h5" />
          {tipo === "excel" && <path strokeLinecap="round" d="M8.5 12.5l4 5M12.5 12.5l-4 5" />}
          {tipo === "word" && <path strokeLinecap="round" strokeLinejoin="round" d="M8 12.5l1.2 5 1.8-4 1.8 4 1.2-5" />}
          {tipo === "pdf" && <path strokeLinecap="round" d="M8.5 13h7M8.5 16h7" />}
        </>
      )}
    </svg>
  );
}

/**
 * UC-610 AC-28: adjunto de un mensaje con nombre, tipo y tamaño. Enlaza a la ruta de
 * descarga (que comprueba el acceso y redirige a un enlace firmado de 5 min). Imágenes y PDF
 * se abren en una pestaña nueva; el resto se descarga.
 */
export function AdjuntoCard({
  mensajeId,
  nombre,
  mime,
  size,
}: {
  mensajeId: string;
  nombre: string;
  mime: string | null | undefined;
  size: number | null | undefined;
}) {
  const tipo = tipoAdjunto(mime);
  const verEnLinea = tipo === "pdf" || tipo === "imagen";
  const etiqueta = etiquetaTipoAdjunto(mime);
  const tamano = typeof size === "number" ? formatoTamano(size) : "";
  const detalle = [etiqueta, tamano].filter(Boolean).join(" · ");
  const href = `/api/chat/adjuntos/${mensajeId}${verEnLinea ? "?ver=1" : ""}`;
  return (
    <a
      href={href}
      download={verEnLinea ? undefined : nombre}
      target={verEnLinea ? "_blank" : undefined}
      rel={verEnLinea ? "noopener noreferrer" : undefined}
      data-adjunto={tipo}
      aria-label={`${verEnLinea ? "Abrir" : "Descargar"} adjunto ${nombre} (${detalle})`}
      className="mt-1.5 flex w-full max-w-sm items-center gap-3 rounded-lg border border-border bg-surface px-3 py-2 transition-colors duration-150 hover:border-accent hover:bg-surface-raised"
    >
      <IconoAdjunto mime={mime} />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium text-fg" title={nombre}>
          {nombre}
        </span>
        <span className="block text-xs text-fg-muted">{detalle}</span>
      </span>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden className="h-4 w-4 shrink-0 text-fg-muted">
        {verEnLinea ? (
          <path strokeLinecap="round" strokeLinejoin="round" d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 01-1 1H5a1 1 0 01-1-1V7a1 1 0 011-1h5" />
        ) : (
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v11m0 0l-4-4m4 4l4-4M5 20h14" />
        )}
      </svg>
    </a>
  );
}
