"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import { Field } from "@/components/ui/Field";
import { isValidNifCif } from "@/lib/validators/identity";
import type { FormState } from "@/app/(panel)/proveedores/actions";
import type { Proveedor } from "@/lib/types";

const initial: FormState = { ok: false, errors: {} };

export function ProveedorForm({
  action,
  proveedor,
}: {
  action: (prev: FormState, fd: FormData) => Promise<FormState>;
  proveedor?: Proveedor;
}) {
  const [state, formAction, pending] = useActionState(action, initial);
  const [cifError, setCifError] = useState<string>();
  const errors: Record<string, string> = {
    ...state.errors,
    ...(cifError ? { cif: cifError } : {}),
  };

  return (
    <form action={formAction} className="max-w-xl space-y-5">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          label="CIF / NIF"
          name="cif"
          required
          defaultValue={proveedor?.cif}
          error={errors.cif}
          onBlur={(e) =>
            setCifError(
              e.target.value && !isValidNifCif(e.target.value)
                ? "CIF/NIF inválido (dígito de control incorrecto)."
                : undefined,
            )
          }
        />
        <Field label="Nombre" name="nombre" required defaultValue={proveedor?.nombre} error={errors.nombre} />
        <Field label="Subcuenta habitual" name="subcuenta_habitual" defaultValue={proveedor?.subcuenta_habitual} placeholder="600/628/410…" />
        <Field label="IVA por defecto (%)" name="iva_default" defaultValue={proveedor ? String(proveedor.iva_default ?? "") : ""} error={errors.iva_default} placeholder="21" />
      </div>

      {state.message && <p className="text-sm text-error" role="alert">{state.message}</p>}

      <div className="flex gap-3">
        <button type="submit" disabled={pending} className="rounded-md bg-primary px-5 py-2 font-medium text-white hover:bg-[var(--color-primary-hover)] disabled:opacity-60">
          {pending ? "Guardando…" : "Guardar"}
        </button>
        <Link href="/proveedores" className="rounded-md border border-border px-5 py-2 font-medium text-fg hover:bg-surface-raised">Cancelar</Link>
      </div>
    </form>
  );
}
