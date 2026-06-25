import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getTareaDetalle } from "@/lib/repos/tarea-detalle";
import { listTareas } from "@/lib/repos/tareas";
import { listAsesores } from "@/lib/repos/clientes";
import {
  subirAdjuntoAction, borrarAdjuntoAction,
} from "@/app/(panel)/tareas/[id]/adjuntos-actions";
import { ESTADO_LABEL } from "@/lib/estados";
import { EstadoSelect } from "@/components/EstadoSelect";
import {
  addSubtareaAction, asignarSubtareaAction, setEstadoSubtareaAction, eliminarSubtareaAction,
  addComentarioAction, addDependenciaAction,
  removeDependenciaAction, addTiempoAction,
} from "@/app/(panel)/tareas/[id]/actions";

function fmtTiempo(seg: number): string {
  const h = Math.floor(seg / 3600), m = Math.round((seg % 3600) / 60);
  return h ? `${h}h ${m}m` : `${m}m`;
}

/** Vista completa del detalle de una tarea. Se usa en página completa y en el modal. */
export async function TareaDetalleView({ id, enModal = false }: { id: string; enModal?: boolean }) {
  const supabase = await createClient();
  const [detalle, asesores, todasTareas, { data: adjuntos }] = await Promise.all([
    getTareaDetalle(id), listAsesores(), listTareas(),
    supabase.from("adjuntos").select("id, nombre, mime, size, path").eq("tarea_id", id).order("created_at"),
  ]);
  if (!detalle) notFound();
  const { tarea, subtareas, comentarios, tiempos, segundosTotal, dependencias, actividad } = detalle;
  const otras = todasTareas.filter((t) => t.id !== id);
  const depIds = new Set(dependencias.map((d) => d.depende_de_id));

  // Bloqueo AUTOMÁTICO: subtareas asignadas, vencidas (plazo pasado) y sin completar.
  const hoy = new Date().toISOString().slice(0, 10);
  const bloqueadaPor = [
    ...new Set(
      subtareas
        .filter((s) => s.estado !== "completada" && s.plazo && s.plazo < hoy)
        .map((s) => s.asignado_nombre ?? "Sin asignar"),
    ),
  ];

  return (
    <div className="space-y-8">
      <header>
        {!enModal && <Link href="/tareas" className="text-sm text-fg-muted hover:underline">← Tareas</Link>}
        <div className="mt-1 flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-bold text-primary">{tarea.titulo}</h1>
          {bloqueadaPor.length > 0 && (
            <span className="rounded-md bg-error/10 px-2 py-0.5 text-xs font-medium text-error">
              🔒 Bloqueada por: {bloqueadaPor.join(", ")}
            </span>
          )}
        </div>
        <p className="text-sm text-fg-muted">
          {ESTADO_LABEL[tarea.estado]}{tarea.cliente_nombre ? ` · ${tarea.cliente_nombre}` : ""}
          {tarea.responsable_nombre ? ` · 👤 ${tarea.responsable_nombre}` : ""}
          {tarea.vencimiento ? ` · vence ${new Date(tarea.vencimiento).toLocaleDateString("es-ES")}` : ""}
        </p>
        {tarea.descripcion && <p className="mt-3 text-sm text-fg">{tarea.descripcion}</p>}
      </header>

      {/* Bloqueo AUTOMÁTICO (UC-104): se deriva de subtareas vencidas sin completar. */}
      {bloqueadaPor.length > 0 && (
        <div className="rounded-lg border border-error/30 bg-error/5 p-3 text-sm text-fg">
          🔒 Esta tarea está <strong>bloqueada</strong> porque hay subtareas vencidas sin completar a cargo de{" "}
          <strong>{bloqueadaPor.join(", ")}</strong>. Se desbloqueará automáticamente al completarlas.
        </div>
      )}

      {/* Subtareas (UC-102) */}
      <section className="space-y-3">
        <h2 className="font-semibold text-fg">Subtareas</h2>
        <ul className="divide-y divide-border overflow-hidden rounded-lg border border-border bg-surface">
          {subtareas.length === 0 && <li className="px-4 py-6 text-center text-sm text-fg-muted">Sin subtareas.</li>}
          {subtareas.map((s) => (
            <li key={s.id} className="flex flex-wrap items-center gap-3 px-4 py-3 text-sm">
              <span className="flex-1 font-medium text-fg">{s.titulo}</span>
              <EstadoSelect estado={s.estado} action={setEstadoSubtareaAction.bind(null, id, s.id)} />
              <form action={asignarSubtareaAction.bind(null, id, s.id)} className="flex items-center gap-1">
                <select name="asignado_id" defaultValue={s.asignado_id ?? ""} className="rounded-md border border-border bg-surface px-2 py-1 text-xs text-fg">
                  <option value="">Sin asignar</option>
                  {asesores.map((a) => <option key={a.id} value={a.id}>{a.nombre}</option>)}
                </select>
                <input type="date" name="plazo" defaultValue={s.plazo ?? ""} className="rounded-md border border-border bg-surface px-1 py-1 text-xs text-fg" />
                <button className="rounded-md border border-border px-2 py-1 text-xs text-fg hover:bg-surface-raised">Asignar</button>
              </form>
              <form action={eliminarSubtareaAction.bind(null, id, s.id)}>
                <button className="rounded p-1 text-error hover:bg-error/10" title="Eliminar subtarea">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} className="h-4 w-4">
                    <path strokeLinecap="round" d="M6 6l12 12M18 6L6 18" />
                  </svg>
                </button>
              </form>
            </li>
          ))}
        </ul>
        <form action={addSubtareaAction.bind(null, id)} className="flex gap-2">
          <input name="titulo" placeholder="Nueva subtarea" className="flex-1 rounded-md border border-border bg-surface px-3 py-2 text-sm text-fg" />
          <button className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-[var(--color-primary-hover)]">Añadir</button>
        </form>
        <p className="text-xs text-fg-muted">La asignación a personas solo la realiza el responsable (la IA nunca asigna).</p>
      </section>

      {/* Dependencias (UC-107) */}
      <section className="space-y-3">
        <h2 className="font-semibold text-fg">Dependencias</h2>
        <ul className="space-y-1">
          {dependencias.length === 0 && <li className="text-sm text-fg-muted">Sin dependencias.</li>}
          {dependencias.map((d) => (
            <li key={d.depende_de_id} className="flex items-center gap-2 text-sm">
              <span className="text-fg">⛓ Depende de: <strong>{d.titulo}</strong> ({ESTADO_LABEL[d.estado]})</span>
              <form action={removeDependenciaAction.bind(null, id, d.depende_de_id)}>
                <button className="text-xs text-error hover:underline">quitar</button>
              </form>
            </li>
          ))}
        </ul>
        <form action={addDependenciaAction.bind(null, id)} className="flex gap-2">
          <select name="depende_de_id" className="flex-1 rounded-md border border-border bg-surface px-3 py-2 text-sm text-fg">
            <option value="">— Añadir dependencia —</option>
            {otras.filter((t) => !depIds.has(t.id)).map((t) => <option key={t.id} value={t.id}>{t.titulo}</option>)}
          </select>
          <button className="rounded-md border border-border px-4 py-2 text-sm font-medium text-fg hover:bg-surface-raised">Añadir</button>
        </form>
      </section>

      {/* Control de tiempo (UC-108) */}
      <section className="space-y-3">
        <h2 className="font-semibold text-fg">Tiempo dedicado · <span className="text-accent">{fmtTiempo(segundosTotal)}</span></h2>
        <ul className="space-y-1 text-sm">
          {tiempos.map((t2) => (
            <li key={t2.id} className="flex justify-between text-fg-muted">
              <span>{fmtTiempo(t2.segundos)} · {t2.usuario_nombre ?? ""} {t2.nota ? `· ${t2.nota}` : ""}</span>
              <span className="text-xs">{new Date(t2.ts).toLocaleDateString("es-ES")}</span>
            </li>
          ))}
        </ul>
        <form action={addTiempoAction.bind(null, id)} className="flex gap-2">
          <input name="minutos" type="number" placeholder="Minutos" className="w-28 rounded-md border border-border bg-surface px-3 py-2 text-sm text-fg" />
          <input name="nota" placeholder="Nota (opcional)" className="flex-1 rounded-md border border-border bg-surface px-3 py-2 text-sm text-fg" />
          <button className="rounded-md border border-border px-4 py-2 text-sm font-medium text-fg hover:bg-surface-raised">Registrar</button>
        </form>
      </section>

      {/* Adjuntos (UC-106) */}
      <section className="space-y-3">
        <h2 className="font-semibold text-fg">Adjuntos</h2>
        <ul className="space-y-1 text-sm">
          {(adjuntos ?? []).length === 0 && <li className="text-fg-muted">Sin adjuntos.</li>}
          {((adjuntos ?? []) as { id: string; nombre: string; size: number | null; path: string }[]).map((a) => (
            <li key={a.id} className="flex items-center justify-between rounded-md border border-border bg-surface px-3 py-2">
              <a href={`/api/adjuntos/${a.id}`} target="_blank" rel="noopener" className="text-accent hover:underline">📎 {a.nombre}</a>
              <div className="flex items-center gap-3">
                <span className="text-xs text-fg-muted">{a.size ? `${Math.round(a.size / 1024)} KB` : ""}</span>
                <form action={borrarAdjuntoAction.bind(null, a.id, id, a.path)}><button className="text-xs text-error hover:underline">borrar</button></form>
              </div>
            </li>
          ))}
        </ul>
        <form action={subirAdjuntoAction.bind(null, id)} className="flex items-center gap-2">
          <input type="file" name="archivo" required className="text-sm text-fg" />
          <button className="rounded-md border border-border px-4 py-2 text-sm font-medium text-fg hover:bg-surface-raised">Adjuntar</button>
        </form>
        <p className="text-xs text-fg-muted">PDF, Excel, escáneres o contratos. Accesibles desde la tarea, sin reenvíos por correo.</p>
      </section>

      {/* Comentarios + @menciones (UC-105) */}
      <section className="space-y-3">
        <h2 className="font-semibold text-fg">Comentarios</h2>
        <ul className="space-y-3">
          {comentarios.map((c) => (
            <li key={c.id} className="rounded-lg border border-border bg-surface p-3 text-sm">
              <div className="mb-1 flex justify-between text-xs text-fg-muted">
                <span className="font-medium text-fg">{c.autor_nombre}</span>
                <span>{new Date(c.created_at).toLocaleString("es-ES")}</span>
              </div>
              <p className="text-fg">{c.texto}</p>
              {c.menciones.length > 0 && <p className="mt-1 text-xs text-accent">menciona a {c.menciones.length} persona(s)</p>}
            </li>
          ))}
          {comentarios.length === 0 && <li className="text-sm text-fg-muted">Sin comentarios.</li>}
        </ul>
        <form action={addComentarioAction.bind(null, id)} className="flex gap-2">
          <input name="texto" placeholder="Escribe un comentario… usa @nombre para mencionar" className="flex-1 rounded-md border border-border bg-surface px-3 py-2 text-sm text-fg" />
          <button className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-[var(--color-primary-hover)]">Comentar</button>
        </form>
      </section>

      {/* Registro de actividad */}
      <section className="space-y-3">
        <h2 className="font-semibold text-fg">Registro de actividad</h2>
        <ol className="space-y-2 border-l-2 border-border pl-4 text-sm">
          {actividad.length === 0 && <li className="text-fg-muted">Sin actividad registrada.</li>}
          {actividad.map((ev, i) => (
            <li key={i} className="relative">
              <span className="absolute -left-[21px] top-0.5 text-xs">{ev.icono}</span>
              <p className="text-fg">
                <span className="font-medium">{ev.usuario_nombre ?? "—"}</span> · {ev.texto}
              </p>
              <p className="text-xs text-fg-muted">{new Date(ev.ts).toLocaleString("es-ES")}</p>
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}
