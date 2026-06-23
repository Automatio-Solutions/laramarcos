import Link from "next/link";
import { listClientes } from "@/lib/repos/clientes";

export default async function ClientesPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q } = await searchParams;
  const clientes = await listClientes(q);

  return (
    <div className="space-y-6 p-8">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-primary">Clientes</h1>
          <p className="text-sm text-fg-muted">{clientes.length} en cartera</p>
        </div>
        <Link
          href="/clientes/nuevo"
          className="rounded-md bg-primary px-4 py-2 font-medium text-white hover:bg-[var(--color-primary-hover)]"
        >
          + Nuevo cliente
        </Link>
      </header>

      <form className="flex gap-2">
        <input
          name="q"
          defaultValue={q ?? ""}
          placeholder="Buscar por nombre o CIF…"
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
              <th className="px-4 py-3 font-medium">CIF/NIF</th>
              <th className="px-4 py-3 font-medium">Razón social</th>
              <th className="px-4 py-3 font-medium">Sectores</th>
              <th className="px-4 py-3 font-medium">Asesor</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {clientes.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-10 text-center text-fg-muted">
                  No hay clientes todavía. Crea el primero o importa tu cartera.
                </td>
              </tr>
            )}
            {clientes.map((c) => (
              <tr key={c.id} className="border-t border-border hover:bg-surface-raised">
                <td className="px-4 py-3 font-mono text-xs text-fg">{c.cif}</td>
                <td className="px-4 py-3 text-fg">{c.razon_social}</td>
                <td className="px-4 py-3">
                  <div className="flex flex-wrap gap-1">
                    {c.sectores.map((s) => (
                      <span key={s.id} className="rounded-md bg-primary-subtle px-2 py-0.5 text-xs text-primary">
                        {s.nombre}
                      </span>
                    ))}
                  </div>
                </td>
                <td className="px-4 py-3 text-fg-muted">{c.asesor_nombre ?? "—"}</td>
                <td className="px-4 py-3 text-right">
                  <Link href={`/clientes/${c.id}`} className="text-sm font-medium text-accent hover:underline">
                    Editar
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
