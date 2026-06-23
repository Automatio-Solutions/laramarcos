import Link from "next/link";
import { notFound } from "next/navigation";
import { getPresupuesto } from "@/lib/repos/presupuestos";
import { EditorPresupuesto } from "@/components/EditorPresupuesto";
import {
  guardarPresupuestoAction, enviarPresupuestoAction,
  aceptarManualAction, rechazarPresupuestoAction,
} from "../actions";

const eur = new Intl.NumberFormat("es-ES", { style: "currency", currency: "EUR" });
const ESTADO_COLOR: Record<string, string> = {
  borrador: "bg-neutral-100 text-neutral-700",
  enviado: "bg-info/10 text-info",
  abierto: "bg-accent/10 text-accent",
  aceptado: "bg-success/10 text-success",
  rechazado: "bg-error/10 text-error",
};

export default async function PresupuestoPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const p = await getPresupuesto(id);
  if (!p) notFound();
  const bloqueado = p.estado === "aceptado" || p.estado === "rechazado";

  return (
    <div className="max-w-4xl space-y-6 p-8">
      <header className="flex items-start justify-between">
        <div>
          <Link href="/presupuestos" className="text-sm text-fg-muted hover:underline">← Presupuestos</Link>
          <h1 className="mt-1 text-2xl font-bold text-primary">{p.cliente_nombre ?? "Presupuesto"}</h1>
          <p className="text-sm text-fg-muted">{p.cliente_cif ?? ""} · {eur.format(p.total)}</p>
        </div>
        <div className="flex items-center gap-3">
          <a href={`/imprimir/presupuesto/${p.id}`} target="_blank" rel="noopener" className="rounded-md border border-border px-3 py-1.5 text-sm font-medium text-fg hover:bg-surface-raised">
            📄 PDF
          </a>
          <span className={`rounded-md px-3 py-1 text-sm font-medium capitalize ${ESTADO_COLOR[p.estado]}`}>{p.estado}</span>
        </div>
      </header>

      {p.estado === "aceptado" && p.tarea_id && (
        <p className="rounded-md bg-success/10 px-3 py-2 text-sm text-success">
          ✓ Aceptado. Se creó la <Link href={`/tareas/${p.tarea_id}`} className="font-medium underline">tarea asociada</Link> con sus subtareas.
        </p>
      )}

      <EditorPresupuesto
        id={p.id}
        lineasIniciales={p.lineas}
        descuentoGlobalInicial={p.descuento_global}
        condicionesIniciales={p.condiciones}
        validezInicial={p.validez_dias}
        bloqueado={bloqueado}
        action={guardarPresupuestoAction}
      />

      {!bloqueado && (
        <div className="flex flex-wrap items-center gap-3 border-t border-border pt-4">
          {p.estado === "borrador" && (
            <form action={enviarPresupuestoAction.bind(null, p.id)}>
              <button className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-[var(--color-primary-hover)]">Enviar al cliente</button>
            </form>
          )}
          <form action={aceptarManualAction.bind(null, p.id)}>
            <button className="rounded-md bg-success px-4 py-2 text-sm font-medium text-white">Aceptar (manual)</button>
          </form>
          <form action={rechazarPresupuestoAction.bind(null, p.id)}>
            <button className="rounded-md border border-border px-4 py-2 text-sm font-medium text-error hover:bg-surface-raised">Rechazar</button>
          </form>
          <span className="text-xs text-fg-muted">
            Enlace de aceptación digital: <code className="text-accent">/p/{p.token}</code>
          </span>
        </div>
      )}
    </div>
  );
}
