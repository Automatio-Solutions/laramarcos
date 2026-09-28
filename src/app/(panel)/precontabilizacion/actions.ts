"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { OFICINAS } from "@/lib/types";
import {
  avisosFactura, cuentaSegunRegimen, regimenDe, resolverClienteRuta, tipoDeCarpetas,
  type LineaIva, type TipoFactura,
} from "@/lib/ocr/core";
import { codigosDe } from "@/lib/ocr/conceptos";
import { actualizarAvisoPendientes } from "@/lib/ocr/avisos";
import { MAX_BYTES_FACTURA, mimeFactura } from "@/lib/ocr/subida";
import {
  facturaPorHuella, huella, memorizarCuentas, registrarFactura, todosLosClientes,
} from "@/lib/ocr/registrar";

// ---------------------------------------------------------------------------
// UC-401: subida masiva desde la app (varios archivos o una carpeta entera).
// Los ficheros no pasan por Vercel (límite de 4,5 MB por petición): el navegador
// los sube directo a Storage con una URL firmada y luego pide procesar cada uno
// en su propia llamada (límite de 60 s por función). Las facturas del servidor
// del despacho entran por /api/agente/facturas.
// Toda factura subida desde la app lleva cliente: sin él no sale en ningún Excel.
// ---------------------------------------------------------------------------

export type ResultadoSubida =
  | { estado: "ok"; id: string; semaforo: "verde" | "naranja" | "rojo" }
  | { estado: "duplicada"; id: string }
  | { estado: "error"; mensaje: string };

const SIN_CLIENTE = "Elige el cliente de la factura.";

/** El cliente existe y el usuario lo ve (RLS): un asesor no sube a clientes ajenos. */
async function clienteVisible(supabase: Awaited<ReturnType<typeof createClient>>, id: string | null) {
  if (!id) return false;
  const { data } = await supabase.from("clientes").select("id").eq("id", id).maybeSingle();
  return !!data;
}

/**
 * "Detectar por carpeta": cliente y libro (GASTOS/INGRESOS) de cada archivo a
 * partir de su ruta ("LARAMARCOS_BADAJOZ/01. CLIENTES/KANTARADS…/GASTOS/f.pdf"),
 * antes de subir nada. Lo no detectado no se sube. Solo entre los clientes que
 * el usuario puede ver.
 */
export async function detectarClientesAction(
  rutas: (string | null)[],
): Promise<{ cliente: { id: string; razon_social: string } | null; libro: TipoFactura | null }[]> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return rutas.map(() => ({ cliente: null, libro: null }));
  const clientes = await todosLosClientes(supabase);
  return rutas.map((ruta) => {
    if (!ruta) return { cliente: null, libro: null };
    const carpetas = ruta.replace(/\\/g, "/").split("/").slice(0, -1);
    const c = resolverClienteRuta(carpetas, clientes, OFICINAS);
    return { cliente: c ? { id: c.id, razon_social: c.razon_social } : null, libro: tipoDeCarpetas(carpetas) };
  });
}

/** Paso 1: URL firmada para subir un fichero a la carpeta del usuario en Storage. */
export async function prepararSubidaAction(
  nombre: string,
  mimeNavegador: string,
  tamano: number,
  cliente_id: string | null,
): Promise<{ path: string; token: string } | { error: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Sesión caducada. Vuelve a entrar." };
  if (!(await clienteVisible(supabase, cliente_id))) return { error: SIN_CLIENTE };
  if (!mimeFactura(nombre, mimeNavegador)) return { error: "Solo PDF o imagen (JPG, PNG, WEBP)." };
  if (tamano > MAX_BYTES_FACTURA) return { error: "Demasiado grande (máx. 20 MB)." };

  const seguro = nombre.replace(/[^\w.\-]/g, "_").slice(-120);
  const path = `${user.id}/${Date.now()}-${crypto.randomUUID().slice(0, 8)}-${seguro}`;
  const { data, error } = await createAdminClient().storage.from("facturas").createSignedUploadUrl(path);
  if (error || !data) return { error: `No se pudo preparar la subida: ${error?.message ?? "sin respuesta"}` };
  return { path: data.path, token: data.token };
}

