"use client";

import { useActionState } from "react";
import { Logo } from "@/components/Logo";
import { loginAction, type LoginState } from "./actions";

const initial: LoginState = {};

export default function LoginPage() {
  const [state, action, pending] = useActionState(loginAction, initial);

  return (
    <main className="flex min-h-screen items-center justify-center bg-surface-raised px-4">
      <form
        action={action}
        className="w-full max-w-sm space-y-5 rounded-lg border border-border bg-surface p-8 shadow-sm"
      >
        <div className="space-y-3 text-center">
          <Logo className="mx-auto h-14 w-auto text-primary" />
          <p className="text-sm text-fg-muted">Accede al panel de gestión</p>
        </div>

        <label className="block space-y-1">
          <span className="text-sm font-medium text-fg">Email</span>
          <input
            type="email"
            name="email"
            required
            autoComplete="email"
            className="w-full rounded-md border border-border bg-surface px-3 py-2 text-fg outline-none focus:border-primary"
          />
        </label>

        <label className="block space-y-1">
          <span className="text-sm font-medium text-fg">Contraseña</span>
          <input
            type="password"
            name="password"
            required
            autoComplete="current-password"
            className="w-full rounded-md border border-border bg-surface px-3 py-2 text-fg outline-none focus:border-primary"
          />
        </label>

        {state.error && (
          <p className="text-sm text-error" role="alert">
            {state.error}
          </p>
        )}

        <button
          type="submit"
          disabled={pending}
          className="w-full rounded-md bg-primary px-4 py-2 font-medium text-white hover:bg-[var(--color-primary-hover)] disabled:opacity-60"
        >
          {pending ? "Entrando…" : "Entrar"}
        </button>
      </form>
    </main>
  );
}
