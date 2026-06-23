import Link from "next/link";
import { listServicios } from "@/lib/repos/catalogo";
import { deleteServicioAction } from "./actions";

const eur = new Intl.NumberFormat("es-ES", { style: "currency", currency: "EUR" });

export default async function ServiciosPage() {
  const servicios = await listServicios();

  return (
    <div className="space-y-6 p-8">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-primary">Servicios</h1>
          <p className="text-sm text-fg-muted">{servicios.length} en catálogo</p>
        </div>
        <Link href="/servicios/nuevo" className="rounded-md bg-primary px-4 py-2 font-medium text-white hover:bg-[var(--color-primary-hover)]">
          + Nuevo servicio
        </Link>
      </header>

      <div className="overflow-hidden rounded-lg border border-border bg-surface">
        <table className="w-full text-sm">
          <thead className="bg-surface-raised text-left text-fg-muted">
            <tr>
              <th className="px-4 py-3 font-medium">Servicio</th>
              <th className="px-4 py-3 font-medium">Categoría</th>
              <th className="px-4 py-3 font-medium text-right">Precio base</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {servicios.length === 0 && (
              <tr><td colSpan={4} className="px-4 py-10 text-center text-fg-muted">No hay servicios todavía.</td></tr>
            )}
            {servicios.map((s) => (
              <tr key={s.id} className="border-t border-border hover:bg-surface-raised">
                <td className="px-4 py-3 font-medium text-fg">{s.nombre}</td>
                <td className="px-4 py-3 text-fg-muted">{s.categoria ?? "—"}</td>
                <td className="px-4 py-3 text-right font-mono text-fg">{eur.format(s.precio_base)}</td>
                <td className="px-4 py-3 text-right">
                  <div className="flex justify-end gap-3">
                    <Link href={`/servicios/${s.id}/plantilla`} className="text-sm font-medium text-fg-muted hover:underline">Plantilla</Link>
                    <Link href={`/servicios/${s.id}`} className="text-sm font-medium text-accent hover:underline">Editar</Link>
                    <form action={deleteServicioAction.bind(null, s.id)}>
                      <button className="text-sm font-medium text-error hover:underline">Borrar</button>
                    </form>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