/** Paso 2: lee con IA el fichero ya subido y lo registra en su cliente y su libro. */
export async function procesarSubidaAction(e: {
  path: string;
  nombre: string;
  mimeNavegador: string;
  rutaRelativa: string | null;
  cliente_id: string;
  libro: TipoFactura;
}): Promise<ResultadoSubida> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { estado: "error", mensaje: "Sesión caducada. Vuelve a entrar." };
  // Solo se procesan ficheros de la carpeta del propio usuario.
  if (!e.path.startsWith(`${user.id}/`)) return { estado: "error", mensaje: "Ruta no válida." };
  const admin = createAdminClient();
  if (!(await clienteVisible(supabase, e.cliente_id))) {
    await admin.storage.from("facturas").remove([e.path]);
    return { estado: "error", mensaje: SIN_CLIENTE };
  }
  if (e.libro !== "gasto" && e.libro !== "ingreso") return { estado: "error", mensaje: "Elige gastos o ingresos." };
  const mime = mimeFactura(e.nombre, e.mimeNavegador);
  if (!mime) return { estado: "error", mensaje: "Solo PDF o imagen." };

  const { data: blob, error } = await admin.storage.from("facturas").download(e.path);
  if (error || !blob) return { estado: "error", mensaje: "No se encontró el fichero subido." };
  const buffer = Buffer.from(await blob.arrayBuffer());
  const hash = huella(buffer);

  const previa = await facturaPorHuella(admin, hash);
  if (previa) {
    await admin.storage.from("facturas").remove([e.path]);
    return { estado: "duplicada", id: previa.id };
  }

  try {
    const r = await registrarFactura(supabase, admin, {
      base64: buffer.toString("base64"),
      mime,
      cliente_id: e.cliente_id,
      tipo: e.libro,
      archivo_nombre: e.rutaRelativa ?? e.nombre,
      archivo_path: e.path,
      archivo_hash: hash,
      origen: "app",
      subido_por: user.id,
    });
    return { estado: "ok", id: r.id, semaforo: r.semaforo };
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

/** Líneas de IVA del formulario de revisión (linea_base_0, linea_tipo_0, linea_cuota_0…). */
function lineasDelFormulario(formData: FormData, num: (k: string) => number | null): LineaIva[] {
  const lineas: LineaIva[] = [];
  for (let i = 0; i < 4; i++) {
    const l = { base: num(`linea_base_${i}`), tipo: num(`linea_tipo_${i}`), cuota: num(`linea_cuota_${i}`) };
    if (l.base != null || l.cuota != null) lineas.push(l);
  }
  return lineas;
}

// UC-405: corrección manual con aprendizaje (las cuentas se memorizan por cliente y proveedor).
export async function corregirFacturaAction(id: string, formData: FormData) {
  const supabase = await createClient();
  const texto = (k: string) => String(formData.get(k) ?? "").trim() || null;
  const num = (k: string) => {
    const v = String(formData.get(k) ?? "").replace(",", ".").trim();
    return v === "" ? null : Number(v);
  };
  // Sin cliente la factura no sale en ningún Excel: no se puede dar por revisada.
  const cliente_id = texto("cliente_id");
  if (!(await clienteVisible(supabase, cliente_id))) redirect(`/precontabilizacion/${id}?error=cliente`);
  const { data: cliente } = await supabase.from("clientes").select("cif, regimen_contable").eq("id", cliente_id!).single();
  const regimen = regimenDe(cliente?.cif, cliente?.regimen_contable);

  const tipo: TipoFactura = texto("tipo") === "ingreso" ? "ingreso" : "gasto";
  const proveedor_cif = texto("proveedor_cif")?.replace(/[\s.-]/g, "").toUpperCase() ?? null;
  const proveedor_nombre = texto("proveedor_nombre");
  // 627 → 62700000 en sociedades; en autónomos, el código tal cual si está en el listado.
  const escrita = texto("subcuenta");
  const subcuenta = cuentaSegunRegimen(escrita, regimen, codigosDe(tipo)) ?? escrita;
  const subcuenta_tercero = regimen === "partida_doble" ? texto("subcuenta_tercero")?.replace(/\D/g, "") || null : null;
  const lineas = lineasDelFormulario(formData, num);
  const suma = (k: "base" | "cuota") =>
    lineas.some((l) => l[k] != null) ? Math.round(lineas.reduce((s, l) => s + (l[k] ?? 0), 0) * 100) / 100 : null;

  // Cliente y libro de antes: si el asesor la mueve, el aviso de allí también baja.
  const { data: antes } = await supabase.from("facturas_ocr").select("cliente_id, tipo").eq("id", id).maybeSingle();

  const datos = {
    tipo,
    fecha: texto("fecha"),
    fecha_contable: texto("fecha_contable"),
    numero_factura: texto("numero_factura"),
    proveedor_nombre,
    proveedor_cif,
    concepto: texto("concepto"),
    base_imponible: suma("base"),
    iva_tipo: lineas.length === 1 ? lineas[0].tipo : null,
    iva_cuota: suma("cuota"),
    lineas_iva: lineas.length > 1 ? lineas : [],
    retencion_base: num("retencion_base"),
    retencion_tipo: num("retencion_tipo"),
    retencion_cuota: num("retencion_cuota"),
    total: num("total"),
    subcuenta,
    subcuenta_tercero,
    sujeto_pasivo: formData.get("sujeto_pasivo") === "on",
    // La corrección del asesor sustituye a la sugerencia de la IA.
    subcuenta_origen: subcuenta ? ("manual" as const) : null,
    subcuenta_motivo: subcuenta ? "Corregida manualmente por el asesor." : null,
  };

  const { data: actualizada } = await supabase.from("facturas_ocr").update({
    ...datos,
    cliente_id,
    // Se guardan para que se vean, pero el asesor ya la ha dado por buena.
    avisos: avisosFactura(datos, regimen),
    confianza: 100,
    revisada: true,
  }).eq("id", id).select("id");

  // AC-10: aprende las cuentas para futuras facturas de este proveedor en este
  // cliente. Solo si el asesor podía editar esta factura (RLS).
  if (actualizada?.length) {
    const admin = createAdminClient();
    await memorizarCuentas(
      admin,
      {
        cliente_id, tipo, nif: proveedor_cif, nombre: proveedor_nombre,
        subcuenta, subcuenta_tercero, iva_tipo: datos.iva_tipo,
      },
      { sobrescribir: true },
    );
    await actualizarAvisoPendientes(admin, cliente_id, tipo);
    if (antes && (antes.cliente_id !== cliente_id || antes.tipo !== tipo)) {
      await actualizarAvisoPendientes(admin, antes.cliente_id, antes.tipo);
    }
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
    .not("cliente_id", "is", null) // sin cliente se aprueba desde "Revisar", eligiéndolo
    .select("cliente_id, tipo, proveedor_cif, proveedor_nombre, subcuenta, subcuenta_tercero, iva_tipo")
    .maybeSingle();
  // Aprobar confirma lo leído: un proveedor nuevo queda memorizado en el cliente,
  // pero no se pisa lo que ya había.
  if (f) {
    const admin = createAdminClient();
    await memorizarCuentas(
      admin,
      {
        cliente_id: f.cliente_id, tipo: f.tipo, nif: f.proveedor_cif, nombre: f.proveedor_nombre,
        subcuenta: f.subcuenta, subcuenta_tercero: f.subcuenta_tercero, iva_tipo: f.iva_tipo,
      },
      { sobrescribir: false },
    );
    await actualizarAvisoPendientes(admin, f.cliente_id, f.tipo);
  }
  revalidatePath("/precontabilizacion");
}
