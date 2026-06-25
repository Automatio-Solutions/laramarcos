import { createClient } from "@/lib/supabase/server";

export interface CargaEmpleado {
  nombre: string;
  abiertas: number;
  vencidas: number;
}

export interface DashboardMetrics {
  totalAbiertas: number;
  totalVencidas: number;
  tiempoMedioDias: number | null; // resolución media (completadas)
  carga: CargaEmpleado[];
}

interface Row {
  estado: string;
  vencimiento: string | null;
  created_at: string;
  completada_at: string | null;
  responsable: { nombre: string } | null;
}

export async function getDashboard(): Promise<DashboardMetrics> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("tareas")
    .select("estado, vencimiento, created_at, completada_at, responsable:usuarios!tareas_responsable_id_fkey(nombre)");
  const rows = (data ?? []) as unknown as Row[];

  const hoy = new Date().toISOString().slice(0, 10);
  const carga = new Map<string, CargaEmpleado>();
  let totalAbiertas = 0, totalVencidas = 0;
  let sumDias = 0, nResueltas = 0;

  for (const r of rows) {
    const nombre = r.responsable?.nombre ?? "Sin asignar";
    if (!carga.has(nombre)) carga.set(nombre, { nombre, abiertas: 0, vencidas: 0 });
    const c = carga.get(nombre)!;
    const abierta = r.estado !== "completada";

    if (abierta) {
      totalAbiertas++; c.abiertas++;
      if (r.vencimiento && r.vencimiento < hoy) { totalVencidas++; c.vencidas++; }
    } else if (r.completada_at) {
      nResueltas++;
      sumDias += (new Date(r.completada_at).getTime() - new Date(r.created_at).getTime()) / 86_400_000;
    }
  }

  return {
    totalAbiertas,
    totalVencidas,
    tiempoMedioDias: nResueltas ? Math.round((sumDias / nResueltas) * 10) / 10 : null,
    carga: [...carga.values()].sort((a, b) => b.abiertas - a.abiertas),
  };
}
