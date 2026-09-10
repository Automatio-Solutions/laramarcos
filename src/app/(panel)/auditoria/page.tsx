import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { listAuditoria } from "@/lib/repos/auditoria";

const TABLAS = ["", "clientes", "servicios", "proveedores", "sectores", "cliente_sectores", "plantillas_subtareas", "usuarios"];

const OP_COLOR: Record<string, string> = {
  INSERT: "text-success",
  UPDATE: "text-info",
  DELETE: "text-error",
};

export default async function AuditoriaPage({
  searchParams,
}: {
  searchParams: Promise<{ tabla?: string; desde?: string; hasta?: string }>;
}) {
  // Solo staff (responsable/admin): el registro de auditoría no es para asesores.
  // La RLS ya bloquea las filas, pero además cerramos el acceso a la página para
  // que no aparezca vacía y sin sentido a un asesor.
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const { data: me } = user ? await supabase.from("usuarios").select("rol").eq("id", user.id).maybeSingle() : { data: null };
  if (!me || (me.rol !== "responsable" && me.rol !== "admin")) redirect("/dashboard");

  const f = await searchParams;
  const rows = await listAuditoria(f);

  return (
    <div className="space-y-6 p-8">
      <header>
        <h1 className="text-2xl font-bold text-primary">Auditoría</h1>
        <p className="text-sm text-fg-muted">Registro de cambios (solo responsables/admin) · últimas 200 entradas</p>
      </header>

      <form className="flex flex-wrap items-end gap-3">
        <label className="space-y-1 text-sm">
          <span className="block text-fg-muted">Tabla</span>
          <select name="tabla" defaultValue={f.tabla ?? ""} className="rounded-md border border-border bg-surface px-3 py-2 text-fg">
            {TABLAS.map((t) => <option key={t} value={t}>{t || "Todas"}</option>)}
          </select>
        </label>
        <label className="space-y-1 text-sm">
          <span className="block text-fg-muted">Desde</span>
          <input type="date" name="desde" defaultValue={f.desde} className="rounded-md border border-border bg-surface px-3 py-2 text-fg" />
        </label>
        <label className="space-y-1 text-sm">
          <span className="block text-fg-muted">Hasta</span>
          <input type="date" name="hasta" defaultValue={f.hasta} className="rounded-md border border-border bg-surface px-3 py-2 text-fg" />
        </label>
        <button className="rounded-md border border-border px-4 py-2 text-sm font-medium text-fg hover:bg-surface">Filtrar</button>
      </form>

      <div className="overflow-hidden rounded-lg border border-border bg-surface">
        <table className="w-full text-sm">
          <thead className="bg-surface-raised text-left text-fg-muted">
            <tr>
              <th className="px-4 py-3 font-medium">Fecha</th>
              <th className="px-4 py-3 font-medium">Tabla</th>
              <th className="px-4 py-3 font-medium">Operación</th>
              <th className="px-4 py-3 font-medium">Registro</th>
              <th className="px-4 py-3 font-medium">Usuario</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr><td colSpan={5} className="px-4 py-10 text-center text-fg-muted">Sin registros para el filtro.</td></tr>
            )}
            {rows.map((r) => (
              <tr key={r.id} className="border-t border-border">
                <td className="px-4 py-2.5 font-mono text-xs text-fg-muted">{new Date(r.ts).toLocaleString("es-ES")}</td>
                <td className="px-4 py-2.5 text-fg">{r.tabla}</td>
                <td className={`px-4 py-2.5 font-medium ${OP_COLOR[r.operacion] ?? "text-fg"}`}>{r.operacion}</td>
                <td className="px-4 py-2.5 font-mono text-xs text-fg-muted">{r.registro_id?.slice(0, 8) ?? "—"}</td>
                <td className="px-4 py-2.5 font-mono text-xs text-fg-muted">{r.usuario_id?.slice(0, 8) ?? "sistema"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
