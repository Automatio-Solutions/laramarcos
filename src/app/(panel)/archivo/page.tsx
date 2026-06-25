import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { listTareasArchivadas } from "@/lib/repos/tareas";
import { ESTADO_LABEL } from "@/lib/estados";
import { desarchivarTareaAction } from "../tareas/actions";

const ymd = (d: Date) => d.toISOString().slice(0, 10);
const TODO_DESDE = "2000-01-01";

export default async function ArchivoPage({ searchParams }: { searchParams: Promise<{ desde?: string; hasta?: string }> }) {
  // Solo staff (responsable/admin)
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const { data: me } = user ? await supabase.from("usuarios").select("rol").eq("id", user.id).maybeSingle() : { data: null };
  if (!(me?.rol === "responsable" || me?.rol === "admin")) redirect("/tareas");

  const sp = await searchParams;
  const now = new Date();
  const y = now.getUTCFullYear(), mo = now.getUTCMonth();

  // Rango por defecto: Todo (muestra el archivo completo)
  const desde = sp.desde ?? TODO_DESDE;
  const hasta = sp.hasta ?? ymd(new Date(Date.UTC(y + 1, 0, 1)));

  // Presets
  const presets: { label: string; desde: string; hasta: string }[] = [
    { label: "Este mes", desde: ymd(new Date(Date.UTC(y, mo, 1))), hasta: ymd(new Date(Date.UTC(y, mo + 1, 0))) },
    { label: "Mes pasado", desde: ymd(new Date(Date.UTC(y, mo - 1, 1))), hasta: ymd(new Date(Date.UTC(y, mo, 0))) },
    { label: "Este año", desde: ymd(new Date(Date.UTC(y, 0, 1))), hasta: ymd(new Date(Date.UTC(y, 11, 31))) },
    { label: "Todo", desde: TODO_DESDE, hasta: ymd(new Date(Date.UTC(y + 1, 0, 1))) },
  ];
  const activo = (p: { desde: string; hasta: string }) => p.desde === desde && p.hasta === hasta;

  const tareas = await listTareasArchivadas(desde, hasta);

  return (
    <div className="space-y-6 p-8">
      <header>
        <h1 className="text-2xl font-bold text-primary">Archivo</h1>
        <p className="text-sm text-fg-muted">Tareas archivadas · {tareas.length} · solo visible para responsables/admin</p>
      </header>

      {/* Filtro de fechas */}
      <div className="flex flex-wrap items-end gap-3">
        <div className="flex flex-wrap gap-1">
          {presets.map((p) => (
            <Link
              key={p.label}
              href={`/archivo?desde=${p.desde}&hasta=${p.hasta}`}
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

      <div className="overflow-hidden rounded-lg border border-border bg-surface">
        <table className="w-full text-sm">
          <thead className="bg-surface-raised text-left text-fg-muted">
            <tr>
              <th className="px-4 py-3 font-medium">Tarea</th>
              <th className="px-4 py-3 font-medium">Cliente</th>
              <th className="px-4 py-3 font-medium">Responsable</th>
              <th className="px-4 py-3 font-medium">Estado</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {tareas.length === 0 && <tr><td colSpan={5} className="px-4 py-10 text-center text-fg-muted">No hay tareas archivadas.</td></tr>}
            {tareas.map((t) => (
              <tr key={t.id} className="border-t border-border hover:bg-surface-raised">
                <td className="px-4 py-3"><Link href={`/tareas/${t.id}`} className="font-medium text-fg hover:text-accent">{t.titulo}</Link></td>
                <td className="px-4 py-3 text-fg-muted">{t.cliente_nombre ?? "—"}</td>
                <td className="px-4 py-3 text-fg-muted">{t.responsable_nombre ?? "—"}</td>
                <td className="px-4 py-3 text-fg">{ESTADO_LABEL[t.estado]}</td>
                <td className="px-4 py-3 text-right">
                  <form action={desarchivarTareaAction.bind(null, t.id)}>
                    <button className="text-sm font-medium text-accent hover:underline">Restaurar</button>
                  </form>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
