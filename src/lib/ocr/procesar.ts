import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { MODELO_CLAUDE } from "@/lib/ia/claude";
import {
  avisosFactura, confianzaConAvisos, cuentaSegunRegimen, regimenDe,
  type Aviso, type FacturaDatos, type LineaIva, type Regimen, type TipoFactura,
} from "./core";
import { codigosDe, conceptosDe } from "./conceptos";

export interface ResultadoOCR extends FacturaDatos {
  confianza: number;
  avisos: Aviso[];
  motor: "claude" | "manual";
}

/** Para quién es la factura: el libro (gastos/ingresos) y el cliente del despacho. */
export interface ContextoFactura {
  tipo: TipoFactura;
  cliente: { id: string; cif: string; razon_social: string; regimen_contable: Regimen | null } | null;
}

const vacio = (tipo: TipoFactura): FacturaDatos => ({
  tipo, fecha: null, fecha_contable: null, numero_factura: null, proveedor_nombre: null, proveedor_cif: null,
  concepto: null, base_imponible: null, iva_tipo: null, iva_cuota: null, lineas_iva: [],
  retencion_base: null, retencion_tipo: null, retencion_cuota: null, total: null,
  subcuenta: null, subcuenta_tercero: null, sujeto_pasivo: false, subcuenta_motivo: null, subcuenta_origen: null,
});

const redondea = (n: number) => Math.round(n * 100) / 100;

/** Instrucciones de la cuenta de gasto/ingreso según el régimen del cliente. */
function instruccionCuenta(tipo: TipoFactura, regimen: Regimen): string {
  if (regimen === "fiscal") {
    const lista = conceptosDe(tipo).map((c) => `${c.codigo} ${c.descripcion}`).join("; ");
    return (
      `El cliente es autónomo (programa fiscal): en "cuenta" pon SOLO el código de concepto de Aplifisa ` +
      `que mejor encaje, de esta lista: ${lista}.`
    );
  }
  return tipo === "gasto"
    ? "El cliente es una sociedad (partida doble): en \"cuenta\" pon la cuenta del Plan General Contable del gasto " +
        "(600 compras de mercaderías, 621 arrendamientos, 622 reparaciones y conservación, 623 servicios profesionales, " +
        "624 transportes, 625 primas de seguros, 626 servicios bancarios, 627 publicidad, 628 suministros, 629 otros servicios)."
    : "El cliente es una sociedad (partida doble): en \"cuenta\" pon la cuenta del Plan General Contable del ingreso " +
        "(700 ventas, 705 prestaciones de servicios, 759 ingresos por servicios diversos…).";
}

/**
 * Procesa una factura: extrae los campos con Claude (si hay clave), aplica la
 * memoria de cuentas del cliente (UC-403) y calcula los avisos de revisión.
 * Sin clave o si falla la API → fila manual (rojo).
 */
