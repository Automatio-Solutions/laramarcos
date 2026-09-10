import Link from "next/link";
import { listTareas, type TareaFiltros } from "@/lib/repos/tareas";
import { listClientes, listAsesores } from "@/lib/repos/clientes";
import { KanbanBoard } from "@/components/KanbanBoard";
import { ListaTareas } from "@/components/ListaTareas";
import { CalendarioMensual } from "@/components/CalendarioMensual";
import { ESTADOS_TABLERO } from "@/lib/estados";

type View = "kanban" | "lista" | "calendario";
type SP = TareaFiltros & { view?: View; mes?: string };

export default async function TareasPage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const view: View = sp.view ?? "kanban";
  const mes = sp.mes ?? new Date().toISOString().slice(0, 7);
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
        {/* Navegación COMPLETA a propósito (no <Link>): el tablero abre las tareas en
            modal con un interceptor (.)tareas/[id] que capturaría /tareas/nuevo. Una
            navegación dura evita esa interceptación (no da 404) y, al crear + redirigir,
            recarga el tablero fresco (si no, la tarea nueva no se vería hasta refrescar).
            Por eso se desactiva aquí la regla que exige <Link> para rutas internas. */}
        {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
        <a href="/tareas/nuevo" className="rounded-md bg-primary px-4 py-2 font-medium text-white hover:bg-[var(--color-primary-hover)]">
          + Nueva tarea
        </a>
      </header>

      {/* Switcher de vista */}
      <div className="flex w-fit gap-1 rounded-md border border-border bg-surface p-1 text-sm">
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
          {ESTADOS_TABLERO.map((e) => <option key={e.key} value={e.key}>{e.label}</option>)}
        </select>
        <input name="categoria" defaultValue={sp.categoria ?? ""} placeholder="Categoría" className="w-32 rounded-md border border-border bg-surface px-2 py-2 text-fg" />
        <input type="date" name="desde" defaultValue={sp.desde ?? ""} className="rounded-md border border-border bg-surface px-2 py-2 text-fg" />
        <input type="date" name="hasta" defaultValue={sp.hasta ?? ""} className="rounded-md border border-border bg-surface px-2 py-2 text-fg" />
        <button className="rounded-md border border-border px-3 py-2 font-medium text-fg hover:bg-surface-raised">Filtrar</button>
      </form>

      {view === "kanban" && <KanbanBoard tareas={tareas} />}
      {view === "lista" && <ListaTareas tareas={tareas} />}
      {view === "calendario" && <CalendarioMensual tareas={tareas} mes={mes} />}
    </div>
  );
}
