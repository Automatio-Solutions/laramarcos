import { createClient } from "@/lib/supabase/server";

export interface CargaEmpleado {
  id: string | null; // null = "Sin asignar" (no enlaza a un responsable concreto)
  nombre: string;
  abiertas: number;
  vencidas: number;
}

export interface DashboardMetrics {
  totalPeriodo: number;        // tareas creadas en el periodo
  completadasPeriodo: number;  // completadas (de las creadas en el periodo)
  abiertas: number;            // del periodo, no completadas
  totalVencidas: number;       // del periodo, no completadas y vencidas
  tiempoMedioDias: number | null;
  carga: CargaEmpleado[];
}

interface Row {
  estado: string;
  vencimiento: string | null;
  created_at: string;
  completada_at: string | null;
  responsable_id: string | null;
  responsable: { nombre: string } | null;
}

/** Métricas del dashboard filtradas por periodo (created_at en [desde, hasta]). */
export async function getDashboard(desde: string, hasta: string): Promise<DashboardMetrics> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("tareas")
    .select("estado, vencimiento, created_at, completada_at, responsable_id, responsable:usuarios!tareas_responsable_id_fkey(nombre)")
    .eq("archivada", false)
    .gte("created_at", desde)
    .lte("created_at", `${hasta}T23:59:59`);
  const rows = (data ?? []) as unknown as Row[];

  const hoy = new Date().toISOString().slice(0, 10);
  const carga = new Map<string, CargaEmpleado>();
  let totalPeriodo = 0, completadasPeriodo = 0, abiertas = 0, totalVencidas = 0;
  let sumDias = 0, nResueltas = 0;

  for (const r of rows) {
    totalPeriodo++;
    const nombre = r.responsable?.nombre ?? "Sin asignar";
    if (!carga.has(nombre)) carga.set(nombre, { id: r.responsable_id, nombre, abiertas: 0, vencidas: 0 });
    const c = carga.get(nombre)!;

    if (r.estado !== "completada") {
      abiertas++; c.abiertas++;
      if (r.vencimiento && r.vencimiento < hoy) { totalVencidas++; c.vencidas++; }
    } else {
      completadasPeriodo++;
      if (r.completada_at) {
        nResueltas++;
        sumDias += (new Date(r.completada_at).getTime() - new Date(r.created_at).getTime()) / 86_400_000;
      }
    }
  }

  return {
    totalPeriodo,
    completadasPeriodo,
    abiertas,
    totalVencidas,
    tiempoMedioDias: nResueltas ? Math.round((sumDias / nResueltas) * 10) / 10 : null,
    carga: [...carga.values()].sort((a, b) => b.abiertas - a.abiertas),
  };
}
