import Link from "next/link";
import { listPresupuestos } from "@/lib/repos/presupuestos";

const eur = new Intl.NumberFormat("es-ES", { style: "currency", currency: "EUR" });
const ESTADO_COLOR: Record<string, string> = {
  borrador: "bg-neutral-100 text-neutral-700",
  enviado: "bg-info/10 text-info",
  abierto: "bg-accent/10 text-accent",
  aceptado: "bg-success/10 text-success",
  rechazado: "bg-error/10 text-error",
};

export default async function PresupuestosPage() {
  const presupuestos = await listPresupuestos();
  const aceptados = presupuestos.filter((p) => p.estado === "aceptado").length;

  return (
    <div className="space-y-6 p-8">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-primary">Presupuestos</h1>
          <p className="text-sm text-fg-muted">{presupuestos.length} en total · {aceptados} aceptados</p>
        </div>
        <Link href="/presupuestos/nuevo" className="rounded-md bg-primary px-4 py-2 font-medium text-white hover:bg-[var(--color-primary-hover)]">
          + Nuevo presupuesto
        </Link>
      </header>

      <div className="overflow-hidden rounded-lg border border-border bg-surface">
        <table className="w-full text-sm">
          <thead className="bg-surface-raised text-left text-fg-muted">
            <tr>
              <th className="px-4 py-3 font-medium">Cliente</th>
              <th className="px-4 py-3 font-medium text-right">Total</th>
              <th className="px-4 py-3 font-medium">Estado</th>
              <th className="px-4 py-3 font-medium">Fecha</th>
            </tr>
          </thead>
          <tbody>
            {presupuestos.length === 0 && <tr><td colSpan={4} className="px-4 py-10 text-center text-fg-muted">No hay presupuestos. Crea el primero desde texto libre.</td></tr>}
            {presupuestos.map((p) => (
              <tr key={p.id} className="border-t border-border hover:bg-surface-raised">
                <td className="px-4 py-3"><Link href={`/presupuestos/${p.id}`} className="font-medium text-fg hover:text-accent">{p.cliente_nombre ?? "(sin cliente)"}</Link></td>
                <td className="px-4 py-3 text-right font-mono text-fg">{eur.format(p.total)}</td>
                <td className="px-4 py-3"><span className={`rounded-md px-2 py-0.5 text-xs font-medium capitalize ${ESTADO_COLOR[p.estado]}`}>{p.estado}</span></td>
                <td className="px-4 py-3 text-fg-muted">{new Date(p.created_at).toLocaleDateString("es-ES")}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
