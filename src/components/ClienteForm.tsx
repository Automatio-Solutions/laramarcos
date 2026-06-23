"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import { Field } from "@/components/ui/Field";
import { isValidNifCif, isValidIban, isValidEmail } from "@/lib/validators/identity";
import type { ClienteFormState } from "@/app/(panel)/clientes/actions";
import type { ClienteConRelaciones, Sector, Usuario } from "@/lib/types";

const initial: ClienteFormState = { ok: false, errors: {} };

type ClientErrors = Record<string, string>;

export function ClienteForm({
  action,
  sectores,
  asesores,
  cliente,
}: {
  action: (prev: ClienteFormState, fd: FormData) => Promise<ClienteFormState>;
  sectores: Sector[];
  asesores: Usuario[];
  cliente?: ClienteConRelaciones;
}) {
  const [state, formAction, pending] = useActionState(action, initial);
  const [clientErrors, setClientErrors] = useState<ClientErrors>({});
  const errors = { ...clientErrors, ...state.errors };

  function validateField(name: string, value: string) {
    let msg = "";
    if (name === "cif") {
      if (!value.trim()) msg = "El CIF/NIF es obligatorio.";
      else if (!isValidNifCif(value)) msg = "CIF/NIF inválido (dígito de control incorrecto).";
    } else if (name === "iban" && value.trim() && !isValidIban(value)) {
      msg = "IBAN inválido (no supera la validación módulo 97).";
    } else if (name === "email" && value.trim() && !isValidEmail(value)) {
      msg = "Email inválido.";
    }
    setClientErrors((prev) => {
      const next = { ...prev };
      if (msg) next[name] = msg;
      else delete next[name];
      return next;
    });
  }

  const onBlur: React.FocusEventHandler<HTMLInputElement> = (e) =>
    validateField(e.target.name, e.target.value);

  const selectedSectores = new Set(cliente?.sectores.map((s) => s.id));

  return (
    <form action={formAction} className="max-w-2xl space-y-5">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="CIF / NIF" name="cif" required defaultValue={cliente?.cif} error={errors.cif} onBlur={onBlur} placeholder="B12345678" />
        <Field label="Razón social" name="razon_social" required defaultValue={cliente?.razon_social} error={errors.razon_social} onBlur={onBlur} />
        <Field label="Email" name="email" type="email" defaultValue={cliente?.email} error={errors.email} onBlur={onBlur} />
        <Field label="Teléfono" name="telefono" defaultValue={cliente?.telefono} onBlur={onBlur} />
        <Field label="IBAN" name="iban" defaultValue={cliente?.iban} error={errors.iban} onBlur={onBlur} placeholder="ES91 2100 0418 4502 0005 1332" />
        <Field label="Condiciones de pago" name="condiciones_pago" defaultValue={cliente?.condiciones_pago} onBlur={onBlur} />
      </div>

      <Field label="Dirección" name="direccion" defaultValue={cliente?.direccion} onBlur={onBlur} />

      <label className="block space-y-1">
        <span className="text-sm font-medium text-fg">Asesor asignado</span>
        <select
          name="asesor_id"
          defaultValue={cliente?.asesor_id ?? ""}
          className="w-full rounded-md border border-border bg-surface px-3 py-2 text-fg outline-none focus:border-primary"
        >
          <option value="">— Yo (por defecto) —</option>
          {asesores.map((a) => (
            <option key={a.id} value={a.id}>
              {a.nombre} ({a.rol})
            </option>
          ))}
        </select>
      </label>

      <fieldset className="space-y-2">
        <legend className="text-sm font-medium text-fg">Sectores</legend>
        <div className="flex flex-wrap gap-2">
          {sectores.map((s) => (
            <label key={s.id} className="flex items-center gap-2 rounded-md border border-border bg-surface px-3 py-1.5 text-sm text-fg has-checked:border-primary has-checked:bg-primary-subtle">
              <input type="checkbox" name="sector_ids" value={s.id} defaultChecked={selectedSectores.has(s.id)} />
              {s.nombre}
            </label>
          ))}
        </div>
      </fieldset>

      {state.message && (
        <p className="text-sm text-error" role="alert">{state.message}</p>
      )}

      <div className="flex gap-3">
        <button
          type="submit"
          disabled={pending}
          className="rounded-md bg-primary px-5 py-2 font-medium text-white hover:bg-[var(--color-primary-hover)] disabled:opacity-60"
        >
          {pending ? "Guardando…" : "Guardar"}
        </button>
        <Link href="/clientes" className="rounded-md border border-border px-5 py-2 font-medium text-fg hover:bg-surface-raised">
          Cancelar
        </Link>
      </div>
    </form>
  );
}
