"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/** Modal superpuesto que cierra al pulsar fuera, Esc o la ✕ (vuelve a la vista anterior). */
export function Modal({ children }: { children: React.ReactNode }) {
  const router = useRouter();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") router.back(); };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [router]);

  return (
    <div
      onClick={() => router.back()}
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4 sm:p-8"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="relative my-4 w-full max-w-5xl rounded-lg border border-border bg-surface p-6 shadow-xl sm:my-8 sm:p-8"
      >
        <button
          onClick={() => router.back()}
          aria-label="Cerrar"
          className="absolute right-4 top-4 rounded-md p-1.5 text-fg-muted hover:bg-surface-raised hover:text-fg"
        >
          ✕
        </button>
        {children}
      </div>
    </div>
  );
}
