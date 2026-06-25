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
  const { data: me } = user ? await supabase.from("usuarios").select("rol").eq("id", user.id).maybeSingle() : { data: null };
  const esStaff = me?.rol === "responsable" || me?.rol === "admin";
  return (
    <div className="flex min-h-screen">
      <aside className="flex w-64 flex-col bg-primary text-white">
        <div className="border-b border-white/10 px-6 py-5">
          <Logo className="h-11 w-auto text-white" />
        </div>
        <PanelNav esStaff={esStaff} />
        <form action={logoutAction} className="border-t border-white/10 p-3">
          <button className="w-full rounded-md px-3 py-2 text-left text-sm text-white/70 hover:bg-white/10">
            Cerrar sesión
          </button>
        </form>
      </aside>
      <main className="flex-1 bg-surface-raised">
        <div className="flex items-center justify-end border-b border-border bg-surface px-6 py-2">
          <NotificacionesBell notificaciones={notificaciones} noLeidas={noLeidas} />
        </div>
        {children}
      </main>
      {modal}
    </div>
  );
}
