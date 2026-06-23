"use client";

import { useActionState } from "react";
import Link from "next/link";
import { Field } from "@/components/ui/Field";
import { createTareaAction, type TareaFormState } from "@/app/(panel)/tareas/actions";
import type { Cliente, Usuario } from "@/lib/types";

const initial: TareaFormState = { ok: false, errors: {} };

export function TareaForm({ clientes, asesores }: { clientes: Cliente[]; asesores: Usuario[] }) {
  const [state, action, pending] = useActionState(createTareaAction, initial);

  return (
    <form action={action} className="max-w-xl space-y-5">
      <Field label="Título" name="titulo" required error={state.errors.titulo} />
      <label className="block space-y-1">
        <span className="text-sm font-medium text-fg">Descripción</span>
        <textarea name="descripcion" rows={3} className="w-full rounded-md border border-border bg-surface px-3 py-2 text-fg outline-none focus:border-primary" />
      </label>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block space-y-1">
          <span className="text-sm font-medium text-fg">Cliente</span>
          <select name="cliente_id" className="w-full rounded-md border border-border bg-surface px-3 py-2 text-fg">
            <option value="">— Sin cliente —</option>
            {clientes.map((c) => <option key={c.id} value={c.id}>{c.razon_social}</option>)}
          </select>
        </label>
        <label className="block space-y-1">
          <span className="text-sm font-medium text-fg">Responsable</span>
          <select name="responsable_id" className="w-full rounded-md border border-border bg-surface px-3 py-2 text-fg">
            <option value="">— Yo —</option>
            {asesores.map((a) => <option key={a.id} value={a.id}>{a.nombre}</option>)}
          </select>
        </label>
        <Field label="Categoría" name="categoria" />
        <Field label="Vencimiento" name="vencimiento" type="date" />
      </div>

      <div className="flex gap-3">
        <button type="submit" disabled={pending} className="rounded-md bg-primary px-5 py-2 font-medium text-white hover:bg-[var(--color-primary-hover)] disabled:opacity-60">
          {pending ? "Creando…" : "Crear tarea"}
        </button>
        <Link href="/tareas" className="rounded-md border border-border px-5 py-2 font-medium text-fg hover:bg-surface-raised">Cancelar</Link>
      </div>
    </form>
  );
}
