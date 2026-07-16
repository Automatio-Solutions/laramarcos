import "server-only";
import { MODELO_CLAUDE } from "@/lib/ia/claude";
import {
  clasificarPorSector, esUrgente, resumenAccionable,
  type PublicacionRaw, type SectorRef,
} from "./clasificar";

export interface Clasificacion {
  sector_id: string | null;
  urgente: boolean;
  resumen: string;
}

/** Clasificación determinista por palabras clave (respaldo y valor por defecto). */
function porKeywords(pub: PublicacionRaw, sectores: SectorRef[]): Clasificacion {
  return {
    sector_id: clasificarPorSector(pub, sectores),
    urgente: esUrgente(pub),
    resumen: resumenAccionable(pub),
  };
}

/**
 * UC-302/303 — Clasifica las publicaciones del día por sector, marca las urgentes
 * y redacta un resumen accionable en lenguaje claro para el cliente.
 *
 * Usa Claude en UNA sola llamada para todo el lote (más barato y coherente que
 * una por publicación). Si no hay clave, si la API falla o si devuelve algo que
 * no cuadra, cada publicación cae a la clasificación por palabras clave: el
 * boletín del día nunca se queda sin procesar.
 */
export async function clasificarLote(
  items: PublicacionRaw[],
  sectores: SectorRef[],
): Promise<Clasificacion[]> {
  const respaldo = items.map((it) => porKeywords(it, sectores));
  if (!items.length) return respaldo;

  const key = process.env.ANTHROPIC_API_KEY;
  if (!key || !sectores.length) return respaldo;

  try {
    const { default: Anthropic } = await import("@anthropic-ai/sdk");
    const client = new Anthropic({ apiKey: key });
    const idsValidos = new Set(sectores.map((s) => s.id));

    const msg = await client.messages.create({
      model: MODELO_CLAUDE,
      max_tokens: 8192,
      system:
        "Eres un asesor de una gestoría en Extremadura. Clasificas publicaciones del DOE y del BOE " +
        "para avisar a los clientes de cada sector. Solo marcas como urgente lo que impone un plazo, " +
        "una obligación o una ayuda que se puede perder. El resumen lo lee un empresario, no un jurista: " +
        "una o dos frases, en claro, diciendo a quién afecta y qué hay que hacer.",
      tools: [{
        name: "clasificar_publicaciones",
        description:
          "Devuelve la clasificación de CADA publicación recibida, en el mismo orden y con el mismo número de elementos.",
        input_schema: {
          type: "object",
          properties: {
            resultados: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  indice: { type: "number", description: "Índice de la publicación (empieza en 0)." },
                  sector_id: {
                    type: ["string", "null"],
                    description: "Id de un sector de la lista, o null si no afecta claramente a ninguno. No inventes ids.",
                  },
                  urgente: { type: "boolean", description: "true solo si hay plazo, obligación o ayuda que caduca." },
                  resumen: { type: "string", description: "1-2 frases en claro: a quién afecta y qué hacer." },
                },
                required: ["indice", "sector_id", "urgente", "resumen"],
              },
            },
          },
          required: ["resultados"],
        },
      }],
      tool_choice: { type: "tool", name: "clasificar_publicaciones" },
      messages: [{
        role: "user",
        content:
          `Sectores disponibles (id, nombre):\n${JSON.stringify(sectores)}\n\n` +
          `Publicaciones de hoy:\n${JSON.stringify(items.map((it, i) => ({ indice: i, boletin: (it as PublicacionRaw & { boletin?: string }).boletin ?? "", titulo: it.titulo, resumen: it.resumen ?? "" })))}\n\n` +
          `Clasifica las ${items.length} publicaciones. Devuelve exactamente ${items.length} resultados.`,
      }],
    });

    const block = msg.content.find((b) => b.type === "tool_use");
    if (!block || block.type !== "tool_use") return respaldo;

    const out = (block.input as { resultados?: unknown[] }).resultados ?? [];
    const final = [...respaldo];
    for (const r of out) {
      const row = r as Partial<Clasificacion> & { indice?: number };
      const i = row.indice;
      // Se ignora cualquier fila con índice fuera de rango o sector inventado:
      // esa publicación se queda con su clasificación por palabras clave.
      if (typeof i !== "number" || i < 0 || i >= items.length) continue;
      const sector = row.sector_id != null && idsValidos.has(row.sector_id) ? row.sector_id : null;
      final[i] = {
        sector_id: sector,
        urgente: typeof row.urgente === "boolean" ? row.urgente : respaldo[i].urgente,
        resumen: row.resumen?.trim() || respaldo[i].resumen,
      };
    }
    return final;
  } catch (e) {
    console.error("[M3] Claude falló al clasificar el boletín, se usan palabras clave:", e);
    return respaldo;
  }
}
