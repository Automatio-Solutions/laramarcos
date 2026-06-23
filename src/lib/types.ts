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

export interface Servicio {
  id: string;
  nombre: string;
  categoria: string | null;
  precio_base: number;
  condiciones_default: string | null;
  activo: boolean;
  created_at: string;
}

export interface Notificacion {
  id: string;
  tipo: string;
  mensaje: string;
  enlace: string | null;
  leida: boolean;
  created_at: string;
}

export type EstadoTarea = "pendiente" | "en_curso" | "bloqueada" | "completada";

export interface Tarea {
  id: string;
  cliente_id: string | null;
  titulo: string;
  descripcion: string | null;
  categoria: string | null;
  estado: EstadoTarea;
  vencimiento: string | null;
  bloqueada: boolean;
  motivo_bloqueo: string | null;
  responsable_id: string | null;
  created_at: string;
}

export interface TareaConRelaciones extends Tarea {
  cliente_nombre: string | null;
  responsable_nombre: string | null;
}

export interface Subtarea {
  id: string;
  tarea_id: string;
  titulo: string;
  asignado_id: string | null;
  asignado_nombre: string | null;
  plazo: string | null;
  estado: EstadoTarea;
  orden: number;
}

export interface ComentarioConAutor {
  id: string;
  texto: string;
  autor_nombre: string;
  menciones: string[];
  created_at: string;
}

export interface TiempoRow {
  id: string;
  segundos: number;
  nota: string | null;
  usuario_nombre: string | null;
  ts: string;
}

export interface DependenciaTarea {
  depende_de_id: string;
  titulo: string;
  estado: EstadoTarea;
}

export interface PasoPlantilla {
  orden: number;
  nombre: string;
  plazo_relativo_dias: number;
}

export interface Proveedor {
  id: string;
  cif: string;
  nombre: string;
  subcuenta_habitual: string | null;
  iva_default: number | null;
  created_at: string;
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
