import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { MODELO_CLAUDE } from "@/lib/ia/claude";
import type { FacturaDatos } from "./core";

export interface ResultadoOCR extends FacturaDatos {
  confianza: number;
  motor: "claude" | "manual";
}

const VACIO: FacturaDatos = {
  fecha: null, proveedor_nombre: null, proveedor_cif: null, concepto: null,
  base_imponible: null, iva_tipo: null, iva_cuota: null, total: null,
  subcuenta: null, subcuenta_motivo: null, subcuenta_origen: null,
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
      const source = mime === "application/pdf"
        ? { type: "document" as const, source: { type: "base64" as const, media_type: "application/pdf" as const, data: base64 } }
        : { type: "image" as const, source: { type: "base64" as const, media_type: mime as "image/jpeg" | "image/png", data: base64 } };

      const msg = await client.messages.create({
        model: MODELO_CLAUDE,
        max_tokens: 4096,
        system:
          "Eres el contable de una gestoría española. Precontabilizas facturas de proveedor. " +
          "Trabajas con el Plan General Contable español: los gastos van al grupo 6 " +
          "(600 compras de mercaderías, 621 arrendamientos, 622 reparaciones y conservación, " +
          "623 servicios profesionales, 625 primas de seguros, 626 servicios bancarios, " +
          "628 suministros —luz, agua, teléfono—, 629 otros servicios). " +
          "Si el dato no aparece en la factura, devuelve null; no lo inventes.",
        tools: [{
          name: "extraer_factura",
          description: "Extrae los datos contables de la factura y propone la subcuenta contable.",
          input_schema: {
            type: "object",
            properties: {
              fecha: { type: ["string", "null"], description: "Fecha de la factura en formato ISO (YYYY-MM-DD)." },
              proveedor_nombre: { type: ["string", "null"] },
              proveedor_cif: { type: ["string", "null"] },
              concepto: { type: ["string", "null"], description: "Qué se compró, en pocas palabras." },
              base_imponible: { type: ["number", "null"] },
              iva_tipo: {
                type: ["number", "null"],
                description:
                  "Tipo de IVA en %. AC-02: si la factura no lo indica con número pero dice 'IVA reducido', usa 10; " +
                  "'IVA superreducido' → 4; 'IVA general' → 21. Si puedes deducirlo de la cuota y la base, hazlo.",
              },
              iva_cuota: { type: ["number", "null"] },
              total: { type: ["number", "null"] },
              subcuenta_sugerida: {
                type: ["string", "null"],
                description: "AC-02: subcuenta del PGC más probable para este gasto (p. ej. 628). null si no puedes proponer ninguna.",
              },
              subcuenta_motivo: {
                type: ["string", "null"],
                description:
                  "AC-02: por qué esa subcuenta, en una frase para el asesor. Si el concepto es ambiguo, dilo " +
                  "explícitamente y explica entre qué opciones dudas.",
              },
              confianza: { type: "number", description: "0-100. Baja si la factura está borrosa o faltan datos." },
            },
            required: ["confianza"],
          },
        }],
        tool_choice: { type: "tool", name: "extraer_factura" },
        messages: [{ role: "user", content: [source, { type: "text", text: "Extrae los datos de esta factura y propón la subcuenta contable." }] }],
      });
      const block = msg.content.find((b) => b.type === "tool_use");
      if (block && block.type === "tool_use") {
        const out = block.input as Partial<ResultadoOCR> & {
          subcuenta_sugerida?: string | null;
          subcuenta_motivo?: string | null;
        };
        datos = {
          fecha: out.fecha ?? null, proveedor_nombre: out.proveedor_nombre ?? null,
          proveedor_cif: out.proveedor_cif ?? null, concepto: out.concepto ?? null,
          base_imponible: out.base_imponible ?? null, iva_tipo: out.iva_tipo ?? null,
          iva_cuota: out.iva_cuota ?? null, total: out.total ?? null,
          // AC-02: propuesta de la IA. La pisará el histórico del proveedor si existe.
          subcuenta: out.subcuenta_sugerida?.trim() || null,
          subcuenta_motivo: out.subcuenta_motivo?.trim() || null,
          subcuenta_origen: out.subcuenta_sugerida?.trim() ? "ia" : null,
        };
        confianza = Math.max(0, Math.min(100, out.confianza ?? 0));
        motor = "claude";
      }
    } catch (e) {
      // Fallo de API → fila manual (semáforo rojo). Se registra para que un
      // modelo mal configurado o una clave sin saldo no pasen desapercibidos.
      console.error("[M4] Claude falló al leer la factura, queda para revisión manual:", e);
      datos = { ...VACIO };
      confianza = 0;
      motor = "manual";
    }
  }

  // UC-403: el histórico del proveedor manda sobre la sugerencia de la IA — lo que
  // el despacho ya usó con ese proveedor es mejor dato que una propuesta genérica.
  if (datos.proveedor_cif) {
    const { data: prov } = await supabase
      .from("proveedores")
      .select("subcuenta_habitual, iva_default")
      .eq("cif", datos.proveedor_cif.toUpperCase())
      .maybeSingle();
    if (prov?.subcuenta_habitual) {
      const sugerida = datos.subcuenta;
      datos.subcuenta = prov.subcuenta_habitual;
      datos.subcuenta_origen = "historico";
      datos.subcuenta_motivo =
        sugerida && sugerida !== prov.subcuenta_habitual
          ? `Subcuenta habitual de este proveedor en el despacho. (La IA proponía ${sugerida}: ${datos.subcuenta_motivo ?? "sin motivo"})`
          : "Subcuenta habitual de este proveedor en el despacho.";
    }
    if (datos.iva_tipo == null && prov?.iva_default != null) datos.iva_tipo = Number(prov.iva_default);
  }

  return { ...datos, confianza, motor };
}
