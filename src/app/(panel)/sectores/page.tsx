import { listSectores } from "@/lib/repos/catalogo";
import { createSectorAction, deleteSectorAction } from "./actions";

export default async function SectoresPage() {
  const sectores = await listSectores();

  return (
    <div className="max-w-2xl space-y-6 p-8">
      <header>
        <h1 className="text-2xl font-bold text-primary">Sectores</h1>
        <p className="text-sm text-fg-muted">
          {sectores.length} sectores · determinan las newsletters DOE/BOE (M3)
        </p>
      </header>

      <form action={createSectorAction} className="flex gap-2">
        <input
          name="nombre"
          required
          placeholder="Nuevo sector (ej: Hostelería)"
          className="flex-1 rounded-md border border-border bg-surface px-3 py-2 text-sm text-fg outline-none focus:border-primary"
        />
        <button className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-[var(--color-primary-hover)]">
          Añadir
        </button>
      </form>

      <ul className="divide-y divide-border overflow-hidden rounded-lg border border-border bg-surface">
        {sectores.length === 0 && (
          <li className="px-4 py-10 text-center text-sm text-fg-muted">No hay sectores todavía.</li>
        )}
        {sectores.map((s) => (
          <li key={s.id} className="flex items-center justify-between px-4 py-3">
            <span className="text-sm text-fg">{s.nombre}</span>
            <form action={deleteSectorAction.bind(null, s.id)}>
              <button className="text-sm font-medium text-error hover:underline">Borrar</button>
            </form>
          </li>
        ))}
      </ul>
    </div>
  );
}
