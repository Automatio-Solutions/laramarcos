"use client";

export function PrintButton() {
  return (
    <button
      onClick={() => window.print()}
      className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-[var(--color-primary-hover)] print:hidden"
    >
      Imprimir / Guardar PDF
    </button>
  );
}
