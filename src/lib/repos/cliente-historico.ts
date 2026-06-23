import { createClient } from "@/lib/supabase/server";

export interface HistoricoTarea { id: string; titulo: string; estado: string; vencimiento: string | null; }
export interface HistoricoLinea { id: string; concepto: string; importe: number; facturada: boolean; }

export interface ClienteHistorico {
  tareas: HistoricoTarea[];
  lineas: HistoricoLinea[];
  totalFacturado: number;
  totalPendiente: number;
}

export async function getClienteHistorico(clienteId: string): Promise<ClienteHistorico> {
  const supabase = await createClient();
  const [tRes, lRes] = await Promise.all([
    supabase.from("tareas").select("id, titulo, estado, vencimiento").eq("cliente_id", clienteId).order("created_at", { ascending: false }),
    supabase.from("lineas_factura").select("id, concepto, importe, facturada").eq("cliente_id", clienteId).order("created_at", { ascending: false }),
  ]);
  const tareas = (tRes.data ?? []) as HistoricoTarea[];
  const lineas = (lRes.data ?? []) as HistoricoLinea[];
  return {
    tareas,
    lineas,
    totalFacturado: lineas.filter((l) => l.facturada).reduce((a, l) => a + Number(l.importe), 0),
    totalPendiente: lineas.filter((l) => !l.facturada).reduce((a, l) => a + Number(l.importe), 0),
  };
}
