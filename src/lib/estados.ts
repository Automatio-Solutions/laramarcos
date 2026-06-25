import type { EstadoTarea } from "@/lib/types";

export const ESTADOS: { key: EstadoTarea; label: string; color: string }[] = [
  { key: "pendiente", label: "Pendiente", color: "bg-neutral-100 text-neutral-700" },
  { key: "en_curso", label: "En curso", color: "bg-info/10 text-info" },
  { key: "bloqueada", label: "Bloqueada", color: "bg-error/10 text-error" },
  { key: "completada", label: "Completada", color: "bg-success/10 text-success" },
];

/** Columnas/estados activos del flujo (sin "bloqueada", que ahora es automática). */
export const ESTADOS_TABLERO = ESTADOS.filter((e) => e.key !== "bloqueada");

export const ESTADO_LABEL: Record<EstadoTarea, string> = {
  pendiente: "Pendiente",
  en_curso: "En curso",
  bloqueada: "Bloqueada",
  completada: "Completada",
};
