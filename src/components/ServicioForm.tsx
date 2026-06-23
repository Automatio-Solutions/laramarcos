"use client";

import { useActionState } from "react";
import Link from "next/link";
import { Field } from "@/components/ui/Field";
import type { FormState } from "@/app/(panel)/servicios/actions";
import type { Servicio } from "@/lib/types";

const initial: FormState = { ok: false, errors: {} };

export function ServicioForm({
  action,
  servicio,
}: {
  action: (prev: FormState, fd: FormData) => Promise<FormState>;
  servicio?: Servicio;
}) {
  const [state, formAction, pending] = useActionState(action, initial);

  return (
    <form action={formAction} className="max-w-xl space-y-5">
      <Field label="Nombre" name="nombre" required defaultValue={servicio?.nombre} error={state.errors.nombre} />
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Categoría" name="categoria" defaultValue={servicio?.categoria} />
        <Field label="Precio base (€)" name="precio_base" type="text" defaultValue={servicio ? String(servicio.precio_base) : ""} error={state.errors.precio_base} placeholder="0.00" />
      </div>
      <Field label="Condiciones por defecto" name="condiciones_default" defaultValue={servicio?.condiciones_default} />

      {state.message && <p className="text-sm text-error" role="alert">{state.message}</p>}

      <div className="flex gap-3">
        <button type="submit" disabled={pending} className="rounded-md bg-primary px-5 py-2 font-medium text-white hover:bg-[var(--color-primary-hover)] disabled:opacity-60">
          {pending ? "Guardando…" : "Guardar"}
        </button>
        <Link href="/servicios" className="rounded-md border border-border px-5 py-2 font-medium text-fg hover:bg-surface-raised">
          Cancelar
        </Link>
      </div>
    </form>
  );
}
