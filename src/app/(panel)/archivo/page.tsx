import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { listTareasArchivadas } from "@/lib/repos/tareas";
import { ESTADO_LABEL } from "@/lib/estados";
import { desarchivarTareaAction } from "../tareas/actions";

export default async function ArchivoPage() {
  // Solo staff (responsable/admin)
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const { data: me } = user ? await supabase.from("usuarios").select("rol").eq("id", user.id).maybeSingle() : { data: null };
  if (!(me?.rol === "responsable" || me?.rol === "admin")) redirect("/tareas");

  const tareas = await listTareasArchivadas();

  return (
    <div className="space-y-6 p-8">
      <header>
        <h1 className="text-2xl font-bold text-primary">Archivo</h1>
        <p className="text-sm text-fg-muted">Tareas archivadas · {tareas.length} · solo visible para responsables/admin</p>
      </header>

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
