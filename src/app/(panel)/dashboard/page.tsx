import { getDashboard } from "@/lib/repos/dashboard";

function Kpi({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div className="rounded-lg border border-border bg-surface p-5">
      <p className="text-sm text-fg-muted">{label}</p>
      <p className={`mt-1 text-3xl font-bold ${tone ?? "text-primary"}`}>{value}</p>
    </div>
  );
}

export default async function DashboardPage() {
  const m = await getDashboard();

  return (
    <div className="space-y-6 p-8">
      <header>
        <h1 className="text-2xl font-bold text-primary">Dashboard de productividad</h1>
        <p className="text-sm text-fg-muted">Carga del equipo, vencidas, tiempo de resolución y cumplimiento de SLA</p>
      </header>

      <div className="grid gap-4 sm:grid-cols-3">
        <Kpi label="Tareas abiertas" value={String(m.totalAbiertas)} />
        <Kpi label="Vencidas" value={String(m.totalVencidas)} tone={m.totalVencidas ? "text-error" : "text-primary"} />
        <Kpi label="Tiempo medio resolución" value={m.tiempoMedioDias != null ? `${m.tiempoMedioDias} d` : "—"} />
      </div>

      <section className="space-y-3">
        <h2 className="font-semibold text-fg">Carga por empleado</h2>
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
              {m.carga.length === 0 && <tr><td colSpan={3} className="px-4 py-8 text-center text-fg-muted">Sin datos.</td></tr>}
              {m.carga.map((c) => (
                <tr key={c.nombre} className="border-t border-border">
                  <td className="px-4 py-2.5 text-fg">{c.nombre}</td>
                  <td className="px-4 py-2.5 text-right text-fg">{c.abiertas}</td>
                  <td className={`px-4 py-2.5 text-right ${c.vencidas ? "text-error" : "text-fg-muted"}`}>{c.vencidas}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
