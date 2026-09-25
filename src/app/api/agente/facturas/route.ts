import { createAdminClient } from "@/lib/supabase/admin";
import { autorizadoAgente, noAutorizado } from "@/lib/agente/auth";
import { resolverClienteCarpeta, trimestreDe } from "@/lib/ocr/core";
import { facturaPorHuella, huella, registrarFactura, todosLosClientes } from "@/lib/ocr/registrar";

// Leer una factura con Claude tarda 10–30 s: el programa manda una por petición.
export const maxDuration = 60;

const MIMES = ["application/pdf", "image/jpeg", "image/png", "image/webp", "image/gif"];

/**
 * UC-401 (servidor del despacho): el programa manda una factura nueva que ha
 * encontrado en la carpeta de un cliente. Multipart con:
 *   - archivo: el fichero (PDF/JPG/PNG), máx. ~4 MB (límite de Vercel)
 *   - ruta:    ruta relativa en el servidor, "Oficina/Carpeta cliente/…/factura.pdf"
 * El fichero NO se guarda aquí: se queda en el servidor. Solo su ruta y su huella.
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
  const hash = huella(buffer);
  const admin = createAdminClient();

  const previa = await facturaPorHuella(admin, hash);
  if (previa) return Response.json({ duplicada: true, id: previa.id, cliente_id: previa.cliente_id });

  // Estructura del servidor: Oficina / Cliente / …
  const [oficina, carpetaCliente] = ruta.split("/");
  const cliente = carpetaCliente
    ? resolverClienteCarpeta(carpetaCliente, oficina ?? null, await todosLosClientes(admin))
    : null;

  try {
    const r = await registrarFactura(admin, admin, {
      base64: buffer.toString("base64"),
      mime,
      cliente_id: cliente?.id ?? null,
      archivo_nombre: archivo.name,
      ruta_servidor: ruta,
      archivo_hash: hash,
      origen: "servidor",
    });
    return Response.json({
      duplicada: false,
      id: r.id,
      cliente_id: cliente?.id ?? null,
      semaforo: r.semaforo,
      trimestre: r.fecha ? trimestreDe(r.fecha) : null,
    });
  } catch (e) {
    // Dos envíos simultáneos de la misma factura: el índice único frena el segundo.
    const ganadora = await facturaPorHuella(admin, hash);
    if (ganadora) return Response.json({ duplicada: true, id: ganadora.id, cliente_id: ganadora.cliente_id });
    return Response.json({ error: (e as Error).message }, { status: 500 });
  }
}
