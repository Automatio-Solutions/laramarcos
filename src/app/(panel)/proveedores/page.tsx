import Link from "next/link";
import { listProveedores } from "@/lib/repos/catalogo";
import { deleteProveedorAction } from "./actions";

export default async function ProveedoresPage() {
  const proveedores = await listProveedores();

  return (
    <div className="space-y-6 p-8">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-primary">Proveedores</h1>
          <p className="text-sm text-fg-muted">{proveedores.length} registrados</p>
        </div>
        <Link href="/proveedores/nuevo" className="rounded-md bg-primary px-4 py-2 font-medium text-white hover:bg-[var(--color-primary-hover)]">
          + Nuevo proveedor
        </Link>
      </header>

      <div className="overflow-hidden rounded-lg border border-border bg-surface">
        <table className="w-full text-sm">
          <thead className="bg-surface-raised text-left text-fg-muted">
            <tr>
              <th className="px-4 py-3 font-medium">CIF</th>
              <th className="px-4 py-3 font-medium">Nombre</th>
              <th className="px-4 py-3 font-medium">Subcuenta</th>
              <th className="px-4 py-3 font-medium text-right">IVA</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {proveedores.length === 0 && (
              <tr><td colSpan={5} className="px-4 py-10 text-center text-fg-muted">No hay proveedores todavía.</td></tr>
            )}
            {proveedores.map((p) => (
              <tr key={p.id} className="border-t border-border hover:bg-surface-raised">
                <td className="px-4 py-3 font-mono text-xs text-fg">{p.cif}</td>
                <td className="px-4 py-3 font-medium text-fg">{p.nombre}</td>
                <td className="px-4 py-3 font-mono text-xs text-fg-muted">{p.subcuenta_habitual ?? "—"}</td>
                <td className="px-4 py-3 text-right text-fg-muted">{p.iva_default != null ? `${p.iva_default}%` : "—"}</td>
                <td className="px-4 py-3 text-right">
                  <div className="flex justify-end gap-3">
                    <Link href={`/proveedores/${p.id}`} className="text-sm font-medium text-accent hover:underline">Editar</Link>
                    <form action={deleteProveedorAction.bind(null, p.id)}>
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
