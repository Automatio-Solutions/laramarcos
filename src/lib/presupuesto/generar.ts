import "server-only";
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
    const model = process.env.ANTHROPIC_MODEL ?? "claude-sonnet-4-6";

    const catalogoMin = catalogo.map((s) => ({ id: s.id, nombre: s.nombre, precio_base: s.precio_base }));
    const msg = await client.messages.create({
      model,
      max_tokens: 1024,
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
                    concepto: { type: "string" },
                    cantidad: { type: "number" },
                    precio: { type: "number" },
                    descuento: { type: "number" },
                  },
                  required: ["concepto", "cantidad", "precio", "descuento"],
                },
              },
              aviso: { type: ["string", "null"], description: "Mensaje si la descripción es ambigua o no hay servicio claro." },
            },
            required: ["lineas", "aviso"],
          },
        },
      ],
      tool_choice: { type: "tool", name: "proponer_lineas" },
      messages: [
        {
          role: "user",
          content: `Catálogo de servicios (id, nombre, precio_base):\n${JSON.stringify(catalogoMin)}\n\nDescripción del trabajo:\n"${texto}"\n\nIdentifica qué servicios del catálogo aplican y a qué precio. Si la descripción es ambigua o no encaja ningún servicio, deja lineas vacío y rellena 'aviso'. No inventes precios.`,
        },
      ],
    });

    const block = msg.content.find((b) => b.type === "tool_use");
    if (block && block.type === "tool_use") {
      const out = block.input as ResultadoGeneracion;
      return { lineas: out.lineas ?? [], aviso: out.aviso ?? null, motor: "claude" };
    }
    return { ...generarDesdeTexto(texto, catalogo), motor: "fallback" };
  } catch {
    // Cualquier fallo de la API → fallback determinista (no bloquea al usuario).
    return { ...generarDesdeTexto(texto, catalogo), motor: "fallback" };
  }
}
