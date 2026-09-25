import { createHash, timingSafeEqual } from "node:crypto";

/**
 * Autoriza al programa instalado en el servidor del despacho (`Authorization: Bearer
 * $AGENTE_SECRET`). A diferencia del cron, sin secreto configurado NO se abre: estas
 * rutas escriben facturas y devuelven datos fiscales de clientes.
 */
export function autorizadoAgente(request: Request): boolean {
  const secret = process.env.AGENTE_SECRET;
  if (!secret) return false;
  const recibido = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  // Comparación en tiempo constante (sobre hashes para igualar longitudes).
  const h = (s: string) => createHash("sha256").update(s).digest();
  return timingSafeEqual(h(recibido), h(secret));
}

export const noAutorizado = () => Response.json({ error: "No autorizado" }, { status: 401 });
