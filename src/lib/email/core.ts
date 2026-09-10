/**
 * Lógica pura de la capa de correo (sin red, sin `server-only`), para poder
 * probarla en tests/unit/email.test.ts. El envío real vive en ./cliente.ts.
 */

/** Resend acepta como máximo 50 destinatarios por envío. */
export const MAX_DESTINATARIOS = 50;

/** Parte una lista de destinatarios en tandas del tamaño que admite Resend. */
export function trocear<T>(items: T[], tam = MAX_DESTINATARIOS): T[][] {
  const tandas: T[][] = [];
  for (let i = 0; i < items.length; i += tam) tandas.push(items.slice(i, i + tam));
  return tandas;
}
