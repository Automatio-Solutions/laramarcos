import { createClient } from "@/lib/supabase/server";

export interface AuditoriaRow {
  id: number;
  usuario_id: string | null;
  tabla: string;
  registro_id: string | null;
  operacion: string;
  ts: string;
}

export interface AuditoriaFiltros {
  tabla?: string;
  desde?: string;
  hasta?: string;
}

export async function listAuditoria(f: AuditoriaFiltros): Promise<AuditoriaRow[]> {
  const supabase = await createClient();
  let query = supabase
    .from("auditoria")
    .select("id, usuario_id, tabla, registro_id, operacion, ts")
    .order("ts", { ascending: false })
    .limit(200);

  if (f.tabla) query = query.eq("tabla", f.tabla);
  if (f.desde) query = query.gte("ts", f.desde);
  if (f.hasta) query = query.lte("ts", `${f.hasta}T23:59:59`);

  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []) as AuditoriaRow[];
}
