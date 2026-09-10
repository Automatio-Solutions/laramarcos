"use client";

import { useActionState } from "react";
import Link from "next/link";
import { analizarAction, confirmarAction, type ImportState } from "@/app/(panel)/importar/actions";

const initial: ImportState = { step: "input" };

export function ImportarForm() {
  const [state, analizar] = useActionState(analizarAction, initial);
  const [confirmState, confirmar, confirming] = useActionState(confirmarAction, initial);
  const report = state.report;

  return (
    <div className="max-w-3xl space-y-6 p-8">
      <header>
        <h1 className="text-2xl font-bold text-primary">Importar clientes</h1>
        <p className="text-sm text-fg-muted">
          Pega un CSV (cabecera con <code>cif, razon_social, email, telefono, direccion</code>). Se validan CIFs y duplicados antes de cargar.
        </p>
      </header>

      <form action={analizar} className="space-y-3">
        <textarea
          name="csv"
          rows={8}
          defaultValue={state.csv}
          placeholder={"cif,razon_social,email\nB58818501,Ejemplo SL,info@ejemplo.es"}
          className="w-full rounded-md border border-border bg-surface p-3 font-mono text-xs text-fg outline-none focus:border-primary"
        />
        <button className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-[var(--color-primary-hover)]">
          Analizar
        </button>
        {state.message && <p className="text-sm text-error">{state.message}</p>}
      </form>

      {report && (
        <div className="space-y-4 rounded-lg border border-border bg-surface p-5">
          <div className="flex gap-6 text-sm">
            <span className="font-medium text-success">✓ {report.valid.length} válidas</span>
            <span className="font-medium text-error">✕ {report.rejected.length} rechazadas</span>
          </div>

          {report.rejected.length > 0 && (
            <table className="w-full text-xs">
              <thead className="text-left text-fg-muted">
                <tr><th className="py-1">Fila</th><th>CIF</th><th>Motivo</th></tr>
              </thead>
              <tbody>
                {report.rejected.map((r, i) => (
                  <tr key={i} className="border-t border-border">
                    <td className="py-1">{r.fila}</td>
                    <td className="font-mono">{r.cif || "—"}</td>
                    <td className="text-error">{r.motivo}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {report.valid.length > 0 && (
            <form action={confirmar}>
              <input type="hidden" name="csv" value={state.csv} />
              <button disabled={confirming} className="rounded-md bg-success px-4 py-2 text-sm font-medium text-white disabled:opacity-60">
                {confirming ? "Importando…" : `Importar ${report.valid.length} clientes`}
              </button>
              {confirmState.message && <p className="mt-2 text-sm text-error">{confirmState.message}</p>}
            </form>
          )}
        </div>
      )}

      <Link href="/clientes" className="inline-block text-sm text-fg-muted hover:underline">← Clientes</Link>
    </div>
  );
}
