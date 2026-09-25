"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { OFICINAS } from "@/lib/types";
import { resolverClienteRuta } from "@/lib/ocr/core";
import { MAX_BYTES_FACTURA, mimeFactura } from "@/lib/ocr/subida";
import {
  facturaPorHuella, huella, memorizarProveedor, registrarFactura, todosLosClientes,
} from "@/lib/ocr/registrar";

// ---------------------------------------------------------------------------
// UC-401: subida masiva desde la app (varios archivos o una carpeta entera).
// Los ficheros no pasan por Vercel (límite de 4,5 MB por petición): el navegador
// los sube directo a Storage con una URL firmada y luego pide procesar cada uno
// en su propia llamada (límite de 60 s por función). Las facturas del servidor
// del despacho entran por /api/agente/facturas.
// ---------------------------------------------------------------------------

export type ResultadoSubida =
  | { estado: "ok"; id: string; semaforo: "verde" | "naranja" | "rojo"; cliente: string | null }
  | { estado: "duplicada"; id: string }
  | { estado: "error"; mensaje: string };

/** Paso 1: URL firmada para subir un fichero a la carpeta del usuario en Storage. */
export async function prepararSubidaAction(
  nombre: string,
  tipo: string,
  tamano: number,
): Promise<{ path: string; token: string } | { error: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Sesión caducada. Vuelve a entrar." };
  if (!mimeFactura(nombre, tipo)) return { error: "Solo PDF o imagen (JPG, PNG, WEBP)." };
  if (tamano > MAX_BYTES_FACTURA) return { error: "Demasiado grande (máx. 20 MB)." };

  const seguro = nombre.replace(/[^\w.\-]/g, "_").slice(-120);
  const path = `${user.id}/${Date.now()}-${crypto.randomUUID().slice(0, 8)}-${seguro}`;
  const { data, error } = await createAdminClient().storage.from("facturas").createSignedUploadUrl(path);
  if (error || !data) return { error: `No se pudo preparar la subida: ${error?.message ?? "sin respuesta"}` };
  return { path: data.path, token: data.token };
}

/**
 * Paso 2: lee con IA el fichero ya subido y lo registra. Con `detectarCliente`
 * el cliente sale de las carpetas de `rutaRelativa` ("Don Benito/2034 - PÉREZ/…").
 */
export async function procesarSubidaAction(e: {
  path: string;
  nombre: string;
  tipo: string;
  rutaRelativa: string | null;
  cliente_id: string | null;
  detectarCliente: boolean;
}): Promise<ResultadoSubida> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { estado: "error", mensaje: "Sesión caducada. Vuelve a entrar." };
  // Solo se procesan ficheros de la carpeta del propio usuario.
  if (!e.path.startsWith(`${user.id}/`)) return { estado: "error", mensaje: "Ruta no válida." };
  const mime = mimeFactura(e.nombre, e.tipo);
  if (!mime) return { estado: "error", mensaje: "Solo PDF o imagen." };

  const admin = createAdminClient();
  const { data: blob, error } = await admin.storage.from("facturas").download(e.path);
  if (error || !blob) return { estado: "error", mensaje: "No se encontró el fichero subido." };
  const buffer = Buffer.from(await blob.arrayBuffer());
  const hash = huella(buffer);

  const previa = await facturaPorHuella(admin, hash);
  if (previa) {
    await admin.storage.from("facturas").remove([e.path]);
    return { estado: "duplicada", id: previa.id };
  }

  let cliente_id = e.cliente_id;
  let cliente: string | null = null;
  if (!cliente_id && e.detectarCliente && e.rutaRelativa) {
    const carpetas = e.rutaRelativa.replace(/\\/g, "/").split("/").slice(0, -1);
    const c = resolverClienteRuta(carpetas, await todosLosClientes(admin), OFICINAS);
    cliente_id = c?.id ?? null;
    cliente = c?.razon_social ?? null;
  }

  try {
    const r = await registrarFactura(supabase, admin, {
      base64: buffer.toString("base64"),
      mime,
      cliente_id,
      archivo_nombre: e.rutaRelativa ?? e.nombre,
      archivo_path: e.path,
      archivo_hash: hash,
      origen: "app",
      subido_por: user.id,
    });
    return { estado: "ok", id: r.id, semaforo: r.semaforo, cliente };
  } catch (err) {
    // La misma factura en dos envíos simultáneos: el índice único frena el segundo.
    const ganadora = await facturaPorHuella(admin, hash);
    if (ganadora) {
      await admin.storage.from("facturas").remove([e.path]);
      return { estado: "duplicada", id: ganadora.id };
    }
    return { estado: "error", mensaje: (err as Error).message };
  }
}

/** Al terminar un lote: refresca la tabla una sola vez, no por cada factura. */
export async function refrescarPrecontabilizacionAction() {
  revalidatePath("/precontabilizacion");
}

// UC-405: corrección manual con aprendizaje (la subcuenta se memoriza por proveedor).
export async function corregirFacturaAction(id: string, formData: FormData) {
  const supabase = await createClient();
  const texto = (k: string) => String(formData.get(k) ?? "").trim() || null;
  const num = (k: string) => {
    const v = String(formData.get(k) ?? "").replace(",", ".").trim();
    return v === "" ? null : Number(v);
  };
  const proveedor_cif = texto("proveedor_cif")?.toUpperCase() ?? null;
  const proveedor_nombre = texto("proveedor_nombre");
  const subcuenta = texto("subcuenta");
  const iva_tipo = num("iva_tipo");

  const { data: actualizada } = await supabase.from("facturas_ocr").update({
    cliente_id: texto("cliente_id"),
    fecha: texto("fecha"),
    numero_factura: texto("numero_factura"),
    proveedor_nombre,
    proveedor_cif,
    concepto: texto("concepto"),
    base_imponible: num("base_imponible"),
    iva_tipo,
    iva_cuota: num("iva_cuota"),
    retencion_base: num("retencion_base"),
    retencion_tipo: num("retencion_tipo"),
    retencion_cuota: num("retencion_cuota"),
    total: num("total"),
    subcuenta,
    // La corrección del asesor sustituye a la sugerencia de la IA.
    subcuenta_origen: subcuenta ? "manual" : null,
    subcuenta_motivo: subcuenta ? "Corregida manualmente por el asesor." : null,
    confianza: 100,
    revisada: true,
  }).eq("id", id).select("id");

  // AC-10: aprende la subcuenta del proveedor para futuras facturas. Solo si el
  // asesor podía editar esta factura (RLS): si no, el update no tocó ninguna fila.
  if (actualizada?.length) {
    await memorizarProveedor(
      createAdminClient(),
      { cif: proveedor_cif, nombre: proveedor_nombre, subcuenta, iva_tipo },
      { sobrescribir: true },
    );
  }

  revalidatePath("/precontabilizacion");
  redirect("/precontabilizacion");
}

export async function aprobarFacturaAction(id: string) {
  const supabase = await createClient();
  const { data: f } = await supabase
    .from("facturas_ocr")
    .update({ revisada: true })
    .eq("id", id)
    .select("proveedor_cif, proveedor_nombre, subcuenta, iva_tipo")
    .maybeSingle();
  // Aprobar confirma lo leído: un proveedor nuevo queda memorizado, pero no se
  // pisa la subcuenta habitual de uno conocido.
  if (f) {
    await memorizarProveedor(
      createAdminClient(),
      { cif: f.proveedor_cif, nombre: f.proveedor_nombre, subcuenta: f.subcuenta, iva_tipo: f.iva_tipo },
      { sobrescribir: false },
    );
  }
  revalidatePath("/precontabilizacion");
}
