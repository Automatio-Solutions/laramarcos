import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { listUsuarios } from "@/lib/repos/usuarios";
import { ROL_LABEL } from "@/lib/types";
import { UsuarioAcciones } from "@/components/UsuarioAcciones";

export default async function UsuariosPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data: me } = user
    ? await supabase.from("usuarios").select("rol").eq("id", user.id).maybeSingle()
    : { data: null };
  if (!me || (me.rol !== "responsable" && me.rol !== "admin")) redirect("/dashboard");

  const { q } = await searchParams;
  const usuarios = await listUsuarios(q);

  return (
    <div className="space-y-6 p-8">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-primary">Usuarios</h1>
          <p className="text-sm text-fg-muted">{usuarios.length} trabajadores con acceso</p>
        </div>
        <Link
          href="/usuarios/nuevo"
          className="rounded-md bg-primary px-4 py-2 font-medium text-white hover:bg-[var(--color-primary-hover)]"
        >
          + Nuevo usuario
        </Link>
      </header>

      <form className="flex gap-2">
        <input
          name="q"
          defaultValue={q ?? ""}
          placeholder="Buscar por nombre o email…"
          className="w-72 rounded-md border border-border bg-surface px-3 py-2 text-sm text-fg outline-none focus:border-primary"
        />
        <button className="rounded-md border border-border px-4 py-2 text-sm font-medium text-fg hover:bg-surface">
          Buscar
        </button>
      </form>

      <div className="overflow-hidden rounded-lg border border-border bg-surface">
        <table className="w-full text-sm">
          <thead className="bg-surface-raised text-left text-fg-muted">
            <tr>
              <th className="px-4 py-3 font-medium">Nombre</th>
              <th className="px-4 py-3 font-medium">Email</th>
              <th className="px-4 py-3 font-medium">Rol</th>
              <th className="px-4 py-3 font-medium">Oficina</th>
              <th className="px-4 py-3 font-medium">Estado</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {usuarios.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-10 text-center text-fg-muted">
                  No hay usuarios todavía. Crea el primero.
                </td>
              </tr>
            )}
            {usuarios.map((u) => (
              <tr key={u.id} className="border-t border-border hover:bg-surface-raised">
                <td className="px-4 py-3 text-fg">{u.nombre}</td>
                <td className="px-4 py-3 font-mono text-xs text-fg-muted">{u.email}</td>
                <td className="px-4 py-3 text-fg">{ROL_LABEL[u.rol]}</td>
                <td className="px-4 py-3 text-fg-muted">{u.oficina ?? "—"}</td>
                <td className="px-4 py-3">
                  <span
                    className={`rounded-md px-2 py-0.5 text-xs ${
                      u.activo ? "bg-success/10 text-success" : "bg-error/10 text-error"
                    }`}
                  >
                    {u.activo ? "Activo" : "Baja"}
                  </span>
                </td>
                <td className="px-4 py-3 text-right">
                  <UsuarioAcciones id={u.id} activo={u.activo} esYo={u.id === user?.id} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
