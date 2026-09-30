-- ============================================================================
-- Migración 0025 — crear_notificacion solo desde el servidor
-- LaraMarcos Asesores · PostgreSQL (Supabase)
--
-- crear_notificacion (0004) es SECURITY DEFINER y estaba concedida a
-- `authenticated`: cualquier usuario con sesión podía llamarla directamente por
-- la API y fabricar avisos a cualquier compañero, con cualquier texto y enlace
-- (p. ej. una falsa mención que lleve a otra página).
--
-- Desde ahora la llama solo el servidor (service_role), después de validar la
-- acción que provoca el aviso: menciones del chat y de tareas, tareas
-- desbloqueadas, alertas y resúmenes del cron (src/lib/notificaciones.ts).
--
-- ORDEN DE DESPLIEGUE: aplicar DESPUÉS de desplegar el código que avisa con el
-- cliente de servicio; si no, los avisos de la versión anterior fallarían.
-- ============================================================================

revoke execute on function public.crear_notificacion(uuid, text, text, text) from public;
revoke execute on function public.crear_notificacion(uuid, text, text, text) from anon;
revoke execute on function public.crear_notificacion(uuid, text, text, text) from authenticated;
grant  execute on function public.crear_notificacion(uuid, text, text, text) to service_role;

-- ============================================================================
-- Fin migración 0025
-- ============================================================================
