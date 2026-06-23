import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { listClientes } from "@/lib/repos/clientes";
import { listServicios } from "@/lib/repos/catalogo";
import { createRecurrenteAction, toggleRecurrenteAction, deleteRecurrenteAction } from "./actions";

interface RecRow {
  id: string; periodo_dias: number; proximo: string; activo: boolean;
  cliente: { razon_social: string } | null;
  servicio: { nombre: string } | null;
}

export default async function RecurrentesPage() {
  const supabase = await createClient();
  const [{ data }, clientes, servicios] = await Promise.all([
    supabase.from("presupuestos_recurrentes").select("id, periodo_dias, proximo, activo, cliente:clientes(razon_social), servicio:servicios(nombre)").order("proximo"),
    listClientes(),
    listServicios(),
  ]);
  const recs = (data ?? []) as unknown as RecRow[];

  return (
    <div className="space-y-6 p-8">
      <header className="flex items-center justify-between">
        <div>
          <Link href="/presupuestos" className="text-sm text-fg-muted hover:underline">← Presupuestos</Link>
          <h1 className="mt-1 text-2xl font-bold text-primary">Presupuestos recurrentes</h1>
          <p className="text-sm text-fg-muted">Para servicios fijos: genera un presupuesto cada N días (lo dispara el cron).</p>
        </div>
      </header>

      <form action={createRecurrenteAction} className="flex flex-wrap items-end gap-2 rounded-lg border border-border bg-surface p-4 text-sm">
        <label className="space-y-1">
          <span className="block text-fg-muted">Cliente</span>
          <select name="cliente_id" className="rounded-md border border-border bg-surface px-2 py-2 text-fg">
            <option value="">— Sin cliente —</option>
            {clientes.map((c) => <option key={c.id} value={c.id}>{c.razon_social}</option>)}
          </select>
        </label>
        <label className="space-y-1">
          <span className="block text-fg-muted">Servicio</span>
          <select name="servicio_id" required className="rounded-md border border-border bg-surface px-2 py-2 text-fg">
            <option value="">—</option>
            {servicios.map((s) => <option key={s.id} value={s.id}>{s.nombre}</option>)}
          </select>
        </label>
        <label className="space-y-1">
          <span className="block text-fg-muted">Cada (días)</span>
          <input name="periodo_dias" type="number" defaultValue={90} className="w-24 rounded-md border border-border bg-surface px-2 py-2 text-fg" />
        </label>
        <label className="space-y-1">
          <span className="block text-fg-muted">Próximo</span>
          <input name="proximo" type="date" className="rounded-md border border-border bg-surface px-2 py-2 text-fg" />
        </label>
        <button className="rounded-md bg-primary px-4 py-2 font-medium text-white hover:bg-[var(--color-primary-hover)]">Crear</button>
      </form>

      <div className="overflow-hidden rounded-lg border border-border bg-surface">
        <table className="w-full text-sm">
          <thead className="bg-surface-raised text-left text-fg-muted">
            <tr><th className="px-4 py-3 font-medium">Cliente</th><th className="px-4 py-3 font-medium">Servicio</th><th className="px-4 py-3 font-medium">Cada</th><th className="px-4 py-3 font-medium">Próximo</th><th className="px-4 py-3 font-medium">Estado</th><th /></tr>
          </thead>
          <tbody>
            {recs.length === 0 && <tr><td colSpan={6} className="px-4 py-8 text-center text-fg-muted">Sin recurrencias.</td></tr>}
            {recs.map((r) => (
              <tr key={r.id} className="border-t border-border">
                <td className="px-4 py-2.5 text-fg">{r.cliente?.razon_social ?? "—"}</td>
                <td className="px-4 py-2.5 text-fg">{r.servicio?.nombre ?? "—"}</td>
                <td className="px-4 py-2.5 text-fg-muted">{r.periodo_dias} d</td>
                <td className="px-4 py-2.5 text-fg-muted">{new Date(r.proximo).toLocaleDateString("es-ES")}</td>
                <td className="px-4 py-2.5">{r.activo ? <span className="text-success">activa</span> : <span className="text-fg-muted">pausada</span>}</td>
                <td className="px-4 py-2.5 text-right">
                  <div className="flex justify-end gap-3">
                    <form action={toggleRecurrenteAction.bind(null, r.id, r.activo)}><button className="text-xs text-accent hover:underline">{r.activo ? "Pausar" : "Activar"}</button></form>
                    <form action={deleteRecurrenteAction.bind(null, r.id)}><button className="text-xs text-error hover:underline">Borrar</button></form>
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
