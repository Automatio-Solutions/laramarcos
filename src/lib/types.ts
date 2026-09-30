export type Rol = "responsable" | "asesor" | "admin";

export const ROLES: Rol[] = ["responsable", "asesor", "admin"];

export const ROL_LABEL: Record<Rol, string> = {
  responsable: "Responsable",
  asesor: "Asesor",
  admin: "Administrador",
};

/** Sedes del despacho. Un asesor solo ve la cartera de su oficina. */
export const OFICINAS = ["Badajoz", "Castuera", "Don Benito", "Orellana"] as const;
export type Oficina = (typeof OFICINAS)[number];

/** Sociedades → partida doble (subcuentas); autónomos → programa fiscal (código de concepto). */
export type RegimenContable = "partida_doble" | "fiscal";

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

/** Usuario con los campos de gestión (apartado Usuarios, solo staff). */
export interface UsuarioDetalle extends Usuario {
  activo: boolean;
  oficina: Oficina | null;
  created_at: string;
}

/** Datos del formulario de alta/edición de usuario. */
export interface UsuarioInput {
  nombre: string;
  email: string;
  rol: Rol;
  oficina?: Oficina | null;
}

export interface Cliente {
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
  carpeta_url: string | null;   // carpeta del cliente en el servidor del despacho
  /** Cómo se lleva su contabilidad (M4). null = se deduce del NIF. */
  regimen_contable: RegimenContable | null;
  fecha_baja: string | null;    // fecha en que dejó el servicio (null = activo)
  activo: boolean;
  created_at: string;
}

/** Cuenta bancaria del cliente. Un cliente puede tener varias. */
export interface CuentaCliente {
  id: string;
  iban: string;
  descripcion: string | null; // nombre corto para reconocerla
}

/** Un cambio de precio de la cuota, con la fecha desde la que aplica. */
export interface CuotaServicio {
  id: string;
  importe: number;
  fecha_efecto: string;
  nota: string | null;
}

/** Servicio contratado por el cliente, con su cuota actual y su evolución. */
export interface ServicioContratado {
  id: string;
  servicio_id: string;
  servicio_nombre: string;
  fecha_inicio: string;
  fecha_fin: string | null;
  cuotaActual: number | null;      // importe vigente hoy
  cuotas: CuotaServicio[];         // histórico, de más reciente a más antigua
}

/** Cliente con sus sectores y el nombre del asesor (vista de listado/ficha). */
export interface ClienteConRelaciones extends Cliente {
  sectores: Sector[];
  asesor_nombre: string | null;
  cuentas: CuentaCliente[];
  servicios: ServicioContratado[];
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

export type EstadoPresupuesto = "borrador" | "enviado" | "abierto" | "aceptado" | "rechazado";

export interface LineaPresupuestoT {
  concepto: string;
  cantidad: number;
  precio: number;
  descuento: number;
}

export interface Presupuesto {
  id: string;
  cliente_id: string | null;
  servicio_id: string | null;
  estado: EstadoPresupuesto;
  lineas: LineaPresupuestoT[];
  descuento_global: number;
  total: number;
  condiciones: string | null;
  validez_dias: number;
  token: string;
  tarea_id: string | null;
  created_at: string;
}

export interface PresupuestoConCliente extends Presupuesto {
  cliente_nombre: string | null;
  cliente_cif: string | null;
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
  subtareas_pendientes: number;
  bloqueada_por: string[]; // nombres de asignados con subtarea vencida sin completar
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

/** Una cuenta tal y como llega del formulario (aún sin id si es nueva). */
export interface CuentaInput {
  iban: string;
  descripcion?: string;
}

/** Datos del formulario de alta/edición. */
export interface ClienteInput {
  cif: string;
  razon_social: string;
  direccion?: string;
  ciudad?: string;
  codigo_postal?: string;
  email?: string;
  telefono?: string;
  asesor_id?: string | null;
  oficina?: Oficina | null;
  carpeta_url?: string;
  regimen_contable?: RegimenContable | null;
  fecha_baja?: string;
  cuentas: CuentaInput[];
  sector_ids: string[];
}

/* ---------------------------------------------------------------------------
 * Chat interno (US-06)
 * ------------------------------------------------------------------------- */

/** general = todo el despacho · oficina = canal de sede · directo = 1:1 · cliente = hilo de un cliente. */
export type ChatTipo = "general" | "oficina" | "directo" | "cliente";

export interface Conversacion {
  id: string;
  tipo: ChatTipo;
  nombre: string | null;          // null en directos: se muestra el otro participante
  oficina: Oficina | null;
  cliente_id: string | null;
  usuario_a: string | null;
  usuario_b: string | null;
  ultimo_mensaje_at: string | null;
}

/** Conversación tal y como se lista en la bandeja del chat. */
export interface ConversacionListada extends Conversacion {
  titulo: string;                 // nombre a mostrar (canal, compañero o cliente)
  no_leidos: number;
}

export interface Mensaje {
  id: string;
  conversacion_id: string;
  autor_id: string | null;
  autor_nombre?: string | null;
  texto: string;
  menciones: string[];
  editado_at: string | null;
  borrado: boolean;
  created_at: string;
  /** UC-610: adjunto (todos o ninguno). Opcionales: sin la migración 0023 no existen. */
  adjunto_path?: string | null;
  adjunto_nombre?: string | null;
  adjunto_mime?: string | null;
  adjunto_size?: number | null;
}

/** UC-611: resultado de la búsqueda de mensajes (función chat_buscar). */
export interface ResultadoBusqueda {
  id: string;
  conversacion_id: string;
  autor_id: string | null;
  autor_nombre: string | null;
  texto: string;
  created_at: string;
  adjunto_nombre: string | null;
}

/** Compañero activo del despacho (directorio del chat). */
export interface CompaneroDirectorio {
  id: string;
  nombre: string;
  oficina: Oficina | null;
  rol: Rol;
}