export async function procesarFactura(
  admin: SupabaseClient,
  base64: string,
  mime: string,
  ctx: ContextoFactura,
): Promise<ResultadoOCR> {
  const regimen = regimenDe(ctx.cliente?.cif, ctx.cliente?.regimen_contable);
  const codigos = codigosDe(ctx.tipo);
  let datos = vacio(ctx.tipo);
  let confianza = 0;
  let motor: "claude" | "manual" = "manual";
  const avisos: Aviso[] = [];

  const key = process.env.ANTHROPIC_API_KEY;
  if (key && (mime === "application/pdf" || mime.startsWith("image/"))) {
    try {
      const { default: Anthropic } = await import("@anthropic-ai/sdk");
      const client = new Anthropic({ apiKey: key });
      const source = mime === "application/pdf"
        ? { type: "document" as const, source: { type: "base64" as const, media_type: "application/pdf" as const, data: base64 } }
        : { type: "image" as const, source: { type: "base64" as const, media_type: mime as "image/jpeg" | "image/png", data: base64 } };

      const quien = ctx.cliente ? `${ctx.cliente.razon_social} (NIF ${ctx.cliente.cif})` : "el cliente del despacho";
      const tercero = ctx.tipo === "gasto" ? "el EMISOR (proveedor)" : "el DESTINATARIO (cliente de nuestro cliente)";

      const msg = await client.messages.create({
        model: MODELO_CLAUDE,
        max_tokens: 4096,
        system:
          "Eres el contable de una gestoría española y precontabilizas facturas para importarlas en Aplifisa. " +
          `Esta factura es ${ctx.tipo === "gasto" ? "un GASTO (factura recibida)" : "un INGRESO (factura emitida)"} de ${quien}. ` +
          `El "tercero" es ${tercero}: nunca el propio ${quien}. ` +
          instruccionCuenta(ctx.tipo, regimen) + " " +
          "Si la factura tiene varios tipos de IVA, devuelve una línea por tipo. " +
          "Las facturas de profesionales y alquileres suelen llevar retención de IRPF: recógela aparte del IVA. " +
          "Las rectificativas y abonos van con importes en negativo. " +
          "Si el dato no aparece en la factura, devuelve null; no lo inventes.",
        tools: [{
          name: "extraer_factura",
          description: "Extrae los datos contables de la factura y propone la cuenta de gasto o ingreso.",
          input_schema: {
            type: "object",
            properties: {
              fecha: { type: ["string", "null"], description: "Fecha de expedición en formato ISO (YYYY-MM-DD)." },
              numero_factura: { type: ["string", "null"], description: "Número de la factura completo, tal cual aparece (con serie si la tiene)." },
              tercero_nombre: { type: ["string", "null"], description: "Nombre o razón social del tercero, como aparece en la factura." },
              tercero_nif: { type: ["string", "null"], description: "NIF/CIF del tercero, sin espacios ni guiones." },
              emisor_es_cliente: {
                type: "boolean",
                description: `true si quien EMITE la factura es ${quien}.`,
              },
              concepto: { type: ["string", "null"], description: "Qué se compró o vendió, en pocas palabras." },
              lineas_iva: {
                type: "array",
                description:
                  "Una entrada por cada tipo de IVA de la factura. Tipo en % (21, 10, 4, 0). Si no dice el número pero pone " +
                  "'IVA reducido' → 10; 'superreducido' → 4; 'general' → 21. Con inversión del sujeto pasivo, cuota 0.",
                items: {
                  type: "object",
                  properties: {
                    base: { type: ["number", "null"] },
                    tipo: { type: ["number", "null"] },
                    cuota: { type: ["number", "null"] },
                  },
                },
              },
              retencion_tipo: { type: ["number", "null"], description: "Tipo de retención de IRPF en % (15, 7, 19). null si no lleva." },
              retencion_base: { type: ["number", "null"], description: "Base de la retención. null si no lleva." },
              retencion_cuota: { type: ["number", "null"], description: "Importe retenido, en positivo. null si no lleva." },
              total: { type: ["number", "null"], description: "Total de la factura (base + IVA − retención + otros conceptos)." },
              sujeto_pasivo: {
                type: "boolean",
                description: "true si la factura indica inversión del sujeto pasivo (art. 84 LIVA, 'ISP', 'inversión del sujeto pasivo').",
              },
              cuenta: {
                type: ["string", "null"],
                description: regimen === "fiscal" ? "Código de concepto de Aplifisa (3 dígitos)." : "Cuenta del PGC (3 o 4 dígitos).",
              },
              cuenta_motivo: {
                type: ["string", "null"],
                description: "Por qué esa cuenta, en una frase para el asesor. Si el concepto es ambiguo, dilo y explica entre qué opciones dudas.",
              },
              confianza: { type: "number", description: "0-100. Baja si la factura está borrosa o faltan datos." },
            },
            required: ["confianza", "lineas_iva", "emisor_es_cliente", "sujeto_pasivo"],
          },
        }],
        tool_choice: { type: "tool", name: "extraer_factura" },
        messages: [{ role: "user", content: [source, { type: "text", text: "Extrae los datos de esta factura." }] }],
      });

      const block = msg.content.find((b) => b.type === "tool_use");
      if (block && block.type === "tool_use") {
        const out = block.input as {
          fecha?: string | null; numero_factura?: string | null; tercero_nombre?: string | null; tercero_nif?: string | null;
          emisor_es_cliente?: boolean; concepto?: string | null; lineas_iva?: LineaIva[];
          retencion_tipo?: number | null; retencion_base?: number | null; retencion_cuota?: number | null;
          total?: number | null; sujeto_pasivo?: boolean; cuenta?: string | null; cuenta_motivo?: string | null;
          confianza?: number;
        };
        const lineas = (out.lineas_iva ?? []).filter((l) => l && (l.base != null || l.cuota != null));
        const suma = (k: "base" | "cuota") =>
          lineas.some((l) => l[k] != null) ? redondea(lineas.reduce((s, l) => s + (l[k] ?? 0), 0)) : null;
        const cuenta = cuentaSegunRegimen(out.cuenta, regimen, codigos);
        datos = {
          ...datos,
          fecha: out.fecha ?? null,
          numero_factura: out.numero_factura?.trim() || null,
          proveedor_nombre: out.tercero_nombre?.trim() || null,
          proveedor_cif: out.tercero_nif?.replace(/[\s.-]/g, "").toUpperCase() || null,
          concepto: out.concepto ?? null,
          lineas_iva: lineas.length > 1 ? lineas : [],
          base_imponible: suma("base"),
          iva_tipo: lineas.length === 1 ? lineas[0].tipo : null,
          iva_cuota: suma("cuota"),
          retencion_base: out.retencion_base ?? null,
          retencion_tipo: out.retencion_tipo ?? null,
          retencion_cuota: out.retencion_cuota != null ? Math.abs(out.retencion_cuota) : null,
          total: out.total ?? null,
          sujeto_pasivo: !!out.sujeto_pasivo,
          // AC-02: propuesta de la IA. La pisa la memoria del cliente si existe.
          subcuenta: cuenta,
          subcuenta_motivo: out.cuenta_motivo?.trim() || null,
          subcuenta_origen: cuenta ? "ia" : null,
        };
        confianza = Math.max(0, Math.min(100, out.confianza ?? 0));
        motor = "claude";

        // Una factura emitida por el propio cliente en GASTOS (o al revés) está en el libro equivocado.
        if (typeof out.emisor_es_cliente === "boolean" && out.emisor_es_cliente !== (ctx.tipo === "ingreso")) {
          avisos.push({
            codigo: "libro",
            texto: ctx.tipo === "gasto"
              ? "Parece una factura EMITIDA por el cliente (un ingreso) y está en gastos."
              : "Parece una factura RECIBIDA por el cliente (un gasto) y está en ingresos.",
            nivel: "rojo",
          });
        }
      }
    } catch (e) {
      // Fallo de API → fila manual (semáforo rojo). Se registra para que un
      // modelo mal configurado o una clave sin saldo no pasen desapercibidos.
      console.error("[M4] Claude falló al leer la factura, queda para revisión manual:", e);
      datos = vacio(ctx.tipo);
      confianza = 0;
      motor = "manual";
    }
  }

  await aplicarMemoria(admin, datos, ctx, regimen, codigos);

  const todos = [...avisos, ...avisosFactura(datos, regimen)];
  return { ...datos, confianza: confianzaConAvisos(confianza, todos), avisos: todos, motor };
}

