import Link from "next/link";
import { notFound } from "next/navigation";
import { ClienteForm } from "@/components/ClienteForm";
import { getCliente, listSectores, listAsesores } from "@/lib/repos/clientes";
import { getClienteHistorico } from "@/lib/repos/cliente-historico";
import { ESTADO_LABEL } from "@/lib/estados";
import { updateClienteAction } from "../actions";

const eur = new Intl.NumberFormat("es-ES", { style: "currency", currency: "EUR" });

export default async function EditarClientePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [cliente, sectores, asesores, hist] = await Promise.all([
    getCliente(id),
    listSectores(),
    listAsesores(),
    getClienteHistorico(id),
  ]);

  if (!cliente) notFound();

  const action = updateClienteAction.bind(null, id);

  return (
    <div className="space-y-6 p-8">
      <header>
        <Link href="/clientes" className="text-sm text-fg-muted hover:underline">
          ← Clientes
        </Link>
        <h1 className="mt-1 text-2xl font-bold text-primary">{cliente.razon_social}</h1>
        <p className="font-mono text-xs text-fg-muted">{cliente.cif}</p>
      </header>
      <ClienteForm action={action} sectores={sectores} asesores={asesores} cliente={cliente} />

      {/* Ficha 360 — histórico del cliente (UC-112) */}
      <section className="space-y-4 border-t border-border pt-6">
        <div className="flex items-center gap-6">
          <h2 className="text-lg font-semibold text-primary">Ficha 360</h2>
          <span className="text-sm text-fg-muted">Facturado: <strong className="text-fg">{eur.format(hist.totalFacturado)}</strong></span>
          <span className="text-sm text-fg-muted">Pendiente: <strong className="text-warning">{eur.format(hist.totalPendiente)}</strong></span>
        </div>

        <div className="grid gap-6 lg:grid-cols-2">
          <div>
            <h3 className="mb-2 text-sm font-medium text-fg">Tareas ({hist.tareas.length})</h3>
            <ul className="divide-y divide-border rounded-lg border border-border bg-surface text-sm">
              {hist.tareas.length === 0 && <li className="px-3 py-4 text-center text-fg-muted">Sin tareas.</li>}
              {hist.tareas.map((t) => (
                <li key={t.id} className="flex items-center justify-between px-3 py-2">
                  <Link href={`/tareas/${t.id}`} className="text-fg hover:text-accent">{t.titulo}</Link>
                  <span className="text-xs text-fg-muted">{ESTADO_LABEL[t.estado as keyof typeof ESTADO_LABEL] ?? t.estado}</span>
                </li>
              ))}
            </ul>
          </div>
          <div>
            <h3 className="mb-2 text-sm font-medium text-fg">Líneas de factura ({hist.lineas.length})</h3>
            <ul className="divide-y divide-border rounded-lg border border-border bg-surface text-sm">
              {hist.lineas.length === 0 && <li className="px-3 py-4 text-center text-fg-muted">Sin líneas.</li>}
              {hist.lineas.map((l) => (
                <li key={l.id} className="flex items-center justify-between px-3 py-2">
                  <span className="text-fg">{l.concepto}</span>
                  <span className="text-xs">{eur.format(Number(l.importe))} {l.facturada ? "✓" : "⏳"}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
        <p className="text-xs text-fg-muted">Presupuestos (M2) y facturas OCR (M4) aparecerán aquí al implementar esos módulos.</p>
      </section>
    </div>
  );
}
