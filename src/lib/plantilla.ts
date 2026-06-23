import type { PasoPlantilla } from "@/lib/types";

/** Instancia la plantilla: calcula la fecha límite de cada subtarea desde una fecha de inicio. */
export function instanciar(
  pasos: PasoPlantilla[],
  fechaInicio: Date,
): { nombre: string; fecha_limite: string }[] {
  return pasos
    .slice()
    .sort((a, b) => a.orden - b.orden)
    .map((p) => {
      const d = new Date(fechaInicio);
      d.setDate(d.getDate() + (p.plazo_relativo_dias ?? 0));
      return { nombre: p.nombre, fecha_limite: d.toISOString().slice(0, 10) };
    });
}
