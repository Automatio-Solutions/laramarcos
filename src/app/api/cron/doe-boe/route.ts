import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { procesarBoletines, type ItemBoletin } from "@/lib/vigilancia/procesar";

function autorizado(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  return !secret || request.headers.get("x-cron-secret") === secret;
}

// POST: n8n empuja los items ya descargados/parseados del DOE y BOE.
export async function POST(request: NextRequest) {
  if (!autorizado(request)) return NextResponse.json({ error: "no autorizado" }, { status: 401 });
  const admin = createAdminClient();
  const fecha = new Date().toISOString().slice(0, 10);
  try {
    const body = (await request.json()) as { fecha?: string; items?: ItemBoletin[] };
    const items = (body.items ?? []).filter((i) => i.boletin && i.titulo);
    const res = await procesarBoletines(admin, body.fecha ?? fecha, items);
    return NextResponse.json({ fecha: body.fecha ?? fecha, ...res });
  } catch (err) {
    await admin.from("ingesta_log").insert({ fecha, boletin: "POST", estado: "error", mensaje: err instanceof Error ? err.message : "error" });
    return NextResponse.json({ error: "procesamiento fallido" }, { status: 500 });
  }
}

// GET: intento best-effort de bajar el sumario del BOE de hoy (Vercel cron / manual).
// Si falla, registra el error y no envía nada (AC-02).
export async function GET(request: NextRequest) {
  if (!autorizado(request)) return NextResponse.json({ error: "no autorizado" }, { status: 401 });
  const admin = createAdminClient();
  const fecha = new Date().toISOString().slice(0, 10);
  const yyyymmdd = fecha.replace(/-/g, "");

  let items: ItemBoletin[] = [];
  try {
    const r = await fetch(`https://www.boe.es/datosabiertos/api/boe/sumario/${yyyymmdd}`, {
      headers: { Accept: "application/json" },
    });
    if (r.ok) {
      const json = await r.json();
      items = extraerItems(json, "BOE").slice(0, 50);
    } else if (r.status !== 404) {
      throw new Error(`BOE respondió ${r.status}`);
    }
  } catch (err) {
    await admin.from("ingesta_log").insert({ fecha, boletin: "BOE", estado: "error", mensaje: err instanceof Error ? err.message : "fetch error" });
    return NextResponse.json({ fecha, error: "descarga BOE fallida (registrada). Usa POST desde n8n.", items: 0 }, { status: 200 });
  }

  if (items.length === 0) {
    await admin.from("ingesta_log").insert({ fecha, boletin: "BOE", estado: "ok", mensaje: "sin novedades", items: 0 });
    return NextResponse.json({ fecha, publicaciones_nuevas: 0, newsletters: 0, tareas_urgentes: 0, nota: "sin novedades" });
  }
  const res = await procesarBoletines(admin, fecha, items);
  return NextResponse.json({ fecha, ...res });
}

// Extrae {titulo, enlace} recorriendo el JSON del BOE (estructura anidada/variable).
function extraerItems(node: unknown, boletin: string, out: ItemBoletin[] = []): ItemBoletin[] {
  if (!node || typeof node !== "object") return out;
  if (Array.isArray(node)) {
    for (const n of node) extraerItems(n, boletin, out);
    return out;
  }
  const o = node as Record<string, unknown>;
  if (typeof o.titulo === "string" && o.titulo.length > 10) {
    let enlace: string | undefined;
    if (typeof o.url_html === "string") {
      enlace = o.url_html;
    } else if (o.url_pdf && typeof o.url_pdf === "object") {
      const texto = (o.url_pdf as Record<string, unknown>).texto;
      if (typeof texto === "string") enlace = texto;
    }
    out.push({ boletin, titulo: o.titulo, enlace });
  }
  for (const v of Object.values(o)) extraerItems(v, boletin, out);
  return out;
}
