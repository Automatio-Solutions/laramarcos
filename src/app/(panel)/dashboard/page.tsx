import Link from "next/link";
import { CargaRow } from "@/components/CargaRow";
import { getDashboard } from "@/lib/repos/dashboard";

function Kpi({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div className="rounded-lg border border-border bg-surface p-5">
      <p className="text-sm text-fg-muted">{label}</p>
      <p className={`mt-1 text-3xl font-bold ${tone ?? "text-primary"}`}>{value}</p>
    </div>
  );
}

const ymd = (d: Date) => d.toISOString().slice(0, 10);

export default async function DashboardPage({ searchParams }: { searchParams: Promise<{ desde?: string; hasta?: string }> }) {
  const sp = await searchParams;
  const now = new Date();
  const y = now.getUTCFullYear(), mo = now.getUTCMonth();

  // Rango por defecto: este mes
  const desde = sp.desde ?? ymd(new Date(Date.UTC(y, mo, 1)));
  const hasta = sp.hasta ?? ymd(new Date(Date.UTC(y, mo + 1, 0)));

  // Presets
  const presets: { label: string; desde: string; hasta: string }[] = [
    { label: "Hoy", desde: ymd(now), hasta: ymd(now) },
    { label: "Este mes", desde: ymd(new Date(Date.UTC(y, mo, 1))), hasta: ymd(new Date(Date.UTC(y, mo + 1, 0))) },
    { label: "Mes pasado", desde: ymd(new Date(Date.UTC(y, mo - 1, 1))), hasta: ymd(new Date(Date.UTC(y, mo, 0))) },
    { label: "Este año", desde: ymd(new Date(Date.UTC(y, 0, 1))), hasta: ymd(new Date(Date.UTC(y, 11, 31))) },
    { label: "Todo", desde: "2000-01-01", hasta: ymd(new Date(Date.UTC(y + 1, 0, 1))) },
  ];
  const activo = (p: { desde: string; hasta: string }) => p.desde === desde && p.hasta === hasta;

  const m = await getDashboard(desde, hasta);

  return (
    <div className="space-y-6 p-8">
      <header>
        <h1 className="text-2xl font-bold text-primary">Dashboard de productividad</h1>
        <p className="text-sm text-fg-muted">
          Periodo: {new Date(desde).toLocaleDateString("es-ES")} – {new Date(hasta).toLocaleDateString("es-ES")}
        </p>
      </header>

      {/* Filtro de fechas */}
      <div className="flex flex-wrap items-end gap-3">
        <div className="flex flex-wrap gap-1">
          {presets.map((p) => (
            <Link
              key={p.label}
              href={`/dashboard?desde=${p.desde}&hasta=${p.hasta}`}
              className={`rounded-md border px-3 py-1.5 text-sm ${activo(p) ? "border-primary bg-primary text-white" : "border-border bg-surface text-fg hover:bg-surface-raised"}`}
            >
              {p.label}
            </Link>
          ))}
        </div>
        <form className="flex items-end gap-2 text-sm">
          <label className="space-y-1">
            <span className="block text-fg-muted">Desde</span>
            <input type="date" name="desde" defaultValue={desde} className="rounded-md border border-border bg-surface px-2 py-1.5 text-fg" />
          </label>
          <label className="space-y-1">
            <span className="block text-fg-muted">Hasta</span>
            <input type="date" name="hasta" defaultValue={hasta} className="rounded-md border border-border bg-surface px-2 py-1.5 text-fg" />
          </label>
          <button className="rounded-md border border-border px-3 py-1.5 font-medium text-fg hover:bg-surface-raised">Aplicar</button>
        </form>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <Kpi label="Tareas creadas" value={String(m.totalPeriodo)} />
        <Kpi label="Abiertas" value={String(m.abiertas)} />
        <Kpi label="Completadas" value={String(m.completadasPeriodo)} tone="text-success" />
        <Kpi label="Vencidas" value={String(m.totalVencidas)} tone={m.totalVencidas ? "text-error" : "text-primary"} />
        <Kpi label="Tiempo medio resolución" value={m.tiempoMedioDias != null ? `${m.tiempoMedioDias} d` : "—"} />
      </div>

      <section className="space-y-3">
        <div className="flex items-baseline gap-3">
          <h2 className="font-semibold text-fg">Carga por empleado</h2>
          <span className="text-xs text-fg-muted">Pincha en un empleado para ver sus tareas</span>
        </div>
        <div className="overflow-hidden rounded-lg border border-border bg-surface">
          <table className="w-full text-sm">
            <thead className="bg-surface-raised text-left text-fg-muted">
              <tr>
                <th className="px-4 py-3 font-medium">Empleado</th>
                <th className="px-4 py-3 font-medium text-right">Abiertas</th>
                <th className="px-4 py-3 font-medium text-right">Vencidas</th>
              </tr>
            </thead>
            <tbody>
              {m.carga.length === 0 && <tr><td colSpan={3} className="px-4 py-8 text-center text-fg-muted">Sin datos en este periodo.</td></tr>}
              {m.carga.map((c) => (
                <CargaRow key={c.nombre} carga={c} />
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
