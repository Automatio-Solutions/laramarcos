"use client";

import { useState } from "react";
import { calcularTotal, IVA_TIPO_DEFECTO, type LineaPresupuesto } from "@/lib/presupuesto/core";

const eur = new Intl.NumberFormat("es-ES", { style: "currency", currency: "EUR" });

export function EditorPresupuesto({
  id,
  lineasIniciales,
  descuentoGlobalInicial,
  condicionesIniciales,
  validezInicial,
  bloqueado,
  action,
}: {
  id: string;
  lineasIniciales: LineaPresupuesto[];
  descuentoGlobalInicial: number;
  condicionesIniciales: string | null;
  validezInicial: number;
  bloqueado: boolean;
  action: (id: string, fd: FormData) => Promise<void>;
}) {
  const [lineas, setLineas] = useState<LineaPresupuesto[]>(
    lineasIniciales.length ? lineasIniciales : [{ concepto: "", cantidad: 1, precio: 0, descuento: 0 }],
  );
  const [descGlobal, setDescGlobal] = useState(descuentoGlobalInicial);

  const upd = (i: number, k: keyof LineaPresupuesto, v: string) =>
    setLineas((p) => p.map((l, idx) => (idx === i ? { ...l, [k]: k === "concepto" ? v : Number(v) } : l)));

  const { subtotal, base_imponible, iva_cuota, total } = calcularTotal(lineas, descGlobal);

  return (
    <form action={action.bind(null, id)} className="space-y-4">
      <div className="overflow-hidden rounded-lg border border-border bg-surface">
        <table className="w-full text-sm">
          <thead className="bg-surface-raised text-left text-fg-muted">
            <tr>
              <th className="px-3 py-2 font-medium">Concepto</th>
              <th className="px-3 py-2 font-medium w-20 text-right">Cant.</th>
              <th className="px-3 py-2 font-medium w-28 text-right">Precio</th>
              <th className="px-3 py-2 font-medium w-20 text-right">Dto %</th>
              <th className="px-3 py-2 font-medium w-28 text-right">Importe</th>
              <th className="w-8" />
            </tr>
          </thead>
          <tbody>
            {lineas.map((l, i) => (
              <tr key={i} className="border-t border-border">
                <td className="px-3 py-1.5">
                  <input name="concepto" value={l.concepto} disabled={bloqueado} onChange={(e) => upd(i, "concepto", e.target.value)} className="w-full rounded border border-border bg-surface px-2 py-1 text-fg disabled:opacity-60" />
                </td>
                <td className="px-3 py-1.5"><input name="cantidad" type="number" value={l.cantidad} disabled={bloqueado} onChange={(e) => upd(i, "cantidad", e.target.value)} className="w-full rounded border border-border bg-surface px-2 py-1 text-right text-fg disabled:opacity-60" /></td>
                <td className="px-3 py-1.5"><input name="precio" type="number" step="0.01" value={l.precio} disabled={bloqueado} onChange={(e) => upd(i, "precio", e.target.value)} className="w-full rounded border border-border bg-surface px-2 py-1 text-right text-fg disabled:opacity-60" /></td>
                <td className="px-3 py-1.5"><input name="descuento" type="number" value={l.descuento} disabled={bloqueado} onChange={(e) => upd(i, "descuento", e.target.value)} className="w-full rounded border border-border bg-surface px-2 py-1 text-right text-fg disabled:opacity-60" /></td>
                <td className="px-3 py-1.5 text-right font-mono text-fg">{eur.format(l.cantidad * l.precio * (1 - (l.descuento || 0) / 100))}</td>
                <td className="px-2 py-1.5 text-center">
                  {!bloqueado && <button type="button" onClick={() => setLineas((p) => p.filter((_, idx) => idx !== i))} className="text-error">✕</button>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {!bloqueado && (
        <button type="button" onClick={() => setLineas((p) => [...p, { concepto: "", cantidad: 1, precio: 0, descuento: 0 }])} className="text-sm font-medium text-accent hover:underline">
          + Añadir línea
        </button>
      )}

      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex gap-4">
          <label className="space-y-1 text-sm">
            <span className="block text-fg-muted">Descuento global %</span>
            <input name="descuento_global" type="number" value={descGlobal} disabled={bloqueado} onChange={(e) => setDescGlobal(Number(e.target.value))} className="w-28 rounded-md border border-border bg-surface px-2 py-1.5 text-right text-fg disabled:opacity-60" />
          </label>
          <label className="space-y-1 text-sm">
            <span className="block text-fg-muted">Validez (días)</span>
            <input name="validez_dias" type="number" defaultValue={validezInicial} disabled={bloqueado} className="w-28 rounded-md border border-border bg-surface px-2 py-1.5 text-right text-fg disabled:opacity-60" />
          </label>
        </div>
        <div className="space-y-0.5 text-right text-sm">
          <p className="text-fg-muted">Subtotal: {eur.format(subtotal)}</p>
          {descGlobal > 0 && (
            <p className="text-fg-muted">Base imponible (−{descGlobal}%): {eur.format(base_imponible)}</p>
          )}
          <p className="text-fg-muted">IVA {IVA_TIPO_DEFECTO}%: {eur.format(iva_cuota)}</p>
          <p className="text-xl font-bold text-primary">Total: {eur.format(total)}</p>
        </div>
      </div>

      <label className="block space-y-1 text-sm">
        <span className="text-fg-muted">Condiciones</span>
        <textarea name="condiciones" rows={2} defaultValue={condicionesIniciales ?? ""} disabled={bloqueado} className="w-full rounded-md border border-border bg-surface px-3 py-2 text-fg disabled:opacity-60" />
      </label>

      {!bloqueado && (
        <button type="submit" className="rounded-md bg-primary px-5 py-2 font-medium text-white hover:bg-[var(--color-primary-hover)]">
          Guardar presupuesto
        </button>
      )}
    </form>
  );
}
