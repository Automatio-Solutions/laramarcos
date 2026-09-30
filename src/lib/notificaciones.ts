import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";

export interface Aviso {
  usuario: string;
  tipo: string;
  mensaje: string;
  enlace: string;
}

/**
 * Crea avisos en la campana para terceros. Solo desde el servidor y DESPUÉS de haber
 * validado la acción que los provoca (mención válida, tarea desbloqueada…): desde la
 * migración 0025 crear_notificacion ya no la puede llamar un usuario con su sesión, porque
 * permitía fabricar avisos a cualquiera con cualquier texto y enlace.
 * Nunca lanza: un aviso que falla no debe romper la acción principal.
 */
export async function notificar(avisos: Aviso[]): Promise<void> {
  if (avisos.length === 0) return;
  const admin = createAdminClient();
  const r = await Promise.allSettled(
    avisos.map((a) =>
      admin.rpc("crear_notificacion", {
        p_usuario: a.usuario,
        p_tipo: a.tipo,
        p_mensaje: a.mensaje,
        p_enlace: a.enlace,
      }),
    ),
  );
  for (const x of r) {
    if (x.status === "rejected") console.error("[notificaciones]", x.reason);
    else if (x.value.error) console.error("[notificaciones]", x.value.error);
  }
}
