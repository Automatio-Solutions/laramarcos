"use client";

import { useActionState } from "react";
import Link from "next/link";
import { generarPresupuestoAction, type GenState } from "@/app/(panel)/presupuestos/actions";
import type { Cliente, Servicio } from "@/lib/types";

const initial: GenState = {};

export function GeneradorPresupuesto({ clientes, servicios }: { clientes: Cliente[]; servicios: Servicio[] }) {
  const [state, action, pending] = useActionState(generarPresupuestoAction, initial);

  return (
    <form action={action} className="max-w-2xl space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block space-y-1">
          <span className="text-sm font-medium text-fg">Cliente</span>
          <select name="cliente_id" className="w-full rounded-md border border-border bg-surface px-3 py-2 text-fg">
            <option value="">— Sin cliente —</option>
            {clientes.map((c) => <option key={c.id} value={c.id}>{c.razon_social}</option>)}
          </select>
        </label>
        <label className="block space-y-1">
          <span className="text-sm font-medium text-fg">Servicio (para plantilla al aceptar)</span>
          <select name="servicio_id" className="w-full rounded-md border border-border bg-surface px-3 py-2 text-fg">
            <option value="">— Ninguno —</option>
            {servicios.map((s) => <option key={s.id} value={s.id}>{s.nombre}</option>)}
          </select>
        </label>
      </div>

      <label className="block space-y-1">
        <span className="text-sm font-medium text-fg">Describe la gestión (lenguaje natural)</span>
        <textarea
          name="texto"
          rows={4}
          required
          placeholder="Ej.: Constitución de SL para Martínez, 3 socios, incluir estatutos y alta en Hacienda."
          className="w-full rounded-md border border-border bg-surface px-3 py-2 text-fg outline-none focus:border-primary"
        />
      </label>

      {state.aviso && <p className="rounded-md bg-warning/10 px-3 py-2 text-sm text-warning">{state.aviso}</p>}

      <div className="flex gap-3">
        <button type="submit" disabled={pending} className="rounded-md bg-primary px-5 py-2 font-medium text-white hover:bg-[var(--color-primary-hover)] disabled:opacity-60">
          {pending ? "Generando…" : "Generar presupuesto"}
        </button>
        <Link href="/presupuestos" className="rounded-md border border-border px-5 py-2 font-medium text-fg hover:bg-surface-raised">Cancelar</Link>
      </div>
      <p className="text-xs text-fg-muted">La IA propone desde el catálogo (Claude si hay API key; si no, coincidencia por catálogo). No inventa precios.</p>
    </form>
  );
}
