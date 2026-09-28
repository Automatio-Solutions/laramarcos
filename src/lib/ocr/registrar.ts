import "server-only";
import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { procesarFactura } from "./procesar";
import { actualizarAvisoPendientes } from "./avisos";
import {
  AVISO_CORTE, confianzaConAvisos, fechaContablePorCarpeta, mismaFactura, semaforo,
  type ClienteCarpeta, type Semaforo, type TipoFactura,
} from "./core";

/** Huella del fichero: la misma factura no se procesa dos veces (app o servidor). */
export const huella = (buffer: Buffer) => createHash("sha256").update(buffer).digest("hex");

export async function facturaPorHuella(
  admin: SupabaseClient,
  hash: string,
): Promise<{ id: string; cliente_id: string | null } | null> {
  const { data } = await admin.from("facturas_ocr").select("id, cliente_id").eq("archivo_hash", hash).maybeSingle();
  return data;
}

/** Huella de una factura dentro de un PDF con varias: la del PDF + sus páginas. */
export const huellaPaginas = (hashPdf: string, desde: number, hasta: number) =>
  createHash("sha256").update(`${hashPdf}:${desde}-${hasta}`).digest("hex");

/**
 * ¿Ya está esta factura? Mismo cliente, libro, NIF del tercero y nº de factura.
 * Sin cliente, NIF o número no se puede saber: se da por nueva.
 */
export async function facturaDuplicada(
  admin: SupabaseClient,
  f: { cliente_id: string | null; tipo: TipoFactura; proveedor_cif: string | null; numero_factura: string | null },
): Promise<string | null> {
  if (!f.cliente_id || !f.proveedor_cif || !f.numero_factura) return null;
  const { data } = await admin
    .from("facturas_ocr")
    .select("id, proveedor_cif, numero_factura")
    .eq("cliente_id", f.cliente_id)
    .eq("tipo", f.tipo)
    .eq("proveedor_cif", f.proveedor_cif.toUpperCase())
    .not("numero_factura", "is", null);
  return (data ?? []).find((x) => mismaFactura(x, f))?.id ?? null;
}

/** La cartera supera las 1000 filas que devuelve Supabase por consulta. */
export async function todosLosClientes(admin: SupabaseClient): Promise<ClienteCarpeta[]> {
  const todos: ClienteCarpeta[] = [];
  for (let desde = 0; ; desde += 1000) {
    const { data } = await admin
      .from("clientes")
      .select("id, codigo, cif, razon_social, oficina")
      .order("id")
      .range(desde, desde + 999);
    todos.push(...((data ?? []) as ClienteCarpeta[]));
    if (!data || data.length < 1000) return todos;
  }
}

export interface EntradaFactura {
  base64: string;
  mime: string;
  cliente_id: string | null;
  /** Libro: gastos (recibidas) o ingresos (emitidas). */
  tipo: TipoFactura;
  /** Libro del servidor ("2026-1T"): si la factura es de antes, se contabiliza ahí. */
  trimestreCarpeta?: string | null;
  archivo_nombre: string;
  origen: "app" | "servidor";
  /** Subida desde la app: ruta en Supabase Storage. */
  archivo_path?: string | null;
  /** Programa del servidor: ruta relativa en el servidor + huella del fichero. */
  ruta_servidor?: string | null;
  archivo_hash?: string | null;
  subido_por?: string | null;
  /** Factura sacada de un PDF con varias: sus páginas y si el corte es dudoso. */
  paginas?: { desde: number; hasta: number; dudoso: boolean } | null;
}

/**
 * UC-402 + UC-403: lee la factura y la guarda. Mismo camino para la subida manual
 * y para el programa del servidor. `db` es el cliente con el que se inserta (el del
 * usuario, para respetar RLS, o el admin cuando llama el programa); `admin` se usa
 * para el contexto del cliente y la memoria de cuentas.
 */
