import Link from "next/link";
import { listClientes, listSectores, listServiciosCatalogo } from "@/lib/repos/clientes";
import { ClienteRow } from "@/components/ClienteRow";

export default async function ClientesPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; sector?: string; servicio?: string }>;
}) {
  const { q, sector, servicio } = await searchParams;
  const [clientes, sectores, servicios] = await Promise.all([
    listClientes({ q, sector, servicio }),
    listSectores(),
    listServiciosCatalogo(),
  ]);

  const filtrando = Boolean(q || sector || servicio);

  return (
    <div className="space-y-6 p-8">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-primary">Clientes</h1>
          <p className="text-sm text-fg-muted">
            {clientes.length} {filtrando ? "encontrados" : "en cartera"}
          </p>
        </div>
        <Link
          href="/clientes/nuevo"
          className="rounded-md bg-primary px-4 py-2 font-medium text-white hover:bg-[var(--color-primary-hover)]"
        >
          + Nuevo cliente
        </Link>
      </header>

      {/* Etiquetado: búsqueda + sector + servicio contratado */}
      <form className="flex flex-wrap items-center gap-2">
        <input
          name="q"
          defaultValue={q ?? ""}
          placeholder="Buscar por nombre o CIF…"
          className="w-64 rounded-md border border-border bg-surface px-3 py-2 text-sm text-fg outline-none focus:border-primary"
        />
        <select name="sector" defaultValue={sector ?? ""} className="rounded-md border border-border bg-surface px-2 py-2 text-sm text-fg">
          <option value="">Sector</option>
          {sectores.map((s) => <option key={s.id} value={s.id}>{s.nombre}</option>)}
        </select>
        <select name="servicio" defaultValue={servicio ?? ""} className="rounded-md border border-border bg-surface px-2 py-2 text-sm text-fg">
          <option value="">Servicio contratado</option>
          {servicios.map((s) => <option key={s.id} value={s.id}>{s.nombre}</option>)}
        </select>
        <button className="rounded-md border border-border px-4 py-2 text-sm font-medium text-fg hover:bg-surface-raised">
          Filtrar
        </button>
        {filtrando && (
          <Link href="/clientes" className="text-sm text-fg-muted hover:underline">Limpiar</Link>
        )}
      </form>

      <div className="overflow-hidden rounded-lg border border-border bg-surface">
        <table className="w-full text-sm">
          <thead className="bg-surface-raised text-left text-fg-muted">
            <tr>
              <th className="px-4 py-3 font-medium">CIF/NIF</th>
              <th className="px-4 py-3 font-medium">Razón social</th>
              <th className="px-4 py-3 font-medium">Sectores</th>
              <th className="px-4 py-3 font-medium">Servicios</th>
              <th className="px-4 py-3 font-medium">Oficina</th>
              <th className="px-4 py-3 font-medium">Asesor</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {clientes.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-10 text-center text-fg-muted">
                  {filtrando
                    ? "Ningún cliente coincide con el filtro."
                    : "No hay clientes todavía. Crea el primero o importa tu cartera."}
                </td>
              </tr>
            )}
            {clientes.map((c) => (
              <ClienteRow key={c.id} cliente={c} />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
