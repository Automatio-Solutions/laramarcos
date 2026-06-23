import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { clasificarPorSector, esUrgente, resumenAccionable, type SectorRef } from "./clasificar";

export interface ItemBoletin {
  boletin: string; // DOE | BOE
  titulo: string;
  resumen?: string;
  enlace?: string;
}

export interface ResultadoProceso {
  publicaciones_nuevas: number;
  newsletters: number;
  tareas_urgentes: number;
}

/** Pipeline M3: clasifica publicaciones, genera newsletters por sector y crea tareas urgentes.
 *  Idempotente por (boletin, enlace). Si no hay novedades, no crea newsletters (AC-09). */
export async function procesarBoletines(
  admin: SupabaseClient,
  fecha: string,
  items: ItemBoletin[],
): Promise<ResultadoProceso> {
  const { data: sectoresData } = await admin.from("sectores").select("id, nombre");
  const sectores = (sectoresData ?? []) as SectorRef[];

  // 1) Clasificar + guardar (solo cuentan las realmente nuevas)
  const nuevas: { id: string; titulo: string; resumen: string; enlace: string | null; sector_id: string | null; urgente: boolean }[] = [];
  for (const it of items) {
    const sector_id = clasificarPorSector(it, sectores);
    const urgente = esUrgente(it);
    const resumen = resumenAccionable(it);
    const { data } = await admin
      .from("publicaciones")
      .upsert(
        { boletin: it.boletin, fecha, titulo: it.titulo, resumen, enlace: it.enlace ?? null, sector_id, urgente },
        { onConflict: "boletin,enlace", ignoreDuplicates: true },
      )
      .select("id");
    if (data && data.length) {
      nuevas.push({ id: data[0].id, titulo: it.titulo, resumen, enlace: it.enlace ?? null, sector_id, urgente });
    }
  }

  // 2) Newsletters por sector (solo sectores con publicaciones nuevas hoy)
  const porSector = new Map<string, typeof nuevas>();
  for (const p of nuevas) {
    if (!p.sector_id) continue;
    if (!porSector.has(p.sector_id)) porSector.set(p.sector_id, []);
    porSector.get(p.sector_id)!.push(p);
  }

  let newsletters = 0;
  for (const [sectorId, pubs] of porSector) {
    const sector = sectores.find((s) => s.id === sectorId);
    const { count } = await admin
      .from("cliente_sectores")
      .select("cliente_id", { count: "exact", head: true })
      .eq("sector_id", sectorId);
    const contenido = pubs.map((p) => `• ${p.resumen}`).join("\n");
    await admin.from("newsletters").insert({
      sector_id: sectorId,
      fecha,
      asunto: `Novedades normativas — ${sector?.nombre ?? "sector"} (${fecha})`,
      contenido,
      destinatarios: count ?? 0,
    });
    newsletters++;
  }

  // 3) Tareas urgentes: una por cliente del sector afectado (UC-305)
  let tareas = 0;
  for (const p of nuevas) {
    if (!p.urgente || !p.sector_id) continue;
    const { data: rels } = await admin
      .from("cliente_sectores")
      .select("cliente:clientes(id, asesor_id)")
      .eq("sector_id", p.sector_id);
    for (const r of rels ?? []) {
      const c = r.cliente as unknown as { id: string; asesor_id: string | null } | null;
      if (!c) continue;
      await admin.from("tareas").insert({
        titulo: `[Urgente DOE/BOE] ${p.titulo}`,
        cliente_id: c.id,
        responsable_id: c.asesor_id,
        origen: "doe_boe",
        categoria: "Normativa",
      });
      tareas++;
    }
  }

  await admin.from("ingesta_log").insert({
    fecha,
    boletin: [...new Set(items.map((i) => i.boletin))].join("+") || "—",
    estado: "ok",
    mensaje: `${nuevas.length} nuevas, ${newsletters} newsletters, ${tareas} tareas`,
    items: items.length,
  });

  return { publicaciones_nuevas: nuevas.length, newsletters, tareas_urgentes: tareas };
}
