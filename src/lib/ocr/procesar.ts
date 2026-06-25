import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { FacturaDatos } from "./core";

export interface ResultadoOCR extends FacturaDatos {
  confianza: number;
  motor: "claude" | "manual";
}

const VACIO: FacturaDatos = {
  fecha: null, proveedor_nombre: null, proveedor_cif: null, concepto: null,
  base_imponible: null, iva_tipo: null, iva_cuota: null, total: null, subcuenta: null,
};

/** Procesa una factura: extrae campos con Claude vision (si hay key) y aplica la
 *  subcuenta del proveedor por histórico (UC-403). Sin clave → fila manual (rojo). */
export async function procesarFactura(
  supabase: SupabaseClient,
  base64: string,
  mime: string,
): Promise<ResultadoOCR> {
  let datos: FacturaDatos = { ...VACIO };
  let confianza = 0;
  let motor: "claude" | "manual" = "manual";

  const key = process.env.ANTHROPIC_API_KEY;
  if (key && (mime === "application/pdf" || mime.startsWith("image/"))) {
    try {
      const { default: Anthropic } = await import("@anthropic-ai/sdk");
      const client = new Anthropic({ apiKey: key });
      const model = process.env.ANTHROPIC_MODEL ?? "claude-sonnet-4-6";
      const source = mime === "application/pdf"
        ? { type: "document" as const, source: { type: "base64" as const, media_type: "application/pdf" as const, data: base64 } }
        : { type: "image" as const, source: { type: "base64" as const, media_type: mime as "image/jpeg" | "image/png", data: base64 } };

      const msg = await client.messages.create({
        model,
        max_tokens: 1024,
        tools: [{
          name: "extraer_factura",
          description: "Extrae los datos contables de la factura. Si un dato no aparece, déjalo null. Si pone 'IVA reducido' sin número, usa 10. Devuelve confianza 0-100.",
          input_schema: {
            type: "object",
            properties: {
              fecha: { type: ["string", "null"] },
              proveedor_nombre: { type: ["string", "null"] },
              proveedor_cif: { type: ["string", "null"] },
              concepto: { type: ["string", "null"] },
              base_imponible: { type: ["number", "null"] },
              iva_tipo: { type: ["number", "null"] },
              iva_cuota: { type: ["number", "null"] },
              total: { type: ["number", "null"] },
              confianza: { type: "number" },
            },
            required: ["confianza"],
          },
        }],
        tool_choice: { type: "tool", name: "extraer_factura" },
        messages: [{ role: "user", content: [source, { type: "text", text: "Extrae los datos de esta factura." }] }],
      });
      const block = msg.content.find((b) => b.type === "tool_use");
      if (block && block.type === "tool_use") {
        const out = block.input as Partial<ResultadoOCR>;
        datos = {
          fecha: out.fecha ?? null, proveedor_nombre: out.proveedor_nombre ?? null,
          proveedor_cif: out.proveedor_cif ?? null, concepto: out.concepto ?? null,
          base_imponible: out.base_imponible ?? null, iva_tipo: out.iva_tipo ?? null,
          iva_cuota: out.iva_cuota ?? null, total: out.total ?? null, subcuenta: null,
        };
        confianza = Math.max(0, Math.min(100, out.confianza ?? 0));
        motor = "claude";
      }
    } catch {
      // fallo de API → fila manual
      datos = { ...VACIO };
      confianza = 0;
      motor = "manual";
    }
  }

  // UC-403: subcuenta por histórico del proveedor (memoria en M5)
  if (datos.proveedor_cif) {
    const { data: prov } = await supabase
      .from("proveedores")
      .select("subcuenta_habitual, iva_default")
      .eq("cif", datos.proveedor_cif.toUpperCase())
      .maybeSingle();
    if (prov?.subcuenta_habitual) datos.subcuenta = prov.subcuenta_habitual;
    if (datos.iva_tipo == null && prov?.iva_default != null) datos.iva_tipo = Number(prov.iva_default);
  }

  return { ...datos, confianza, motor };
}
