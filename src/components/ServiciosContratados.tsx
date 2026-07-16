import {
  contratarServicioAction,
  cambiarCuotaAction,
  finalizarServicioAction,
  eliminarServicioContratadoAction,
} from "@/app/(panel)/clientes/actions";
import type { ServicioContratado } from "@/lib/types";

const eur = new Intl.NumberFormat("es-ES", { style: "currency", currency: "EUR" });
const fecha = (d: string) => new Date(d).toLocaleDateString("es-ES");
const hoy = () => new Date().toISOString().slice(0, 10);

/** Variación porcentual respecto a la cuota anterior, para leer la evolución de un vistazo. */
function variacion(actual: number, anterior: number): string | null {
  if (!anterior) return null;
  const pct = ((actual - anterior) / anterior) * 100;
  if (Math.abs(pct) < 0.05) return null;
  return `${pct > 0 ? "▲" : "▼"} ${Math.abs(pct).toFixed(1)}%`;
}

/**
 * Servicios que el cliente tiene contratados, con su fecha de inicio, la cuota
 * vigente y el histórico completo de cambios de precio (evolución de la cuota).
 */
export function ServiciosContratados({
  clienteId,
  servicios,
  catalogo,
}: {
  clienteId: string;
  servicios: ServicioContratado[];
  catalogo: { id: string; nombre: string }[];
}) {
  return (
    <section className="space-y-4 border-t border-border pt-6">
      <h2 className="text-lg font-semibold text-primary">Servicios contratados</h2>

      {servicios.length === 0 && (
        <p className="text-sm text-fg-muted">Este cliente no tiene servicios contratados todavía.</p>
      )}

      <div className="space-y-4">
        {servicios.map((s) => (
          <article key={s.id} className={`rounded-lg border border-border bg-surface p-4 ${s.fecha_fin ? "opacity-70" : ""}`}>
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <div>
                <h3 className="font-medium text-fg">
                  {s.servicio_nombre}
                  {s.fecha_fin && (
                    <span className="ml-2 rounded bg-error/10 px-1.5 py-0.5 text-[11px] font-medium text-error">
                      Finalizado {fecha(s.fecha_fin)}
                    </span>
                  )}
                </h3>
                <p className="text-xs text-fg-muted">Desde {fecha(s.fecha_inicio)}</p>
              </div>
              <p className="text-right">
                <span className="text-lg font-bold text-primary">
                  {s.cuotaActual != null ? eur.format(s.cuotaActual) : "—"}
                </span>
                <span className="block text-xs text-fg-muted">cuota actual</span>
              </p>
            </div>

            {/* Evolución de la cuota */}
            {s.cuotas.length > 0 && (
              <div className="mt-3">
                <p className="mb-1 text-xs font-medium text-fg">Evolución de la cuota</p>
                <ul className="space-y-1 border-l-2 border-border pl-3 text-sm">
                  {s.cuotas.map((c, i) => {
                    const anterior = s.cuotas[i + 1];
                    const v = anterior ? variacion(c.importe, anterior.importe) : null;
                    const futura = c.fecha_efecto > hoy();
                    return (
                      <li key={c.id} className="flex flex-wrap items-center gap-2">
                        <span className="font-medium text-fg">{eur.format(c.importe)}</span>
                        <span className="text-xs text-fg-muted">desde {fecha(c.fecha_efecto)}</span>
                        {v && <span className={`text-xs ${v.startsWith("▲") ? "text-error" : "text-success"}`}>{v}</span>}
                        {futura && <span className="rounded bg-info/10 px-1.5 text-[11px] text-info">programada</span>}
                        {c.nota && <span className="text-xs text-fg-muted">· {c.nota}</span>}
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}

            {/* Cambiar cuota */}
            {!s.fecha_fin && (
              <form action={cambiarCuotaAction.bind(null, clienteId, s.id)} className="mt-3 flex flex-wrap items-end gap-2">
                <input name="importe" type="number" step="0.01" min="0" required placeholder="Nueva cuota €"
                  className="w-32 rounded-md border border-border bg-surface px-2 py-1.5 text-sm text-fg" />
                <input name="fecha_efecto" type="date" defaultValue={hoy()}
                  className="rounded-md border border-border bg-surface px-2 py-1.5 text-sm text-fg" />
                <input name="nota" placeholder="Motivo (opcional)"
                  className="w-44 rounded-md border border-border bg-surface px-2 py-1.5 text-sm text-fg" />
                <button className="rounded-md border border-border px-3 py-1.5 text-sm font-medium text-fg hover:bg-surface-raised">
                  Cambiar cuota
                </button>
              </form>
            )}

            <div className="mt-2 flex flex-wrap items-end gap-3">
              {!s.fecha_fin && (
                <form action={finalizarServicioAction.bind(null, clienteId, s.id)} className="flex items-end gap-2">
                  <input name="fecha_fin" type="date" defaultValue={hoy()}
                    className="rounded-md border border-border bg-surface px-2 py-1 text-xs text-fg" />
                  <button className="text-xs text-fg-muted hover:underline">Finalizar servicio</button>
                </form>
              )}
              <form action={eliminarServicioContratadoAction.bind(null, clienteId, s.id)}>
                <button className="text-xs text-error hover:underline">Eliminar</button>
              </form>
            </div>
          </article>
        ))}
      </div>

      {/* Contratar un servicio nuevo */}
      <form action={contratarServicioAction.bind(null, clienteId)} className="flex flex-wrap items-end gap-2 rounded-lg border border-border bg-surface-raised p-3">
        <label className="space-y-1">
          <span className="block text-xs font-medium text-fg">Servicio</span>
          <select name="servicio_id" required className="rounded-md border border-border bg-surface px-2 py-1.5 text-sm text-fg">
            <option value="">— Elegir —</option>
            {catalogo.map((s) => <option key={s.id} value={s.id}>{s.nombre}</option>)}
          </select>
        </label>
        <label className="space-y-1">
          <span className="block text-xs font-medium text-fg">Fecha de inicio</span>
          <input name="fecha_inicio" type="date" defaultValue={hoy()}
            className="rounded-md border border-border bg-surface px-2 py-1.5 text-sm text-fg" />
        </label>
        <label className="space-y-1">
          <span className="block text-xs font-medium text-fg">Cuota €</span>
          <input name="importe" type="number" step="0.01" min="0" placeholder="90.00"
            className="w-28 rounded-md border border-border bg-surface px-2 py-1.5 text-sm text-fg" />
        </label>
        <button className="rounded-md bg-primary px-4 py-1.5 text-sm font-medium text-white hover:bg-[var(--color-primary-hover)]">
          Contratar
        </button>
      </form>
    </section>
  );
}
