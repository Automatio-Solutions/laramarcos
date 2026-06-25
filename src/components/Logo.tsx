/**
 * Logo de LaraMarcos Asesores — SVG vectorial, fondo transparente.
 * El azul de marca usa `currentColor` (hereda el color del texto), por lo que
 * funciona tanto sobre fondo claro (login → text-primary) como sobre el
 * sidebar navy (text-white). El gris de marca (#828999) se mantiene fijo.
 */
export function Logo({ className = "", withWordmark = true }: { className?: string; withWordmark?: boolean }) {
  return (
    <svg
      viewBox={withWordmark ? "0 0 520 140" : "0 0 132 140"}
      className={className}
      style={{ fontFamily: "inherit" }}
      role="img"
      aria-label="LaraMarcos Asesores"
      fill="none"
    >
      {/* ----- Monograma LM ----- */}
      {/* Marco en L (azul) */}
      <rect x="0" y="0" width="14" height="140" fill="currentColor" />
      <rect x="0" y="126" width="132" height="14" fill="currentColor" />
      {/* M — mitad izquierda azul */}
      <path d="M30 112 L30 24 L72 76" stroke="currentColor" strokeWidth="18" strokeLinecap="square" strokeLinejoin="miter" />
      {/* M — mitad derecha gris */}
      <path d="M72 76 L114 24 L114 112" stroke="#828999" strokeWidth="18" strokeLinecap="square" strokeLinejoin="miter" />

      {withWordmark && (
        <>
          {/* ----- Texto ----- */}
          <text x="152" y="66" fill="currentColor" fontSize="46" fontWeight="800" letterSpacing="0.5">
            LARA MARCOS
          </text>
          {/* Barra gris */}
          <rect x="154" y="80" width="252" height="7" fill="#828999" />
          {/* Subtítulo */}
          <text x="155" y="112" fill="currentColor" fontSize="21" fontWeight="500" letterSpacing="7">
            ASESORES
          </text>
        </>
      )}
    </svg>
  );
}
