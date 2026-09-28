import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { CONFIANZA_VERDE, textoPendientes, type TipoFactura } from "./core";

export const TIPO_AVISO = "facturas_revisar";

export const enlacePendientes = (cliente_id: string, tipo: TipoFactura) =>
  `/precontabilizacion?cliente=${cliente_id}&tipo=${tipo}&estado=pendientes`;

/**
 * Quién revisa las facturas de un cliente (decisión del despacho, opción a): los
 * asesores de su oficina y su asesor asignado. La central (responsables) no
 * recibe estos avisos al momento: lo ve en el resumen de la mañana.
 */
async function destinatarios(admin: SupabaseClient, cliente: { oficina: string | null; asesor_id: string | null }) {
  const ids = new Set<string>();
  if (cliente.oficina) {
    const { data } = await admin
      .from("usuarios")
      .select("id")
      .eq("activo", true)
      .eq("rol", "asesor")
      .eq("oficina", cliente.oficina);
    for (const u of data ?? []) ids.add(u.id);
  }
  if (cliente.asesor_id) ids.add(cliente.asesor_id);
  return [...ids];
}

/** Facturas por revisar de un cliente y libro (naranja o rojo, sin revisar). */
export async function contarPendientes(admin: SupabaseClient, cliente_id: string, tipo: TipoFactura) {
  const { count } = await admin
    .from("facturas_ocr")
    .select("id", { count: "exact", head: true })
    .eq("cliente_id", cliente_id)
    .eq("tipo", tipo)
    .eq("revisada", false)
    .lt("confianza", CONFIANZA_VERDE);
  return count ?? 0;
}

/**
 * Mantiene al día el aviso de la campana "X · Gastos: N facturas por revisar".
 * Un único aviso por cliente y libro: si ya hay uno sin leer se actualiza el
 * número (no se manda uno por factura); si ya no queda nada, se da por leído.
 * Nunca rompe el flujo que lo llama: un fallo aquí solo se registra.
 */
export async function actualizarAvisoPendientes(admin: SupabaseClient, cliente_id: string | null, tipo: TipoFactura) {
  if (!cliente_id) return;
  try {
    const { data: cliente } = await admin
      .from("clientes")
      .select("razon_social, oficina, asesor_id")
      .eq("id", cliente_id)
      .maybeSingle();
    if (!cliente) return;

    const n = await contarPendientes(admin, cliente_id, tipo);
    const enlace = enlacePendientes(cliente_id, tipo);
    if (n === 0) {
      await admin.from("notificaciones").update({ leida: true }).eq("tipo", TIPO_AVISO).eq("enlace", enlace).eq("leida", false);
      return;
    }

    const mensaje = textoPendientes(n, cliente.razon_social, tipo);
    for (const usuario_id of await destinatarios(admin, cliente)) {
      const { data: previo } = await admin
        .from("notificaciones")
        .select("id")
        .eq("usuario_id", usuario_id)
        .eq("tipo", TIPO_AVISO)
        .eq("enlace", enlace)
        .eq("leida", false)
        .maybeSingle();
      if (previo) await admin.from("notificaciones").update({ mensaje }).eq("id", previo.id);
      else await admin.from("notificaciones").insert({ usuario_id, tipo: TIPO_AVISO, mensaje, enlace });
    }
  } catch (e) {
    console.error("[M4] No se pudo actualizar el aviso de facturas por revisar:", e);
  }
}

/**
 * Resumen de la mañana: facturas por revisar que le tocan a cada uno. Asesores:
 * las de los clientes de su oficina. Central (responsable/admin): todas, por
 * oficina, más las que llegaron sin cliente.
 */
export async function ejecutarResumenFacturas(admin: SupabaseClient) {
  const pendientes: { cliente_id: string | null; oficina: string | null }[] = [];
  for (let desde = 0; ; desde += 1000) {
    const { data } = await admin
      .from("facturas_ocr")
      .select("cliente_id, cliente:clientes(oficina)")
      .eq("revisada", false)
      .lt("confianza", CONFIANZA_VERDE)
      .range(desde, desde + 999);
    for (const f of (data ?? []) as unknown as { cliente_id: string | null; cliente: { oficina: string | null } | null }[]) {
      pendientes.push({ cliente_id: f.cliente_id, oficina: f.cliente?.oficina ?? null });
    }
    if (!data || data.length < 1000) break;
  }
  if (!pendientes.length) return { pendientes: 0, avisados: 0 };

  const resumen = (xs: typeof pendientes) => {
    const clientes = new Set(xs.filter((x) => x.cliente_id).map((x) => x.cliente_id)).size;
    return `${xs.length} ${xs.length === 1 ? "factura" : "facturas"} por revisar${clientes ? ` en ${clientes} ${clientes === 1 ? "cliente" : "clientes"}` : ""}`;
  };

  const { data: usuarios } = await admin.from("usuarios").select("id, rol, oficina").eq("activo", true);
  let avisados = 0;
  for (const u of usuarios ?? []) {
    let mensaje: string | null = null;
    let enlace = "/precontabilizacion?estado=pendientes";
    if (u.rol === "asesor") {
      const mias = pendientes.filter((p) => p.oficina && p.oficina === u.oficina);
      if (!mias.length) continue;
      mensaje = `Buenos días: ${resumen(mias)} de ${u.oficina}.`;
      enlace += `&oficina=${encodeURIComponent(u.oficina)}`;
    } else {
      const porOficina = new Map<string, number>();
      for (const p of pendientes) porOficina.set(p.oficina ?? "sin cliente", (porOficina.get(p.oficina ?? "sin cliente") ?? 0) + 1);
      const detalle = [...porOficina].map(([o, n]) => `${o} ${n}`).join(", ");
      mensaje = `Buenos días: ${resumen(pendientes)} (${detalle}).`;
    }
    const { error } = await admin.rpc("crear_notificacion", {
      p_usuario: u.id, p_tipo: "resumen_facturas", p_mensaje: mensaje, p_enlace: enlace,
    });
    if (!error) avisados++;
  }
  return { pendientes: pendientes.length, avisados };
}
