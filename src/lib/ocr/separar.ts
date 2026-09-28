import "server-only";
import { MODELO_RAPIDO } from "@/lib/ia/claude";
import type { InfoPagina } from "./core";
import { extraerPaginas } from "./pdf";

export { contarPaginas, extraerPaginas } from "./pdf";
export { PAGINAS_POR_TANDA } from "./subida";

/**
 * Describe las páginas `desde`..`hasta` de un PDF con varias facturas: si cada
 * una empieza factura, sigue la anterior o está en blanco, con el nº de factura y
 * el NIF del emisor si se ven. `agruparPaginas` (core) decide los cortes.
 * Sin clave de Claude → cada página, una factura con el corte dudoso.
 */
export async function describirPaginas(pdf: Uint8Array, desde: number, hasta: number): Promise<InfoPagina[]> {
  const sinIa = (): InfoPagina[] =>
    Array.from({ length: hasta - desde + 1 }, (_, i) => ({
      pagina: desde + i, tipo: "inicio", numero_factura: null, nif_emisor: null, pagina_de: null, incierta: true,
    }));
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return sinIa();

  const tanda = await extraerPaginas(pdf, desde, hasta);
  const { default: Anthropic } = await import("@anthropic-ai/sdk");
  const client = new Anthropic({ apiKey: key });
  const n = hasta - desde + 1;
  const msg = await client.messages.create({
    model: MODELO_RAPIDO,
    max_tokens: 2048,
    system:
      "Separas un PDF escaneado que contiene varias facturas seguidas. Una factura puede ocupar varias páginas; " +
      "nunca hay dos facturas en la misma página. Para CADA página di si empieza una factura nueva (cabecera con " +
      "emisor, número y fecha), si continúa la anterior (más líneas, totales, 'página 2 de 3') o si está en blanco. " +
      "Copia el número de factura y el NIF del emisor si aparecen en esa página, aunque sea una continuación. " +
      "No inventes datos: null si no se ven.",
    tools: [{
      name: "describir_paginas",
      description: "Describe cada página del PDF, en orden.",
      input_schema: {
        type: "object",
        properties: {
          paginas: {
            type: "array",
            description: `Exactamente ${n} entradas, una por página y en orden.`,
            items: {
              type: "object",
              properties: {
                tipo: { type: "string", enum: ["inicio", "continuacion", "vacia"] },
                numero_factura: { type: ["string", "null"] },
                nif_emisor: { type: ["string", "null"] },
                pagina_n: { type: ["integer", "null"], description: "Si pone 'página N de M', N." },
                pagina_total: { type: ["integer", "null"], description: "Si pone 'página N de M', M." },
              },
              required: ["tipo"],
            },
          },
        },
        required: ["paginas"],
      },
    }],
    tool_choice: { type: "tool", name: "describir_paginas" },
    messages: [{
      role: "user",
      content: [
        { type: "document", source: { type: "base64", media_type: "application/pdf", data: tanda.toString("base64") } },
        { type: "text", text: `Este fragmento tiene ${n} páginas. Descríbelas todas.` },
      ],
    }],
  });

  const block = msg.content.find((b) => b.type === "tool_use");
  const salida = block && block.type === "tool_use"
    ? ((block.input as { paginas?: Record<string, unknown>[] }).paginas ?? [])
    : [];
  // Si la IA no devuelve una entrada por página, no se puede fiar el corte.
  if (salida.length !== n) return sinIa();
  return salida.map((p, i) => ({
    pagina: desde + i,
    tipo: p.tipo === "continuacion" || p.tipo === "vacia" ? p.tipo : "inicio",
    numero_factura: typeof p.numero_factura === "string" ? p.numero_factura.trim() || null : null,
    nif_emisor: typeof p.nif_emisor === "string" ? p.nif_emisor.replace(/[\s.-]/g, "").toUpperCase() || null : null,
    pagina_de: typeof p.pagina_n === "number" && typeof p.pagina_total === "number" && p.pagina_total > 1
      ? { n: p.pagina_n, total: p.pagina_total }
      : null,
  }));
}
