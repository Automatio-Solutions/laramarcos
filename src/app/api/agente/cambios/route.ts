import { type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { autorizadoAgente, noAutorizado } from "@/lib/agente/auth";
import { trimestreDe } from "@/lib/ocr/core";

const LOTE = 1000;

/**
 * Qué Excel hay que regenerar: libros (cliente + trimestre) con facturas nuevas o
 * corregidas desde `desde`. El programa guarda `hasta` y lo manda en la siguiente
 * pasada. `carpeta` es la carpeta del cliente en el servidor ("Oficina/Cliente"),
 * sacada de sus facturas; null si todas se subieron desde la app.
 */
export async function GET(request: NextRequest) {
  if (!autorizadoAgente(request)) return noAutorizado();
  const desde = request.nextUrl.searchParams.get("desde") ?? "1970-01-01T00:00:00Z";
  if (Number.isNaN(Date.parse(desde))) return Response.json({ error: "'desde' no es una fecha ISO." }, { status: 400 });

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("facturas_ocr")
    .select("cliente_id, fecha, ruta_servidor, updated_at")
    .gt("updated_at", desde)
    .not("cliente_id", "is", null)
    .not("fecha", "is", null)
    .order("updated_at")
    .limit(LOTE);
  if (error) return Response.json({ error: error.message }, { status: 500 });
  const filas = data ?? [];

  // Lote lleno: se corta en la última fila vista y el resto va en la siguiente pasada.
  const completo = filas.length < LOTE;
  const hasta = completo ? new Date().toISOString() : filas[filas.length - 1].updated_at;

  const carpetaDe = (ruta: string | null) => (ruta ? ruta.split("/").slice(0, 2).join("/") : null);
  const carpetas = new Map<string, string | null>();
  for (const f of filas) if (f.ruta_servidor) carpetas.set(f.cliente_id, carpetaDe(f.ruta_servidor));

  const sinCarpeta = [...new Set(filas.map((f) => f.cliente_id))].filter((id) => !carpetas.has(id));
  if (sinCarpeta.length) {
    const { data: rutas } = await admin
      .from("facturas_ocr")
      .select("cliente_id, ruta_servidor")
      .in("cliente_id", sinCarpeta)
      .not("ruta_servidor", "is", null);
    for (const r of rutas ?? []) if (!carpetas.has(r.cliente_id)) carpetas.set(r.cliente_id, carpetaDe(r.ruta_servidor));
  }

  const libros = new Map<string, { cliente_id: string; trimestre: string; carpeta: string | null }>();
  for (const f of filas) {
    const trimestre = trimestreDe(f.fecha);
    libros.set(`${f.cliente_id}|${trimestre}`, { cliente_id: f.cliente_id, trimestre, carpeta: carpetas.get(f.cliente_id) ?? null });
  }
  return Response.json({ hasta, completo, libros: [...libros.values()] });
}
