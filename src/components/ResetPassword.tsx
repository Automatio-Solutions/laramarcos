"use client";

import { useState, useTransition } from "react";
import { resetPasswordAction } from "@/app/(panel)/usuarios/actions";
import { CredencialPanel } from "@/components/CredencialPanel";

export function ResetPassword({ id, email }: { id: string; email: string }) {
  const [pending, startTransition] = useTransition();
  const [password, setPassword] = useState<string | null>(null);
  const [error, setError] = useState("");

  function reset() {
    setError("");
    setPassword(null);
    startTransition(async () => {
      const res = await resetPasswordAction(id);
      if (res.ok && res.password) setPassword(res.password);
      else setError(res.message ?? "No se pudo regenerar la contraseña.");
    });
  }

  return (
    <div className="space-y-3">
      <div>
        <h2 className="text-lg font-semibold text-primary">Contraseña</h2>
        <p className="text-sm text-fg-muted">
          Genera una contraseña nueva si el trabajador la ha perdido. La anterior dejará de funcionar.
        </p>
      </div>
      {password ? (
        <CredencialPanel
          titulo="Contraseña regenerada"
          descripcion="Entrégala al trabajador. No volverá a mostrarse."
          email={email}
          password={password}
        />
      ) : (
        <>
          <button
            type="button"
            onClick={reset}
            disabled={pending}
            className="rounded-md border border-border px-4 py-2 text-sm font-medium text-fg hover:bg-surface-raised disabled:opacity-60"
          >
            {pending ? "Generando…" : "Generar contraseña nueva"}
          </button>
          {error && <p className="text-sm text-error" role="alert">{error}</p>}
        </>
      )}
    </div>
  );
}
