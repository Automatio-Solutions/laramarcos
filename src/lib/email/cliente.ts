import "server-only";
import { Resend } from "resend";

export { trocear, MAX_DESTINATARIOS } from "./core";

/**
 * Capa de envío sobre Resend (dominio laramarcosasesores.es, verificado con
 * DKIM + SPF sobre el subdominio `send`).
 *
 * Regla del proyecto: el correo sale SIEMPRE por Resend desde el dominio propio,
 * nunca por Gmail/Outlook personales. Las respuestas de los clientes llegan al
 * buzón del despacho (MX del dominio raíz), no a Resend.
 */

export const REMITENTE_PRESUPUESTOS = "LaraMarcos Asesores <presupuestos@laramarcosasesores.es>";
export const REMITENTE_CIRCULARES = "LaraMarcos Asesores <circulares@laramarcosasesores.es>";

/** Hay clave de Resend configurada. Sin ella el sistema degrada, no rompe. */
export const hayResend = (): boolean => Boolean(process.env.RESEND_API_KEY);

/** URL pública de la app, para construir enlaces absolutos en los correos. */
export function appUrl(): string {
  const explicita = process.env.NEXT_PUBLIC_APP_URL;
  if (explicita) return explicita.replace(/\/$/, "");
  // En previews de Vercel no hay dominio propio: se usa el de la propia deploy.
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  return "http://localhost:3000";
}

export interface ResultadoEnvio {
  ok: boolean;
  id?: string;
  error?: string;
}

export interface Envio {
  from: string;
  to: string | string[];
  subject: string;
  html: string;
  /** Copia oculta: se usa en las circulares para no exponer la cartera. */
  bcc?: string[];
  replyTo?: string;
}

/**
 * Envía un correo. Nunca lanza: devuelve el resultado para que quien llama
 * decida si marca el registro como enviado o deja el aviso al usuario.
 */
export async function enviarEmail(envio: Envio): Promise<ResultadoEnvio> {
  const clave = process.env.RESEND_API_KEY;
  if (!clave) return { ok: false, error: "No hay RESEND_API_KEY configurada." };

  try {
    const resend = new Resend(clave);
    const { data, error } = await resend.emails.send({
      from: envio.from,
      to: envio.to,
      subject: envio.subject,
      html: envio.html,
      ...(envio.bcc?.length ? { bcc: envio.bcc } : {}),
      ...(envio.replyTo ? { replyTo: envio.replyTo } : {}),
    });
    if (error) return { ok: false, error: error.message };
    return { ok: true, id: data?.id };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Fallo de envío." };
  }
}
