import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { computeAlertas, type TareaAlerta } from "@/lib/alertas";
import { descargarBoletines } from "@/lib/vigilancia/fuentes";
import { procesarBoletines } from "@/lib/vigilancia/procesar";

/**
 * Las cuatro tareas diarias del despacho, extraídas de sus rutas para que las
 * pueda ejecutar tanto su endpoint individual (útil para lanzarlas a mano)
 * como el despachador /api/cron/diario.
 *
 * En el plan gratuito de Vercel solo se permiten 2 crons y una ejecución al
 * día, de ahí el despachador único.
 */

export const hoyISO = (): string => new Date().toISOString().slice(0, 10);

/** UC-103: avisos 7d/48h al responsable y escalado si la tarea venció. */
export async function ejecutarAlertas(admin: SupabaseClient, hoy = hoyISO()) {
  const { data: tareas, error } = await admin
    .from("tareas")
    .select("id, titulo, vencimiento, estado, bloqueada, responsable_id")
    .neq("estado", "completada");
  if (error) throw new Error(error.message);

  const { data: resp } = await admin
    .from("usuarios")
    .select("id")
    .eq("rol", "responsable")
    .eq("activo", true);
  const responsables = (resp ?? []).map((r) => r.id as string);

  const avisos = computeAlertas((tareas ?? []) as TareaAlerta[], hoy, responsables);

  let creados = 0;
  for (const a of avisos) {
    const { error: e } = await admin.rpc("crear_notificacion", {
      p_usuario: a.usuario_id,
      p_tipo: a.tipo,
      p_mensaje: a.mensaje,
      p_enlace: a.enlace,
    });
    if (!e) creados++;
  }
  return { fecha: hoy, evaluadas: tareas?.length ?? 0, avisos: avisos.length, creados };
}

/** UC-111 AC-24: resumen matutino por empleado con su carga del día. */
export async function ejecutarResumenDiario(admin: SupabaseClient, hoy = hoyISO()) {
  const { data: usuarios } = await admin.from("usuarios").select("id").eq("activo", true);

  let creados = 0;
  for (const u of usuarios ?? []) {
    const { count: abiertas } = await admin
      .from("tareas")
      .select("id", { count: "exact", head: true })
      .eq("responsable_id", u.id)
      .neq("estado", "completada");
    const { count: vencen = 0 } = await admin
      .from("tareas")
      .select("id", { count: "exact", head: true })
      .eq("responsable_id", u.id)
      .neq("estado", "completada")
      .lte("vencimiento", hoy);

    if ((abiertas ?? 0) === 0) continue;
    const { error } = await admin.rpc("crear_notificacion", {
      p_usuario: u.id,
      p_tipo: "resumen_diario",
      p_mensaje: `Buenos días: ${abiertas} tareas abiertas${vencen ? `, ${vencen} vencen hoy o antes` : ""}.`,
      p_enlace: "/tareas",
    });
    if (!error) creados++;
  }
  return { fecha: hoy, usuarios: usuarios?.length ?? 0, creados };
}

/** UC-208 AC-17: genera los presupuestos recurrentes vencidos. */
export async function ejecutarRecurrentes(admin: SupabaseClient, hoy = hoyISO()) {
  const { data: recs } = await admin
    .from("presupuestos_recurrentes")
    .select("id, cliente_id, servicio_id, periodo_dias, proximo, creado_por")
    .eq("activo", true)
    .lte("proximo", hoy);

  let generados = 0;
  for (const r of recs ?? []) {
    const { data: serv } = await admin
      .from("servicios")
      .select("nombre, precio_base")
      .eq("id", r.servicio_id)
      .maybeSingle();
    if (!serv) continue;
    const precio = Number(serv.precio_base);
    await admin.from("presupuestos").insert({
      cliente_id: r.cliente_id,
      servicio_id: r.servicio_id,
      creado_por: r.creado_por,
      estado: "borrador",
      lineas: [{ concepto: serv.nombre, cantidad: 1, precio, descuento: 0 }],
      total: precio,
    });
    const prox = new Date(`${r.proximo}T00:00:00Z`);
    prox.setUTCDate(prox.getUTCDate() + r.periodo_dias);
    await admin
      .from("presupuestos_recurrentes")
      .update({ proximo: prox.toISOString().slice(0, 10) })
      .eq("id", r.id);
    generados++;
  }
  return { fecha: hoy, evaluados: recs?.length ?? 0, generados };
}

/**
 * UC-301..305: baja DOE + BOE, clasifica y genera circulares y tareas urgentes.
 *
 * `maxItems` acota el lote para caber en el tiempo de función del plan gratuito.
 */
export async function ejecutarVigilancia(admin: SupabaseClient, hoy = hoyISO(), maxItems = 60) {
  const { items, errores } = await descargarBoletines(hoy, maxItems);

  for (const mensaje of errores) {
    await admin.from("ingesta_log").insert({ fecha: hoy, boletin: "MIXTO", estado: "error", mensaje });
  }

  if (!items.length) {
    await admin.from("ingesta_log").insert({
      fecha: hoy,
      boletin: "MIXTO",
      estado: "ok",
      mensaje: "sin novedades",
      items: 0,
    });
    return { fecha: hoy, publicaciones_nuevas: 0, newsletters: 0, tareas_urgentes: 0, errores };
  }

  const res = await procesarBoletines(admin, hoy, items);
  await admin.from("ingesta_log").insert({
    fecha: hoy,
    boletin: "MIXTO",
    estado: "ok",
    mensaje: `${res.publicaciones_nuevas} nuevas de ${items.length} leídas`,
    items: items.length,
  });
  return { fecha: hoy, ...res, errores };
}
