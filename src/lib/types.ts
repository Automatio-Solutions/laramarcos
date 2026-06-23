export type Rol = "responsable" | "asesor" | "admin";

export interface Sector {
  id: string;
  nombre: string;
}

export interface Usuario {
  id: string;
  nombre: string;
  email: string;
  rol: Rol;
}

export interface Cliente {
  id: string;
  cif: string;
  razon_social: string;
  direccion: string | null;
  email: string | null;
  telefono: string | null;
  iban: string | null;
  condiciones_pago: string | null;
  tarifas: Record<string, unknown>;
  asesor_id: string | null;
  activo: boolean;
  created_at: string;
}

/** Cliente con sus sectores y el nombre del asesor (vista de listado/ficha). */
export interface ClienteConRelaciones extends Cliente {
  sectores: Sector[];
  asesor_nombre: string | null;
}

/** Datos del formulario de alta/edición. */
export interface ClienteInput {
  cif: string;
  razon_social: string;
  direccion?: string;
  email?: string;
  telefono?: string;
  iban?: string;
  condiciones_pago?: string;
  asesor_id?: string | null;
  sector_ids: string[];
}
