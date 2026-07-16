import "server-only";
import { MODELO_CLAUDE } from "@/lib/ia/claude";
import { generarDesdeTexto, type ServicioCatalogo, type ResultadoGeneracion } from "./core";

// UC-201: genera las líneas del presupuesto a partir de texto libre + catálogo.
// Con ANTHROPIC_API_KEY usa Claude (consulta el catálogo vía API, no envía Excel);
// sin clave, usa el fallback determinista (mismo contrato de salida).
export async function generarPresupuesto(
  texto: string,
  catalogo: ServicioCatalogo[],
): Promise<ResultadoGeneracion & { motor: "claude" | "fallback" }> {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) {
    return { ...generarDesdeTexto(texto, catalogo), motor: "fallback" };
  }

  try {
    const { default: Anthropic } = await import("@anthropic-ai/sdk");
    const client = new Anthropic({ apiKey: key });

    const catalogoMin = catalogo.map((s) => ({
      codigo: s.codigo ?? null,
      nombre: s.nombre,
      precio_base: Number(s.precio_base),
      unidad: s.unidad ?? "fijo",
    }));
    const msg = await client.messages.create({
      model: MODELO_CLAUDE,
      max_tokens: 8192,
      system:
        "Eres asesor de una gestoría en Extremadura y preparas presupuestos con el tarifario del despacho.\n" +
        "Reglas que no puedes saltarte:\n" +
        "· Solo puedes usar servicios del catálogo que te dan. Nunca inventes servicios ni precios.\n" +
        "· Los precios del catálogo son BASE IMPONIBLE (sin IVA). El IVA lo añade el sistema después: no lo metas tú.\n" +
        "· unidad='fijo' → precio cerrado, cantidad = número de gestiones.\n" +
        "· unidad='hora' → es una TARIFA HORARIA. La cantidad son horas estimadas. Si no puedes estimarlas con " +
        "fundamento, pon cantidad 1 y dilo en el aviso para que el asesor ajuste las horas.\n" +
        "· unidad='unidad' → la cantidad es el número de unidades (p. ej. documentos impresos).\n" +
        "· Si el cliente describe algo que el tarifario no cubre, NO lo fuerces contra un servicio parecido: " +
        "déjalo fuera y avísalo.",
      tools: [
        {
          name: "proponer_lineas",
          description: "Devuelve las líneas de presupuesto identificadas del catálogo. No inventes servicios ni precios fuera del catálogo.",
          input_schema: {
            type: "object",
            properties: {
              lineas: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    codigo: { type: ["string", "null"], description: "Código del servicio del catálogo (p. ej. FSCL-001)." },
                    concepto: { type: "string", description: "Nombre del servicio tal cual aparece en el catálogo." },
                    cantidad: { type: "number", description: "Gestiones, horas o unidades según la 'unidad' del servicio." },
                    precio: { type: "number", description: "precio_base del catálogo, sin IVA. No lo cambies." },
                    descuento: { type: "number", description: "% de descuento en la línea. 0 salvo que el asesor lo pida." },
                  },
                  required: ["concepto", "cantidad", "precio", "descuento"],
                },
              },
              aviso: {
                type: ["string", "null"],
                description: "Qué debe revisar el asesor: horas estimadas a ojo, peticiones que el tarifario no cubre, ambigüedades. null si no hay nada que señalar.",
              },
            },
            required: ["lineas", "aviso"],
          },
        },
      ],
      tool_choice: { type: "tool", name: "proponer_lineas" },
      messages: [
        {
          role: "user",
          content:
            `Tarifario del despacho (codigo, nombre, precio_base sin IVA, unidad):\n${JSON.stringify(catalogoMin)}\n\n` +
            `Lo que necesita el cliente:\n"${texto}"\n\n` +
            `Monta el presupuesto con los servicios del tarifario que apliquen. Si no encaja ninguno, deja lineas vacío y explica por qué en 'aviso'.`,
        },
      ],
    });

    const block = msg.content.find((b) => b.type === "tool_use");
    if (block && block.type === "tool_use") {
      const out = block.input as ResultadoGeneracion;
      return { lineas: out.lineas ?? [], aviso: out.aviso ?? null, motor: "claude" };
    }
    return { ...generarDesdeTexto(texto, catalogo), motor: "fallback" };
  } catch (e) {
    // Cualquier fallo de la API → fallback determinista (no bloquea al usuario),
    // pero SÍ se registra: si no, un modelo mal configurado o una clave sin saldo
    // degradarían a fallback en silencio y nadie se enteraría.
    console.error("[M2] Claude falló al generar el presupuesto, se usa el fallback:", e);
    return { ...generarDesdeTexto(texto, catalogo), motor: "fallback" };
  }
}
