import { logoutAction } from "@/app/login/actions";
import { Logo } from "@/components/Logo";
import { PanelNav } from "@/components/PanelNav";
import { NotificacionesBell } from "@/components/NotificacionesBell";
import { listNotificaciones, countNoLeidas } from "@/lib/repos/notificaciones";
import { createClient } from "@/lib/supabase/server";

export default async function PanelLayout({
  children,
  modal,
}: {
  children: React.ReactNode;
  modal: React.ReactNode;
}) {
  const [notificaciones, noLeidas] = await Promise.all([listNotificaciones(), countNoLeidas()]);
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const { data: me } = user ? await supabase.from("usuarios").select("nombre, rol").eq("id", user.id).maybeSingle() : { data: null };
  const esStaff = me?.rol === "responsable" || me?.rol === "admin";
  return (
    <div className="flex min-h-screen">
      {/* Barra lateral FIJA: se queda a la vista aunque el contenido sea muy largo,
          para que "Cerrar sesión" (abajo) sea siempre accesible. */}
      <aside className="sticky top-0 flex h-screen w-64 shrink-0 flex-col bg-primary text-white">
        <div className="shrink-0 border-b border-white/10 px-6 py-5">
          <Logo className="h-11 w-auto text-white" />
        </div>
        <PanelNav esStaff={esStaff} />
        <form action={logoutAction} className="shrink-0 border-t border-white/10 p-3">
          <button className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm text-white/80 hover:bg-white/10">
            <span aria-hidden>↩</span> Cerrar sesión
          </button>
        </form>
      </aside>
      <main className="flex-1 bg-surface-raised">
        <div className="flex items-center justify-end gap-4 border-b border-border bg-surface px-6 py-2">
          <NotificacionesBell notificaciones={notificaciones} noLeidas={noLeidas} />
          {me?.nombre && <span className="text-sm text-fg-muted">{me.nombre}</span>}
          {/* Cerrar sesión también arriba, siempre visible sin depender del scroll. */}
          <form action={logoutAction}>
            <button className="rounded-md border border-border px-3 py-1.5 text-sm font-medium text-fg hover:bg-surface-raised">
              Cerrar sesión
            </button>
          </form>
        </div>
        {children}
      </main>
      {modal}
    </div>
  );
}
