import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ESTADO_LABEL } from "@/lib/estados";
import type { Tarea } from "@/lib/types";

export default async function TareaDetallePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data } = await supabase.from("tareas").select("*").eq("id", id).maybeSingle();
  if (!data) notFound();
  const tarea = data as Tarea;

  return (
    <div className="space-y-6 p-8">
      <header>
        <Link href="/tareas" className="text-sm text-fg-muted hover:underline">← Tareas</Link>
        <h1 className="mt-1 text-2xl font-bold text-primary">{tarea.titulo}</h1>
        <p className="text-sm text-fg-muted">{ESTADO_LABEL[tarea.estado]}{tarea.categoria ? ` · ${tarea.categoria}` : ""}</p>
      </header>
      {tarea.descripcion && <p className="max-w-2xl text-sm text-fg">{tarea.descripcion}</p>}
      <dl className="grid max-w-md grid-cols-2 gap-y-2 text-sm">
        <dt className="text-fg-muted">Vencimiento</dt>
        <dd className="text-fg">{tarea.vencimiento ? new Date(tarea.vencimiento).toLocaleDateString("es-ES") : "—"}</dd>
        <dt className="text-fg-muted">Estado</dt>
        <dd className="text-fg">{ESTADO_LABEL[tarea.estado]}</dd>
      </dl>
      <p className="text-xs text-fg-muted">Subtareas, comentarios y control de tiempo se añaden en UC-102/105/108.</p>
    </div>
  );
}
