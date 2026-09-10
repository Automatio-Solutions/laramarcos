/**
 * Plantillas HTML de los correos que envía la plataforma.
 *
 * Funciones puras (sin acceso a red ni a BBDD) para poder probarlas en
 * tests/unit/email.test.ts. Estilos en línea: los clientes de correo no
 * cargan hojas externas.
 */

const NAVY = "#1F223E";
const SLATE = "#565C6B";
const BORDE = "#E2E4E9";

const eur = new Intl.NumberFormat("es-ES", { style: "currency", currency: "EUR" });

/** Evita que un dato del cliente rompa el HTML del correo. */
export function escapar(texto: string): string {
  return texto
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function envoltorio(cuerpo: string): string {
  return `<div style="margin:0;padding:24px;background:#F8F9FA;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;">
  <div style="max-width:560px;margin:0 auto;background:#FFFFFF;border:1px solid ${BORDE};border-radius:8px;padding:32px;">
    <p style="margin:0 0 24px;font-size:18px;font-weight:700;color:${NAVY};">LaraMarcos Asesores</p>
    ${cuerpo}
  </div>
  <p style="max-width:560px;margin:16px auto 0;font-size:12px;color:${SLATE};text-align:center;">
    LaraMarcos Asesores · Extremadura
  </p>
</div>`;
}

export interface DatosPresupuesto {
  cliente: string;
  total: number;
  validezDias: number;
  enlace: string;
}

/** Correo de envío de un presupuesto: enlace de aceptación, sin adjunto. */
export function emailPresupuesto(d: DatosPresupuesto): { asunto: string; html: string } {
  const asunto = `Presupuesto de LaraMarcos Asesores — ${eur.format(d.total)}`;
  const html = envoltorio(`
    <p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:${SLATE};">
      Buenos días${d.cliente ? `, <strong style="color:${NAVY};">${escapar(d.cliente)}</strong>` : ""}:
    </p>
    <p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:${SLATE};">
      Le enviamos el presupuesto que nos solicitó, por un importe total de
      <strong style="color:${NAVY};">${eur.format(d.total)}</strong> (IVA incluido).
      Puede consultarlo en detalle y aceptarlo o rechazarlo desde este enlace:
    </p>
    <p style="margin:0 0 24px;">
      <a href="${escapar(d.enlace)}" style="display:inline-block;background:${NAVY};color:#FFFFFF;text-decoration:none;font-size:15px;font-weight:600;padding:12px 24px;border-radius:8px;">
        Ver el presupuesto
      </a>
    </p>
    <p style="margin:0 0 16px;font-size:14px;line-height:1.6;color:${SLATE};">
      El presupuesto tiene una validez de ${d.validezDias} días. Si tiene cualquier duda,
      puede responder directamente a este correo y le atendemos.
    </p>
    <p style="margin:0;font-size:14px;line-height:1.6;color:${SLATE};">Un saludo.</p>
  `);
  return { asunto, html };
}

export interface DatosCircular {
  sector: string;
  fecha: string;
  contenido: string;
}

/** Circular de novedades del DOE/BOE para un sector concreto. */
export function emailCircular(d: DatosCircular): { asunto: string; html: string } {
  const asunto = `Novedades normativas — ${d.sector} (${d.fecha})`;
  const puntos = d.contenido
    .split("\n")
    .map((l) => l.replace(/^•\s*/, "").trim())
    .filter(Boolean);

  const lista = puntos
    .map(
      (p) =>
        `<li style="margin:0 0 12px;font-size:15px;line-height:1.6;color:${SLATE};">${escapar(p)}</li>`,
    )
    .join("");

  const html = envoltorio(`
    <p style="margin:0 0 8px;font-size:12px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:${SLATE};">
      Vigilancia normativa · ${escapar(d.sector)}
    </p>
    <p style="margin:0 0 20px;font-size:15px;line-height:1.6;color:${SLATE};">
      Estas son las publicaciones del DOE y el BOE de hoy que afectan a su actividad:
    </p>
    <ul style="margin:0 0 24px;padding-left:20px;">${lista}</ul>
    <p style="margin:0;font-size:14px;line-height:1.6;color:${SLATE};">
      Si alguna de ellas le afecta y quiere que la revisemos en su caso concreto,
      responda a este correo y nos ponemos con ello.
    </p>
  `);
  return { asunto, html };
}
