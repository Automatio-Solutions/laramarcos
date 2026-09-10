import { createClient } from "@/lib/supabase/server";
import { procesarEjemploAction, enviarNewsletterAction } from "./actions";

interface PubRow { id: string; boletin: string; titulo: string; urgente: boolean; enlace: string | null; sector: { nombre: string } | null; }
interface NewsRow { id: string; asunto: string; contenido: string; destinatarios: number; enviada: boolean; sector: { nombre: string } | null; }

export default async function VigilanciaPage() {
  const supabase = await createClient();
  const hoy = new Date().toISOString().slice(0, 10);
  const [{ data: pubs }, { data: news }] = await Promise.all([
    supabase.from("publicaciones").select("id, boletin, titulo, urgente, enlace, sector:sectores(nombre)").eq("fecha", hoy).order("created_at", { ascending: false }),
    supabase.from("newsletters").select("id, asunto, contenido, destinatarios, enviada, sector:sectores(nombre)").eq("fecha", hoy).order("created_at", { ascending: false }),
  ]);
  const publicaciones = (pubs ?? []) as unknown as PubRow[];
  const newsletters = (news ?? []) as unknown as NewsRow[];

  return (
    <div className="space-y-6 p-8">
      <header className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-primary">Vigilancia DOE/BOE</h1>
          <p className="text-sm text-fg-muted">
            La propia plataforma descarga el DOE y el BOE cada mañana, los clasifica por sector con IA y avisa solo a los clientes afectados.
          </p>
        </div>
        <form action={procesarEjemploAction}>
          <button className="rounded-md border border-border px-4 py-2 text-sm font-medium text-fg hover:bg-surface-raised">Procesar ejemplo</button>
        </form>
      </header>

      <section className="grid gap-6 lg:grid-cols-2">
        <div>
          <h2 className="mb-2 font-semibold text-fg">Publicaciones de hoy ({publicaciones.length})</h2>
          <ul className="divide-y divide-border rounded-lg border border-border bg-surface text-sm">
            {publicaciones.length === 0 && <li className="px-4 py-6 text-center text-fg-muted">Sin publicaciones hoy.</li>}
            {publicaciones.map((p) => (
              <li key={p.id} className="px-4 py-3">
                <div className="flex items-center gap-2">
                  <span className="rounded bg-neutral-100 px-1.5 py-0.5 text-[10px] font-bold text-neutral-600">{p.boletin}</span>
                  {p.urgente && <span className="rounded bg-error/10 px-1.5 py-0.5 text-[10px] font-bold text-error">URGENTE</span>}
                  {p.sector && <span className="rounded bg-primary-subtle px-1.5 py-0.5 text-[10px] text-primary">{p.sector.nombre}</span>}
                </div>
                <p className="mt-1 text-fg">{p.titulo}</p>
              </li>
            ))}
          </ul>
        </div>

        <div>
          <h2 className="mb-2 font-semibold text-fg">Newsletters generadas ({newsletters.length})</h2>
          <ul className="space-y-2 text-sm">
            {newsletters.length === 0 && <li className="rounded-lg border border-border bg-surface px-4 py-6 text-center text-fg-muted">Sin novedades → no se envía nada.</li>}
            {newsletters.map((n) => (
              <li key={n.id} className="rounded-lg border border-border bg-surface p-3">
                <div className="flex items-center justify-between gap-3">
                  <p className="font-medium text-fg">{n.sector?.nombre ?? "—"}</p>
                  <div className="flex items-center gap-3">
                    <span className="text-xs text-fg-muted">
                      {n.destinatarios} destinatarios · {n.enviada ? "enviada" : "pendiente de envío"}
                    </span>
                    {!n.enviada && (
                      <form action={enviarNewsletterAction.bind(null, n.id)}>
                        <button className="rounded-md bg-primary px-3 py-1 text-xs font-medium text-white hover:bg-[var(--color-primary-hover)]">
                          Enviar ahora
                        </button>
                      </form>
                    )}
                  </div>
                </div>
                <p className="mt-1 whitespace-pre-line text-xs text-fg-muted">{n.contenido}</p>
              </li>
            ))}
          </ul>
        </div>
      </section>
      <p className="text-xs text-fg-muted">Las circulares salen por Resend desde circulares@laramarcosasesores.es, con los clientes en copia oculta. Las tareas urgentes se crean en Tareas (origen DOE/BOE).</p>
    </div>
  );
}
