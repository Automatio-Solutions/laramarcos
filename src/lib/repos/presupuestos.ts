import { createClient } from "@/lib/supabase/server";
import type { PresupuestoConCliente } from "@/lib/types";

const SELECT =
  "id, cliente_id, servicio_id, estado, lineas, descuento_global, total, condiciones, validez_dias, token, tarea_id, created_at, cliente:clientes(razon_social, cif)";

function map(row: Record<string, unknown>): PresupuestoConCliente {
  const c = row.cliente as { razon_social: string; cif: string } | null;
  return {
    id: row.id as string,
    cliente_id: row.cliente_id as string | null,
    servicio_id: row.servicio_id as string | null,
    estado: row.estado as PresupuestoConCliente["estado"],
    lineas: (row.lineas as PresupuestoConCliente["lineas"]) ?? [],
    descuento_global: Number(row.descuento_global ?? 0),
    total: Number(row.total ?? 0),
    condiciones: row.condiciones as string | null,
    validez_dias: row.validez_dias as number,
    token: row.token as string,
    tarea_id: row.tarea_id as string | null,
    created_at: row.created_at as string,
    cliente_nombre: c?.razon_social ?? null,
    cliente_cif: c?.cif ?? null,
  };
}

export async function listPresupuestos(): Promise<PresupuestoConCliente[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("presupuestos").select(SELECT).order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []).map((r) => map(r as Record<string, unknown>));
}

export async function getPresupuesto(id: string): Promise<PresupuestoConCliente | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("presupuestos").select(SELECT).eq("id", id).maybeSingle();
  if (error) throw error;
  return data ? map(data as Record<string, unknown>) : null;
}
