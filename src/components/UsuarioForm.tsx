"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import { Field } from "@/components/ui/Field";
import { isValidEmail } from "@/lib/validators/identity";
import type { UsuarioFormState } from "@/app/(panel)/usuarios/actions";
import { OFICINAS, ROLES, ROL_LABEL, type UsuarioDetalle } from "@/lib/types";
import { CredencialPanel } from "@/components/CredencialPanel";

const initial: UsuarioFormState = { ok: false, errors: {} };

export function UsuarioForm({
  action,
  usuario,
}: {
  action: (prev: UsuarioFormState, fd: FormData) => Promise<UsuarioFormState>;
  usuario?: UsuarioDetalle;
}) {
  const [state, formAction, pending] = useActionState(action, initial);
  const [clientErrors, setClientErrors] = useState<Record<string, string>>({});
  const errors = { ...clientErrors, ...state.errors };
  const esEdicion = Boolean(usuario);

  const onBlur: React.FocusEventHandler<HTMLInputElement> = (e) => {
    const { name, value } = e.target;
    let msg = "";
    if (name === "email") {
      if (!value.trim()) msg = "El email es obligatorio.";
      else if (!isValidEmail(value)) msg = "Email inválido.";
    } else if (name === "nombre" && !value.trim()) {
      msg = "El nombre es obligatorio.";
    }
    setClientErrors((prev) => {
      const next = { ...prev };
      if (msg) next[name] = msg;
      else delete next[name];
      return next;
    });
  };

  // Alta completada: mostramos la contraseña generada una sola vez.
  if (state.ok && state.password) {
    return (
      <div className="max-w-2xl space-y-5">
        <CredencialPanel
          titulo="Usuario creado"
          descripcion="Entrega estas credenciales al trabajador. La contraseña no volverá a mostrarse."
          email={usuario?.email}
          password={state.password}
        />
        <Link
          href="/usuarios"
          className="inline-block rounded-md bg-primary px-5 py-2 font-medium text-white hover:bg-[var(--color-primary-hover)]"
        >
          Volver a Usuarios
        </Link>
      </div>
    );
  }

  return (
    <form action={formAction} className="max-w-2xl space-y-5">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Nombre" name="nombre" required defaultValue={usuario?.nombre} error={errors.nombre} onBlur={onBlur} />
        <Field label="Email" name="email" type="email" required defaultValue={usuario?.email} error={errors.email} onBlur={onBlur} placeholder="trabajador@laramarcos.es" />

        <label className="block space-y-1">
          <span className="text-sm font-medium text-fg">Rol <span className="text-error">*</span></span>
          <select
            name="rol"
            defaultValue={usuario?.rol ?? "asesor"}
            className="w-full rounded-md border border-border bg-surface px-3 py-2 text-fg outline-none focus:border-primary"
          >
            {ROLES.map((r) => (
              <option key={r} value={r}>{ROL_LABEL[r]}</option>
            ))}
          </select>
          {errors.rol && <span className="block text-xs text-error">{errors.rol}</span>}
        </label>

        <label className="block space-y-1">
          <span className="text-sm font-medium text-fg">Oficina</span>
          <select
            name="oficina"
            defaultValue={usuario?.oficina ?? ""}
            className="w-full rounded-md border border-border bg-surface px-3 py-2 text-fg outline-none focus:border-primary"
          >
            <option value="">— Sin asignar —</option>
            {OFICINAS.map((o) => (
              <option key={o} value={o}>{o}</option>
            ))}
          </select>
          {errors.oficina && <span className="block text-xs text-error">{errors.oficina}</span>}
        </label>
      </div>

      {!esEdicion && (
        <p className="rounded-md bg-primary-subtle px-3 py-2 text-xs text-primary">
          Se generará una contraseña automáticamente al crear el usuario y se mostrará una sola vez para que la entregues al trabajador.
        </p>
      )}

      {state.message && (
        <p className="text-sm text-error" role="alert">{state.message}</p>
      )}

      <div className="flex gap-3">
        <button
          type="submit"
          disabled={pending}
          className="rounded-md bg-primary px-5 py-2 font-medium text-white hover:bg-[var(--color-primary-hover)] disabled:opacity-60"
        >
          {pending ? "Guardando…" : esEdicion ? "Guardar cambios" : "Crear usuario"}
        </button>
        <Link href="/usuarios" className="rounded-md border border-border px-5 py-2 font-medium text-fg hover:bg-surface-raised">
          Cancelar
        </Link>
      </div>
    </form>
  );
}
