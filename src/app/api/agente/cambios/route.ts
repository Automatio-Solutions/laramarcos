import { type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { autorizadoAgente, noAutorizado } from "@/lib/agente/auth";
import { fechaDelLibro, normalizaTexto, trimestreDe } from "@/lib/ocr/core";

const LOTE = 1000;

/** "…/KANTARADS DIGITAL, S.L./07. CONTABILIDAD/AÑO 2026/…" → hasta "07. CONTABILIDAD" (el número no importa). */
function carpetaContabilidad(ruta: string | null): string | null {
  if (!ruta) return null;
  const partes = ruta.split("/");
  const i = partes.findIndex((p) => /(^| )CONTABILIDAD$/.test(normalizaTexto(p)));
  return i >= 0 ? partes.slice(0, i + 1).join("/") : null;
}

/**
 * Qué Excel hay que regenerar: libros (cliente + gastos/ingresos + trimestre) con
 * facturas nuevas o corregidas desde `desde`. El programa guarda `hasta` y lo
 * manda en la siguiente pasada. El Excel va en la carpeta del trimestre, dentro de
 * `carpetaContabilidad` ("AÑO 2026/1º TRIMESTRE"); null si todas las facturas del
 * cliente se subieron desde la app y no se sabe dónde está su carpeta.
 */
export async function GET(request: NextRequest) {
  if (!autorizadoAgente(request)) return noAutorizado();
  const desde = request.nextUrl.searchParams.get("desde") ?? "1970-01-01T00:00:00Z";
  if (Number.isNaN(Date.parse(desde))) return Response.json({ error: "'desde' no es una fecha ISO." }, { status: 400 });

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("facturas_ocr")
    .select("cliente_id, tipo, fecha, fecha_contable, ruta_servidor, updated_at")
    .gt("updated_at", desde)
    .not("cliente_id", "is", null)
    .or("fecha.not.is.null,fecha_contable.not.is.null")
    .order("updated_at")
    .limit(LOTE);
  if (error) return Response.json({ error: error.message }, { status: 500 });
  const filas = data ?? [];

  // Lote lleno: se corta en la última fila vista y el resto va en la siguiente pasada.
  const completo = filas.length < LOTE;
  const hasta = completo ? new Date().toISOString() : filas[filas.length - 1].updated_at;

  const carpetas = new Map<string, string | null>();
  for (const f of filas) {
    const c = carpetaContabilidad(f.ruta_servidor);
    if (c) carpetas.set(f.cliente_id, c);
  }
  const sinCarpeta = [...new Set(filas.map((f) => f.cliente_id))].filter((id) => !carpetas.has(id));
  if (sinCarpeta.length) {
    const { data: rutas } = await admin
      .from("facturas_ocr")
      .select("cliente_id, ruta_servidor")
      .in("cliente_id", sinCarpeta)
      .not("ruta_servidor", "is", null);
    for (const r of rutas ?? []) {
      const c = carpetaContabilidad(r.ruta_servidor);
      if (c && !carpetas.has(r.cliente_id)) carpetas.set(r.cliente_id, c);
    }
  }

  const libros = new Map<string, { cliente_id: string; tipo: string; periodo: string; carpetaContabilidad: string | null }>();
  for (const f of filas) {
    const periodo = trimestreDe(fechaDelLibro(f)!);
    libros.set(`${f.cliente_id}|${f.tipo}|${periodo}`, {
      cliente_id: f.cliente_id,
      tipo: f.tipo,
      periodo,
      carpetaContabilidad: carpetas.get(f.cliente_id) ?? null,
    });
  }
  return Response.json({ hasta, completo, libros: [...libros.values()] });
}
