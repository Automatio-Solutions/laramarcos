import "server-only";
import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { procesarFactura } from "./procesar";
import { semaforo, type ClienteCarpeta, type Semaforo } from "./core";

/** Huella del fichero: la misma factura no se procesa dos veces (app o servidor). */
export const huella = (buffer: Buffer) => createHash("sha256").update(buffer).digest("hex");

export async function facturaPorHuella(
  admin: SupabaseClient,
  hash: string,
): Promise<{ id: string; cliente_id: string | null } | null> {
  const { data } = await admin.from("facturas_ocr").select("id, cliente_id").eq("archivo_hash", hash).maybeSingle();
  return data;
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
  archivo_nombre: string;
  origen: "app" | "servidor";
  /** Subida desde la app: ruta en Supabase Storage. */
  archivo_path?: string | null;
  /** Programa del servidor: ruta relativa en el servidor + huella del fichero. */
  ruta_servidor?: string | null;
  archivo_hash?: string | null;
  subido_por?: string | null;
}

/**
 * UC-402 + UC-403: lee la factura y la guarda. Mismo camino para la subida manual
 * y para el programa del servidor. `db` es el cliente con el que se inserta (el del
 * usuario, para respetar RLS, o el admin cuando llama el programa); `admin` se usa
 * para consultar la memoria de proveedores.
 */
export async function registrarFactura(
  db: SupabaseClient,
  admin: SupabaseClient,
  e: EntradaFactura,
): Promise<{ id: string; semaforo: Semaforo; fecha: string | null }> {
  const r = await procesarFactura(admin, e.base64, e.mime);
  const { data, error } = await db
    .from("facturas_ocr")
    .insert({
      cliente_id: e.cliente_id,
      numero_factura: r.numero_factura,
      proveedor_cif: r.proveedor_cif,
      proveedor_nombre: r.proveedor_nombre,
      fecha: r.fecha,
      concepto: r.concepto,
      base_imponible: r.base_imponible,
      iva_tipo: r.iva_tipo,
      iva_cuota: r.iva_cuota,
      retencion_base: r.retencion_base,
      retencion_tipo: r.retencion_tipo,
      retencion_cuota: r.retencion_cuota,
      total: r.total,
      subcuenta: r.subcuenta,
      subcuenta_motivo: r.subcuenta_motivo,
      subcuenta_origen: r.subcuenta_origen,
      confianza: r.confianza,
      origen: e.origen,
      archivo_path: e.archivo_path ?? null,
      archivo_nombre: e.archivo_nombre,
      ruta_servidor: e.ruta_servidor ?? null,
      archivo_hash: e.archivo_hash ?? null,
      subido_por: e.subido_por ?? null,
    })
    .select("id")
    .single();
  if (error) throw new Error(`No se pudo guardar la factura: ${error.message}`);
  return { id: data.id, semaforo: semaforo(r.confianza), fecha: r.fecha };
}

/**
 * AC-06/AC-10: memoria de proveedores. Si el proveedor no existe se crea (antes la
 * corrección de un proveedor nuevo se perdía). Con `sobrescribir` la subcuenta del
 * asesor pisa la habitual; sin él solo se rellena si no había ninguna.
 * Va con el cliente admin: el asesor no tiene permiso de escritura en proveedores
 * y esta memoria es del despacho, no de un usuario.
 */
export async function memorizarProveedor(
  admin: SupabaseClient,
  p: { cif: string | null; nombre: string | null; subcuenta: string | null; iva_tipo: number | null },
  { sobrescribir }: { sobrescribir: boolean },
): Promise<void> {
  const cif = p.cif?.trim().toUpperCase();
  if (!cif || !p.subcuenta) return;
  const { data: prov } = await admin
    .from("proveedores")
    .select("id, subcuenta_habitual, iva_default")
    .eq("cif", cif)
    .maybeSingle();
  if (!prov) {
    await admin.from("proveedores").insert({
      cif,
      nombre: p.nombre?.trim() || cif,
      subcuenta_habitual: p.subcuenta,
      iva_default: p.iva_tipo,
    });
    return;
  }
  const cambios: Record<string, unknown> = {};
  if (sobrescribir || !prov.subcuenta_habitual) cambios.subcuenta_habitual = p.subcuenta;
  if (prov.iva_default == null && p.iva_tipo != null) cambios.iva_default = p.iva_tipo;
  if (Object.keys(cambios).length) await admin.from("proveedores").update(cambios).eq("id", prov.id);
}
