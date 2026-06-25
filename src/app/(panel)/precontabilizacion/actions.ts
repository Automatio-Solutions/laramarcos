"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { procesarFactura } from "@/lib/ocr/procesar";

// UC-401 + UC-402 + UC-403: sube la factura a la carpeta del cliente y la procesa (OCR).
export async function subirFacturaAction(formData: FormData) {
  const archivo = formData.get("archivo");
  const cliente_id = String(formData.get("cliente_id") ?? "").trim() || null;
  if (!(archivo instanceof File) || archivo.size === 0) return;

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const admin = createAdminClient();

  const buffer = Buffer.from(await archivo.arrayBuffer());
  const base64 = buffer.toString("base64");
  const mime = archivo.type || "application/octet-stream";

  // Carpeta por cliente en el almacenamiento (en prod: VPS propio)
  const carpeta = cliente_id ?? "sin-cliente";
  const path = `${carpeta}/${Date.now()}-${archivo.name.replace(/[^\w.\-]/g, "_")}`;
  await admin.storage.from("facturas").upload(path, buffer, { contentType: mime, upsert: false });

  // OCR (Claude si hay key; si no, fila manual) + subcuenta por proveedor
  const r = await procesarFactura(admin, base64, mime);

  await supabase.from("facturas_ocr").insert({
    cliente_id,
    proveedor_cif: r.proveedor_cif,
    proveedor_nombre: r.proveedor_nombre,
    fecha: r.fecha,
    concepto: r.concepto,
    base_imponible: r.base_imponible,
    iva_tipo: r.iva_tipo,
    iva_cuota: r.iva_cuota,
    total: r.total,
    subcuenta: r.subcuenta,
    confianza: r.confianza,
    archivo_path: path,
    archivo_nombre: archivo.name,
    subido_por: user?.id,
  });

  revalidatePath("/precontabilizacion");
}

// UC-405: corrección manual con aprendizaje (la subcuenta se memoriza por proveedor).
export async function corregirFacturaAction(id: string, formData: FormData) {
  const supabase = await createClient();
  const num = (k: string) => {
    const v = String(formData.get(k) ?? "").replace(",", ".").trim();
    return v === "" ? null : Number(v);
  };
  const proveedor_cif = String(formData.get("proveedor_cif") ?? "").trim().toUpperCase() || null;
  const subcuenta = String(formData.get("subcuenta") ?? "").trim() || null;

  await supabase.from("facturas_ocr").update({
    fecha: String(formData.get("fecha") ?? "").trim() || null,
    proveedor_nombre: String(formData.get("proveedor_nombre") ?? "").trim() || null,
    proveedor_cif,
    concepto: String(formData.get("concepto") ?? "").trim() || null,
    base_imponible: num("base_imponible"),
    iva_tipo: num("iva_tipo"),
    iva_cuota: num("iva_cuota"),
    total: num("total"),
    subcuenta,
    confianza: 100,
    revisada: true,
  }).eq("id", id);

  // AC-10: aprende la subcuenta del proveedor para futuras facturas
  if (proveedor_cif && subcuenta) {
    const { data: prov } = await supabase.from("proveedores").select("id").eq("cif", proveedor_cif).maybeSingle();
    if (prov) {
      await supabase.from("proveedores").update({ subcuenta_habitual: subcuenta }).eq("id", prov.id);
    }
  }

  revalidatePath("/precontabilizacion");
  redirect("/precontabilizacion");
}

export async function aprobarFacturaAction(id: string) {
  const supabase = await createClient();
  await supabase.from("facturas_ocr").update({ revisada: true }).eq("id", id);
  revalidatePath("/precontabilizacion");
}