/**
 * UC-403: lo que el despacho ya usó con este tercero EN ESTE CLIENTE manda sobre
 * la IA. La subcuenta del proveedor/cliente solo puede salir de aquí: la IA no la
 * conoce. Sin memoria del cliente, la cuenta de gasto habitual del proveedor en
 * el despacho sirve de pista (solo gastos).
 */
async function aplicarMemoria(
  admin: SupabaseClient,
  datos: FacturaDatos,
  ctx: ContextoFactura,
  regimen: Regimen,
  codigos: readonly string[],
) {
  const nif = datos.proveedor_cif;
  if (!nif) return;
  const sugerida = datos.subcuenta;
  const usar = (cuenta: string | null, motivo: string) => {
    if (!cuenta) return;
    datos.subcuenta = cuenta;
    datos.subcuenta_origen = "historico";
    datos.subcuenta_motivo =
      sugerida && sugerida !== cuenta ? `${motivo} (La IA proponía ${sugerida}: ${datos.subcuenta_motivo ?? "sin motivo"})` : motivo;
  };

  if (ctx.cliente) {
    const { data: m } = await admin
      .from("cuentas_terceros")
      .select("subcuenta, subcuenta_tercero, iva_default")
      .eq("cliente_id", ctx.cliente.id)
      .eq("tipo", ctx.tipo)
      .eq("nif", nif)
      .maybeSingle();
    if (m) {
      usar(cuentaSegunRegimen(m.subcuenta, regimen, codigos), "Cuenta habitual de este proveedor/cliente en este cliente.");
      if (regimen === "partida_doble") datos.subcuenta_tercero = m.subcuenta_tercero ?? null;
      if (datos.iva_tipo == null && !datos.lineas_iva.length && m.iva_default != null) datos.iva_tipo = Number(m.iva_default);
      return;
    }
  }

  if (ctx.tipo === "gasto") {
    const { data: prov } = await admin
      .from("proveedores")
      .select("subcuenta_habitual, iva_default")
      .eq("cif", nif)
      .maybeSingle();
    usar(cuentaSegunRegimen(prov?.subcuenta_habitual, regimen, codigos), "Cuenta habitual de este proveedor en el despacho.");
    if (datos.iva_tipo == null && !datos.lineas_iva.length && prov?.iva_default != null) datos.iva_tipo = Number(prov.iva_default);
  }
}
