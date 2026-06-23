import { createClient } from "@/lib/supabase/server";
import { PlantillaEditor } from "@/components/PlantillaEditor";
import {
  createPlantillaTareaAction, savePasosPlantillaAction,
  deletePlantillaTareaAction, usarPlantillaAction,
} from "./actions";
import type { PasoPlantilla } from "@/lib/types";

interface PlantillaRow { id: string; nombre: string; categoria: string | null; subtareas: PasoPlantilla[]; }

export default async function PlantillasTareasPage() {
  const supabase = await createClient();
  const { data } = await supabase.from("plantillas_tareas").select("id, nombre, categoria, subtareas").order("nombre");
  const plantillas = (data ?? []) as PlantillaRow[];

  return (
    <div className="space-y-6 p-8">
      <header>
        <h1 className="text-2xl font-bold text-primary">Plantillas de tareas recurrentes</h1>
        <p className="text-sm text-fg-muted">Ej.: &quot;Cierre trimestral IVA&quot;. Un clic crea la tarea con todas sus subtareas y plazos; el responsable asigna luego.</p>
      </header>

      <form action={createPlantillaTareaAction} className="flex gap-2">
        <input name="nombre" required placeholder="Nombre de la plantilla" className="flex-1 rounded-md border border-border bg-surface px-3 py-2 text-sm text-fg" />
        <input name="categoria" placeholder="Categoría" className="w-40 rounded-md border border-border bg-surface px-3 py-2 text-sm text-fg" />
        <button className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-[var(--color-primary-hover)]">Crear</button>
      </form>

      <div className="space-y-4">
        {plantillas.length === 0 && <p className="text-sm text-fg-muted">No hay plantillas todavía.</p>}
        {plantillas.map((pl) => (
          <div key={pl.id} className="space-y-3 rounded-lg border border-border bg-surface p-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="font-semibold text-fg">{pl.nombre}</h2>
                {pl.categoria && <p className="text-xs text-fg-muted">{pl.categoria}</p>}
              </div>
              <div className="flex gap-2">
                <form action={usarPlantillaAction.bind(null, pl.id)}>
                  <button className="rounded-md bg-accent px-3 py-1.5 text-xs font-medium text-white">Usar (crear tarea)</button>
                </form>
                <form action={deletePlantillaTareaAction.bind(null, pl.id)}>
                  <button className="rounded-md border border-border px-3 py-1.5 text-xs text-error hover:bg-surface-raised">Borrar</button>
                </form>
              </div>
            </div>
            <details>
              <summary className="cursor-pointer text-sm text-accent">Editar pasos ({pl.subtareas?.length ?? 0})</summary>
              <div className="mt-3">
                <PlantillaEditor servicioId={pl.id} pasosIniciales={pl.subtareas ?? []} action={savePasosPlantillaAction} />
              </div>
            </details>
          </div>
        ))}
      </div>
    </div>
  );
}
