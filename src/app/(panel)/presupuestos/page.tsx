import Link from "next/link";
import { listPresupuestos } from "@/lib/repos/presupuestos";
import { EliminarPresupuesto } from "@/components/EliminarPresupuesto";
import { eliminarPresupuestoAction } from "./actions";
import { createClient } from "@/lib/supabase/server";

const eur = new Intl.NumberFormat("es-ES", { style: "currency", currency: "EUR" });
const ESTADO_COLOR: Record<string, string> = {
  borrador: "bg-neutral-100 text-neutral-700",
  enviado: "bg-info/10 text-info",
  abierto: "bg-accent/10 text-accent",
  aceptado: "bg-success/10 text-success",
  rechazado: "bg-error/10 text-error",
};

export default async function PresupuestosPage() {
  const presupuestos = await listPresupuestos();
  const aceptados = presupuestos.filter((p) => p.estado === "aceptado").length;

  // La RLS solo deja borrar a responsables y admin. Se oculta la X al resto en
  // vez de enseñar un botón que les daría siempre "no tienes permiso".
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const { data: me } = user
    ? await supabase.from("usuarios").select("rol").eq("id", user.id).maybeSingle()
    : { data: null };
  const puedeEliminar = me?.rol === "responsable" || me?.rol === "admin";

  return (
    <div className="space-y-6 p-8">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-primary">Presupuestos</h1>
          <p className="text-sm text-fg-muted">{presupuestos.length} en total · {aceptados} aceptados</p>
        </div>
        <div className="flex gap-2">
          <Link href="/presupuestos/recurrentes" className="rounded-md border border-border px-4 py-2 font-medium text-fg hover:bg-surface-raised">
            🔁 Recurrentes
          </Link>
          <Link href="/presupuestos/nuevo" className="rounded-md bg-primary px-4 py-2 font-medium text-white hover:bg-[var(--color-primary-hover)]">
            + Nuevo presupuesto
          </Link>
        </div>
      </header>

      <div className="overflow-hidden rounded-lg border border-border bg-surface">
        <table className="w-full text-sm">
          <thead className="bg-surface-raised text-left text-fg-muted">
            <tr>
              <th className="px-4 py-3 font-medium">Cliente</th>
              <th className="px-4 py-3 font-medium text-right">Total</th>
              <th className="px-4 py-3 font-medium">Estado</th>
              <th className="px-4 py-3 font-medium">Fecha</th>
              {puedeEliminar && <th className="px-2 py-3"><span className="sr-only">Acciones</span></th>}
            </tr>
          </thead>
          <tbody>
            {presupuestos.length === 0 && <tr><td colSpan={puedeEliminar ? 5 : 4} className="px-4 py-10 text-center text-fg-muted">No hay presupuestos. Crea el primero desde texto libre.</td></tr>}
            {presupuestos.map((p) => {
              const cliente = p.cliente_nombre ?? "(sin cliente)";
              // Cada celda lleva su propio enlace a pantalla completa: así se
              // abre el presupuesto pinchando en cualquier punto de la fila,
              // sin perder el enlace real (abrir en pestaña nueva, teclado).
              const celda = "block px-4 py-3";
              return (
                <tr key={p.id} className="border-t border-border hover:bg-surface-raised">
                  <td className="p-0">
                    <Link href={`/presupuestos/${p.id}`} className={`${celda} font-medium text-fg`}>{cliente}</Link>
                  </td>
                  <td className="p-0">
                    <Link href={`/presupuestos/${p.id}`} className={`${celda} text-right font-mono text-fg`}>{eur.format(p.total)}</Link>
                  </td>
                  <td className="p-0">
                    <Link href={`/presupuestos/${p.id}`} className={celda}>
                      <span className={`rounded-md px-2 py-0.5 text-xs font-medium capitalize ${ESTADO_COLOR[p.estado]}`}>{p.estado}</span>
                    </Link>
                  </td>
                  <td className="p-0">
                    <Link href={`/presupuestos/${p.id}`} className={`${celda} text-fg-muted`}>{new Date(p.created_at).toLocaleDateString("es-ES")}</Link>
                  </td>
                  {puedeEliminar && (
                    <td className="px-2 py-3 text-right align-middle">
                      <EliminarPresupuesto
                        id={p.id}
                        cliente={cliente}
                        estado={p.estado}
                        onEliminar={eliminarPresupuestoAction}
                      />
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
