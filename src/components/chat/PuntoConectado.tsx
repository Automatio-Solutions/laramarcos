/** UC-613 AC-40: punto verde de "conectado" junto al nombre de un compañero. */
export function PuntoConectado({ className = "" }: { className?: string }) {
  return (
    <span
      role="img"
      aria-label="Conectado"
      title="Conectado"
      data-conectado
      className={`inline-block h-2 w-2 shrink-0 rounded-full bg-success ring-2 ring-surface ${className}`}
    />
  );
}
