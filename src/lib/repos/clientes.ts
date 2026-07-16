import { createClient } from "@/lib/supabase/server";
import type {
  ClienteConRelaciones,
  CuentaCliente,
  Oficina,
  Sector,
  ServicioContratado,
  Usuario,
} from "@/lib/types";

export interface ClienteFiltros {
  q?: string;
  sector?: string;   // id de sector
  servicio?: string; // id de servicio contratado
}

interface CuotaRow {
  id: string;
  importe: string | number;
  fecha_efecto: string;
  nota: string | null;
}

interface ClienteServicioRow {
  id: string;
  servicio_id: string;
  fecha_inicio: string;
  fecha_fin: string | null;
  servicio: { nombre: string } | null;
  cliente_servicio_cuotas: CuotaRow[];
}

interface ClienteRow {
  id: string;
  cif: string;
  razon_social: string;
  direccion: string | null;
  ciudad: string | null;
  codigo_postal: string | null;
  email: string | null;
  telefono: string | null;
  tarifas: Record<string, unknown>;
  asesor_id: string | null;
  oficina: Oficina | null;
  carpeta_url: string | null;
  fecha_baja: string | null;
  activo: boolean;
  created_at: string;
  asesor: { nombre: string } | null;
  cliente_sectores: { sector: Sector | null }[];
  cliente_cuentas: CuentaCliente[];
  cliente_servicios: ClienteServicioRow[];
}

const HOY = () => new Date().toISOString().slice(0, 10);

/** Ordena el histórico (más reciente primero) y calcula la cuota vigente hoy. */
function mapServicio(cs: ClienteServicioRow): ServicioContratado {
  const hoy = HOY();
  const cuotas = (cs.cliente_servicio_cuotas ?? [])
    .map((c) => ({ id: c.id, importe: Number(c.importe), fecha_efecto: c.fecha_efecto, nota: c.nota }))
    .sort((a, b) => (a.fecha_efecto < b.fecha_efecto ? 1 : -1));
  // La cuota vigente es la más reciente cuya fecha de efecto ya ha llegado.
  const vigente = cuotas.find((c) => c.fecha_efecto <= hoy) ?? null;
  return {
    id: cs.id,
    servicio_id: cs.servicio_id,
    servicio_nombre: cs.servicio?.nombre ?? "—",
    fecha_inicio: cs.fecha_inicio,
    fecha_fin: cs.fecha_fin,
    cuotaActual: vigente ? vigente.importe : null,
    cuotas,
  };
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
    tarifas: row.tarifas ?? {},
    asesor_id: row.asesor_id,
    oficina: row.oficina,
    carpeta_url: row.carpeta_url,
    fecha_baja: row.fecha_baja,
    activo: row.activo,
    created_at: row.created_at,
    asesor_nombre: row.asesor?.nombre ?? null,
    sectores: (row.cliente_sectores ?? [])
      .map((cs) => cs.sector)
      .filter((s): s is Sector => Boolean(s)),
    cuentas: row.cliente_cuentas ?? [],
    servicios: (row.cliente_servicios ?? [])
      .map(mapServicio)
      .sort((a, b) => (a.fecha_inicio < b.fecha_inicio ? 1 : -1)),
  };
}

const SELECT =
  "*, asesor:usuarios!clientes_asesor_id_fkey(nombre), cliente_sectores(sector:sectores(id,nombre))," +
  "cliente_cuentas(id, iban, descripcion)," +
  "cliente_servicios(id, servicio_id, fecha_inicio, fecha_fin, servicio:servicios(nombre), cliente_servicio_cuotas(id, importe, fecha_efecto, nota))";

export async function listClientes(f: ClienteFiltros = {}): Promise<ClienteConRelaciones[]> {
  const supabase = await createClient();
  let query = supabase.from("clientes").select(SELECT).order("razon_social");
  if (f.q?.trim()) {
    const term = `%${f.q.trim()}%`;
    query = query.or(`razon_social.ilike.${term},cif.ilike.${term}`);
  }
  const { data, error } = await query;
  if (error) throw error;

  let clientes = (data as unknown as ClienteRow[]).map(mapCliente);
  // Etiquetado: filtrado por sector y por servicio contratado.
  if (f.sector) clientes = clientes.filter((c) => c.sectores.some((s) => s.id === f.sector));
  if (f.servicio) clientes = clientes.filter((c) => c.servicios.some((s) => s.servicio_id === f.servicio));
  return clientes;
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

/** Servicios del catálogo activos (para contratar y para filtrar la cartera). */
export async function listServiciosCatalogo(): Promise<{ id: string; nombre: string }[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("servicios")
    .select("id,nombre")
    .eq("activo", true)
    .order("nombre");
  if (error) throw error;
  return (data ?? []) as { id: string; nombre: string }[];
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

/** Oficina del usuario conectado (para prefijar el alta de cliente). */
export async function getMiOficina(): Promise<Oficina | null> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data } = await supabase.from("usuarios").select("oficina").eq("id", user.id).maybeSingle();
  return (data?.oficina as Oficina | null) ?? null;
}
