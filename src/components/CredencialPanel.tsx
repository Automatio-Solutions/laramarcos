"use client";

import { useState } from "react";

export function CredencialPanel({
  titulo,
  descripcion,
  email,
  password,
}: {
  titulo: string;
  descripcion?: string;
  email?: string;
  password: string;
}) {
  const [copiado, setCopiado] = useState(false);

  async function copiar() {
    const texto = email ? `Email: ${email}\nContraseña: ${password}` : password;
    try {
      await navigator.clipboard.writeText(texto);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2000);
    } catch {
      /* clipboard no disponible: el usuario puede copiar manualmente */
    }
  }

  return (
    <div className="space-y-3 rounded-lg border border-success/40 bg-success/5 p-4">
      <div>
        <h3 className="text-sm font-semibold text-fg">{titulo}</h3>
        {descripcion && <p className="text-xs text-fg-muted">{descripcion}</p>}
      </div>
      <div className="space-y-1 text-sm">
        {email && (
          <div className="flex gap-2">
            <span className="w-24 text-fg-muted">Email</span>
            <span className="font-mono text-fg">{email}</span>
          </div>
        )}
        <div className="flex gap-2">
          <span className="w-24 text-fg-muted">Contraseña</span>
          <span className="font-mono font-semibold text-fg">{password}</span>
        </div>
      </div>
      <button
        type="button"
        onClick={copiar}
        className="rounded-md border border-border bg-surface px-3 py-1.5 text-sm font-medium text-fg hover:bg-surface-raised"
      >
        {copiado ? "✓ Copiado" : "Copiar credenciales"}
      </button>
    </div>
  );
}