export async function registrarFactura(
  db: SupabaseClient,
  admin: SupabaseClient,
  e: EntradaFactura,
): Promise<{ id: string; semaforo: Semaforo; fecha: string | null; duplicada: boolean }> {
  const { data: cliente } = e.cliente_id
    ? await admin.from("clientes").select("id, cif, razon_social, regimen_contable").eq("id", e.cliente_id).maybeSingle()
    : { data: null };
  const r = await procesarFactura(admin, e.base64, e.mime, { tipo: e.tipo, cliente });

  // Misma factura ya registrada (p. ej. el PDF del trimestre reenviado con más facturas).
  const previa = await facturaDuplicada(admin, {
    cliente_id: e.cliente_id, tipo: e.tipo, proveedor_cif: r.proveedor_cif, numero_factura: r.numero_factura,
  });
  if (previa) return { id: previa, semaforo: semaforo(r.confianza), fecha: r.fecha, duplicada: true };

  if (e.paginas?.dudoso) {
    r.avisos = [AVISO_CORTE, ...r.avisos];
    r.confianza = confianzaConAvisos(r.confianza, r.avisos);
  }
  const { data, error } = await db
    .from("facturas_ocr")
    .insert({
      cliente_id: e.cliente_id,
      tipo: e.tipo,
      numero_factura: r.numero_factura,
      proveedor_cif: r.proveedor_cif,
      proveedor_nombre: r.proveedor_nombre,
      fecha: r.fecha,
      fecha_contable: fechaContablePorCarpeta(r.fecha, e.trimestreCarpeta ?? null),
      concepto: r.concepto,
      base_imponible: r.base_imponible,
      iva_tipo: r.iva_tipo,
      iva_cuota: r.iva_cuota,
      lineas_iva: r.lineas_iva,
      retencion_base: r.retencion_base,
      retencion_tipo: r.retencion_tipo,
      retencion_cuota: r.retencion_cuota,
      total: r.total,
      subcuenta: r.subcuenta,
      subcuenta_tercero: r.subcuenta_tercero,
      sujeto_pasivo: r.sujeto_pasivo,
      subcuenta_motivo: r.subcuenta_motivo,
      subcuenta_origen: r.subcuenta_origen,
      avisos: r.avisos,
      confianza: r.confianza,
      origen: e.origen,
      archivo_path: e.archivo_path ?? null,
      archivo_nombre: e.archivo_nombre,
      ruta_servidor: e.ruta_servidor ?? null,
      archivo_hash: e.archivo_hash ?? null,
      subido_por: e.subido_por ?? null,
      pagina_desde: e.paginas?.desde ?? null,
      pagina_hasta: e.paginas?.hasta ?? null,
    })
    .select("id")
    .single();
  if (error) throw new Error(`No se pudo guardar la factura: ${error.message}`);
  // Naranja o roja: avisa en la campana a quien revisa ese cliente.
  if (semaforo(r.confianza) !== "verde") await actualizarAvisoPendientes(admin, e.cliente_id, e.tipo);
  return { id: data.id, semaforo: semaforo(r.confianza), fecha: r.fecha, duplicada: false };
}

/**
 * AC-06/AC-10: memoria de cuentas POR CLIENTE. El mismo proveedor tiene una
 * subcuenta distinta en cada empresa que lleva el despacho, así que se guarda por
 * cliente + libro + NIF. Con `sobrescribir` lo que pone el asesor pisa lo
 * memorizado; sin él (aprobar) solo rellena lo que faltaba. Va con el cliente
 * admin: es memoria del despacho, no de un usuario.
 */
export async function memorizarCuentas(
  admin: SupabaseClient,
  m: {
    cliente_id: string | null;
    tipo: TipoFactura;
    nif: string | null;
    nombre: string | null;
    subcuenta: string | null;
    subcuenta_tercero: string | null;
    iva_tipo: number | null;
  },
  { sobrescribir }: { sobrescribir: boolean },
): Promise<void> {
  const nif = m.nif?.trim().toUpperCase();
  if (!m.cliente_id || !nif || (!m.subcuenta && !m.subcuenta_tercero)) return;
  const { data: prev } = await admin
    .from("cuentas_terceros")
    .select("id, subcuenta, subcuenta_tercero, iva_default")
    .eq("cliente_id", m.cliente_id)
    .eq("tipo", m.tipo)
    .eq("nif", nif)
    .maybeSingle();
  if (!prev) {
    await admin.from("cuentas_terceros").insert({
      cliente_id: m.cliente_id, tipo: m.tipo, nif, nombre: m.nombre?.trim() || null,
      subcuenta: m.subcuenta, subcuenta_tercero: m.subcuenta_tercero, iva_default: m.iva_tipo,
    });
    return;
  }
  const cambios: Record<string, unknown> = {};
  if (m.subcuenta && (sobrescribir || !prev.subcuenta)) cambios.subcuenta = m.subcuenta;
  if (m.subcuenta_tercero && (sobrescribir || !prev.subcuenta_tercero)) cambios.subcuenta_tercero = m.subcuenta_tercero;
  if (prev.iva_default == null && m.iva_tipo != null) cambios.iva_default = m.iva_tipo;
  if (Object.keys(cambios).length) await admin.from("cuentas_terceros").update(cambios).eq("id", prev.id);
}
