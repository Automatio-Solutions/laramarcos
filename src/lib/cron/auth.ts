import type { NextRequest } from "next/server";

/**
 * Autoriza una llamada a /api/cron/*.
 *
 * Vercel Cron manda `Authorization: Bearer $CRON_SECRET`; las llamadas manuales
 * (curl, botón del panel) usan `x-cron-secret`. Se aceptan las dos: si solo se
 * comprobara la segunda, los crons programados devolverían 401 y no se
 * ejecutaría nada.
 *
 * Sin CRON_SECRET configurado el endpoint queda abierto, que es lo que permite
 * probarlo en local.
 */
export function autorizadoCron(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return true;
  if (request.headers.get("x-cron-secret") === secret) return true;
  return request.headers.get("authorization") === `Bearer ${secret}`;
}
