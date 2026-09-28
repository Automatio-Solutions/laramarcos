import { createAdminClient } from "@/lib/supabase/admin";
import { autorizadoAgente, noAutorizado } from "@/lib/agente/auth";
import { OFICINAS } from "@/lib/types";
import { parsearRutaServidor, resolverClienteCarpeta, trimestreDe } from "@/lib/ocr/core";
import {
  facturaDuplicada, facturaPorHuella, huella, huellaPaginas, registrarFactura, todosLosClientes,
} from "@/lib/ocr/registrar";

// Leer una factura con Claude tarda 10–30 s: el programa manda una por petición.
export const maxDuration = 60;

const MIMES = ["application/pdf", "image/jpeg", "image/png", "image/webp", "image/gif"];

/**
 * UC-401 (servidor del despacho): el programa manda una factura nueva que ha
 * encontrado en la carpeta de un cliente. Multipart con:
 *   - archivo: el fichero (PDF/JPG/PNG), máx. ~4 MB (límite de Vercel)
 *   - ruta:    ruta relativa a DocumentacionLM, p. ej.
 *              "LARAMARCOS_BADAJOZ/01. CLIENTES/KANTARADS DIGITAL, S.L./07. CONTABILIDAD/
 *               AÑO 2026/1º TRIMESTRE/GASTOS/factura.pdf"
 * De la ruta salen la oficina, el cliente, el libro (GASTOS/INGRESOS) y el
 * trimestre en el que se contabiliza. El fichero NO se guarda aquí: se queda en
 * el servidor. Solo su ruta y su huella.
 * Factura sacada de un PDF con varias (el programa la extrae y la manda sola):
 *   - hash_origen:  sha256 del PDF completo
 *   - pagina_desde, pagina_hasta: sus páginas en él
 *   - corte_dudoso: "1" si la separación no estaba clara
 *   - numero_factura, nif_emisor: lo que vio la separación (evita releer duplicadas)
 * Idempotente por huella: reenviar la misma factura devuelve la ya registrada.
 */
export async function POST(request: Request) {
  if (!autorizadoAgente(request)) return noAutorizado();

  const form = await request.formData().catch(() => null);
  const archivo = form?.get("archivo");
  const ruta = String(form?.get("ruta") ?? "").replace(/\\/g, "/").replace(/^\/+/, "").trim();
  if (!(archivo instanceof File) || archivo.size === 0 || !ruta) {
    return Response.json({ error: "Faltan 'archivo' o 'ruta'." }, { status: 400 });
  }
  const mime = archivo.type || (archivo.name.toLowerCase().endsWith(".pdf") ? "application/pdf" : "");
  if (!MIMES.includes(mime)) {
    return Response.json({ error: `Tipo de fichero no admitido: ${mime || archivo.name}` }, { status: 415 });
  }

  const buffer = Buffer.from(await archivo.arrayBuffer());
  const hashOrigen = String(form?.get("hash_origen") ?? "").trim();
  const desde = Number(form?.get("pagina_desde"));
  const hasta = Number(form?.get("pagina_hasta"));
  const paginas = /^[0-9a-f]{64}$/.test(hashOrigen) && Number.isInteger(desde) && Number.isInteger(hasta) && desde >= 1 && hasta >= desde
    ? { desde, hasta, dudoso: form?.get("corte_dudoso") === "1" }
    : null;
  const hash = paginas ? huellaPaginas(hashOrigen, desde, hasta) : huella(buffer);
  const admin = createAdminClient();

  const previa = await facturaPorHuella(admin, hash);
  if (previa) return Response.json({ duplicada: true, id: previa.id, cliente_id: previa.cliente_id });

  const r = parsearRutaServidor(ruta, OFICINAS);
  if (!r.tipo) {
    return Response.json({ error: "La factura no está en una carpeta GASTOS o INGRESOS." }, { status: 422 });
  }
  const cliente = r.carpetaCliente
    ? resolverClienteCarpeta(r.carpetaCliente, r.oficina, await todosLosClientes(admin))
    : null;

  // En gastos el emisor es el proveedor: si la separación ya vio NIF y nº y esa
  // factura existe, no se vuelve a leer (el PDF del trimestre reenviado con más).
  if (paginas && r.tipo === "gasto" && cliente) {
    const ya = await facturaDuplicada(admin, {
      cliente_id: cliente.id, tipo: "gasto",
      proveedor_cif: String(form?.get("nif_emisor") ?? "").trim() || null,
      numero_factura: String(form?.get("numero_factura") ?? "").trim() || null,
    });
    if (ya) return Response.json({ duplicada: true, id: ya, cliente_id: cliente.id });
  }

  try {
    const reg = await registrarFactura(admin, admin, {
      base64: buffer.toString("base64"),
      mime,
      cliente_id: cliente?.id ?? null,
      tipo: r.tipo,
      trimestreCarpeta: r.trimestre,
      archivo_nombre: archivo.name,
      ruta_servidor: ruta,
      archivo_hash: hash,
      origen: "servidor",
      paginas,
    });
    if (reg.duplicada) return Response.json({ duplicada: true, id: reg.id, cliente_id: cliente?.id ?? null });
    return Response.json({
      duplicada: false,
      id: reg.id,
      cliente_id: cliente?.id ?? null,
      tipo: r.tipo,
      semaforo: reg.semaforo,
      trimestre: r.trimestre ?? (reg.fecha ? trimestreDe(reg.fecha) : null),
    });
  } catch (e) {
    // Dos envíos simultáneos de la misma factura: el índice único frena el segundo.
    const ganadora = await facturaPorHuella(admin, hash);
    if (ganadora) return Response.json({ duplicada: true, id: ganadora.id, cliente_id: ganadora.cliente_id });
    return Response.json({ error: (e as Error).message }, { status: 500 });
  }
}
