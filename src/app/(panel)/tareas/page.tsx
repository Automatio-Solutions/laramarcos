import Link from "next/link";
import { listTareas, type TareaFiltros } from "@/lib/repos/tareas";
import { listClientes, listAsesores } from "@/lib/repos/clientes";
import { KanbanBoard } from "@/components/KanbanBoard";
import { ESTADOS, ESTADO_LABEL } from "@/lib/estados";
import type { TareaConRelaciones } from "@/lib/types";

type View = "kanban" | "lista" | "calendario";
type SP = TareaFiltros & { view?: View };

export default async function TareasPage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const view: View = sp.view ?? "kanban";
  const [tareas, clientes, asesores] = await Promise.all([
    listTareas(sp),
    listClientes(),
    listAsesores(),
  ]);

  const views: View[] = ["kanban", "lista", "calendario"];
  const qs = (v: View) => {
    const p = new URLSearchParams(sp as Record<string, string>);
    p.set("view", v);
    return `/tareas?${p.toString()}`;
  };

  return (
    <div className="space-y-5 p-8">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-primary">Tareas</h1>
          <p className="text-sm text-fg-muted">{tareas.length} tareas</p>
        </div>
        <Link href="/tareas/nuevo" className="rounded-md bg-primary px-4 py-2 font-medium text-white hover:bg-[var(--color-primary-hover)]">
          + Nueva tarea
        </Link>
      </header>

      {/* Switcher de vista */}
      <div className="flex gap-1 rounded-md border border-border bg-surface p-1 text-sm w-fit">
        {views.map((v) => (
          <Link
            key={v}
            href={qs(v)}
            className={`rounded px-3 py-1.5 capitalize ${view === v ? "bg-primary text-white" : "text-fg-muted hover:bg-surface-raised"}`}
          >
            {v}
          </Link>
        ))}
      </div>

      {/* Filtros */}
      <form className="flex flex-wrap items-end gap-2 text-sm">
        <input type="hidden" name="view" value={view} />
        <select name="responsable" defaultValue={sp.responsable ?? ""} className="rounded-md border border-border bg-surface px-2 py-2 text-fg">
          <option value="">Persona</option>
          {asesores.map((a) => <option key={a.id} value={a.id}>{a.nombre}</option>)}
        </select>
        <select name="cliente" defaultValue={sp.cliente ?? ""} className="rounded-md border border-border bg-surface px-2 py-2 text-fg">
          <option value="">Cliente</option>
          {clientes.map((c) => <option key={c.id} value={c.id}>{c.razon_social}</option>)}
        </select>
        <select name="estado" defaultValue={sp.estado ?? ""} className="rounded-md border border-border bg-surface px-2 py-2 text-fg">
          <option value="">Estado</option>
          {ESTADOS.map((e) => <option key={e.key} value={e.key}>{e.label}</option>)}
        </select>
        <input name="categoria" defaultValue={sp.categoria ?? ""} placeholder="Categoría" className="w-32 rounded-md border border-border bg-surface px-2 py-2 text-fg" />
        <input type="date" name="desde" defaultValue={sp.desde ?? ""} className="rounded-md border border-border bg-surface px-2 py-2 text-fg" />
        <input type="date" name="hasta" defaultValue={sp.hasta ?? ""} className="rounded-md border border-border bg-surface px-2 py-2 text-fg" />
        <button className="rounded-md border border-border px-3 py-2 font-medium text-fg hover:bg-surface-raised">Filtrar</button>
      </form>

      {view === "kanban" && <KanbanBoard tareas={tareas} />}
      {view === "lista" && <ListaView tareas={tareas} />}
      {view === "calendario" && <CalendarioView tareas={tareas} />}
    </div>
  );
}

function ListaView({ tareas }: { tareas: TareaConRelaciones[] }) {
  return (
    <div className="overflow-hidden rounded-lg border border-border bg-surface">
      <table className="w-full text-sm">
        <thead className="bg-surface-raised text-left text-fg-muted">
          <tr>
            <th className="px-4 py-3 font-medium">Tarea</th>
            <th className="px-4 py-3 font-medium">Cliente</th>
            <th className="px-4 py-3 font-medium">Responsable</th>
            <th className="px-4 py-3 font-medium">Estado</th>
            <th className="px-4 py-3 font-medium">Vencimiento</th>
          </tr>
        </thead>
        <tbody>
          {tareas.length === 0 && <tr><td colSpan={5} className="px-4 py-10 text-center text-fg-muted">No hay tareas.</td></tr>}
          {tareas.map((t) => (
            <tr key={t.id} className="border-t border-border hover:bg-surface-raised">
              <td className="px-4 py-3"><Link href={`/tareas/${t.id}`} className="font-medium text-fg hover:text-accent">{t.titulo}</Link></td>
              <td className="px-4 py-3 text-fg-muted">{t.cliente_nombre ?? "—"}</td>
              <td className="px-4 py-3 text-fg-muted">{t.responsable_nombre ?? "—"}</td>
              <td className="px-4 py-3"><span className="text-fg">{ESTADO_LABEL[t.estado]}</span></td>
              <td className="px-4 py-3 text-fg-muted">{t.vencimiento ? new Date(t.vencimiento).toLocaleDateString("es-ES") : "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function CalendarioView({ tareas }: { tareas: TareaConRelaciones[] }) {
  const conFecha = tareas.filter((t) => t.vencimiento);
  const grupos = new Map<string, TareaConRelaciones[]>();
  for (const t of conFecha) {
    const k = t.vencimiento!;
    if (!grupos.has(k)) grupos.set(k, []);
    grupos.get(k)!.push(t);
  }
  const fechas = [...grupos.keys()].sort();

  return (
    <div className="space-y-4">
      {fechas.length === 0 && <p className="text-sm text-fg-muted">No hay tareas con fecha límite.</p>}
      {fechas.map((f) => (
        <div key={f} className="rounded-lg border border-border bg-surface">
          <div className="border-b border-border bg-surface-raised px-4 py-2 text-sm font-semibold text-primary">
            {new Date(f).toLocaleDateString("es-ES", { weekday: "long", day: "numeric", month: "long" })}
          </div>
          <ul className="divide-y divide-border">
            {grupos.get(f)!.map((t) => (
              <li key={t.id} className="flex items-center justify-between px-4 py-2.5 text-sm">
                <Link href={`/tareas/${t.id}`} className="font-medium text-fg hover:text-accent">{t.titulo}</Link>
                <span className="text-xs text-fg-muted">{ESTADO_LABEL[t.estado]} · {t.cliente_nombre ?? ""}</span>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}
