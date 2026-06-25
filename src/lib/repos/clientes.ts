import { createClient } from "@/lib/supabase/server";
import type {
  ClienteConRelaciones,
  Sector,
  Usuario,
} from "@/lib/types";

interface ClienteRow {
  id: string;
  cif: string;
  razon_social: string;
  direccion: string | null;
  ciudad: string | null;
  codigo_postal: string | null;
  email: string | null;
  telefono: string | null;
  iban: string | null;
  condiciones_pago: string | null;
  tarifas: Record<string, unknown>;
  asesor_id: string | null;
  activo: boolean;
  created_at: string;
  asesor: { nombre: string } | null;
  cliente_sectores: { sector: Sector | null }[];
}

function mapCliente(row: ClienteRow): ClienteConRelaciones {
  return {
    id: row.id,
    cif: row.cif,
    razon_social: row.razon_social,
    direccion: row.direccion,
    ciudad: row.ciudad,
    codigo_postal: row.codigo_postal,
    email: row.email,
    telefono: row.telefono,
    iban: row.iban,
    condiciones_pago: row.condiciones_pago,
    tarifas: row.tarifas ?? {},
    asesor_id: row.asesor_id,
    activo: row.activo,
    created_at: row.created_at,
    asesor_nombre: row.asesor?.nombre ?? null,
    sectores: (row.cliente_sectores ?? [])
      .map((cs) => cs.sector)
      .filter((s): s is Sector => Boolean(s)),
  };
}

const SELECT =
  "*, asesor:usuarios!clientes_asesor_id_fkey(nombre), cliente_sectores(sector:sectores(id,nombre))";

export async function listClientes(search?: string): Promise<ClienteConRelaciones[]> {
  const supabase = await createClient();
  let query = supabase.from("clientes").select(SELECT).order("razon_social");
  if (search?.trim()) {
    const term = `%${search.trim()}%`;
    query = query.or(`razon_social.ilike.${term},cif.ilike.${term}`);
  }
  const { data, error } = await query;
  if (error) throw error;
  return (data as unknown as ClienteRow[]).map(mapCliente);
}

export async function getCliente(id: string): Promise<ClienteConRelaciones | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("clientes")
    .select(SELECT)
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  return data ? mapCliente(data as unknown as ClienteRow) : null;
}

export async function listSectores(): Promise<Sector[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("sectores")
    .select("id,nombre")
    .order("nombre");
  if (error) throw error;
  return (data ?? []) as Sector[];
}

export async function listAsesores(): Promise<Usuario[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("usuarios")
    .select("id,nombre,email,rol")
    .eq("activo", true)
    .order("nombre");
  if (error) throw error;
  return (data ?? []) as Usuario[];
}
