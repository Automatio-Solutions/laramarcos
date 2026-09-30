-- ============================================================================
-- Migración 0024 — Chat interno: integridad de los adjuntos (auditoría fase 3)
-- LaraMarcos Asesores · PostgreSQL (Supabase)
--
--   1. Un objeto de Storage pertenece a UN solo mensaje: índice único parcial
--      sobre mensajes(adjunto_path). Sin él, un miembro podía reutilizar la ruta
--      del adjunto de otro (visible por RLS) y, al borrar SU mensaje, eliminar
--      el fichero ajeno. Al borrar un mensaje la ruta queda a null (trigger
--      fn_mensajes_edicion), así que no choca con el índice.
--   2. El nombre mostrado del adjunto debe terminar en una extensión admitida
--      (pdf, jpg, jpeg, png, webp, gif, xls, xlsx, doc, docx; sin distinguir
--      mayúsculas): un insert directo por PostgREST ya no puede ofrecer "x.exe".
--      Se añade NOT VALID y luego VALIDATE (no bloquea escrituras mientras valida).
--
-- Idempotente y ejecutable en una sola transacción.
-- ============================================================================

create unique index if not exists uq_mensajes_adjunto_path
  on public.mensajes (adjunto_path)
  where adjunto_path is not null;

alter table public.mensajes drop constraint if exists mensajes_adjunto_extension;
alter table public.mensajes add constraint mensajes_adjunto_extension check (
  adjunto_nombre is null
  or adjunto_nombre ~* '\.(pdf|jpg|jpeg|png|webp|gif|xls|xlsx|doc|docx)$'
) not valid;
alter table public.mensajes validate constraint mensajes_adjunto_extension;
