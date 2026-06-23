-- ============================================================================
-- Migración 0004 — Notificaciones in-app (canal de avisos: @menciones, alertas,
-- desbloqueos, escalados). Email vía Resend se añadirá como canal adicional.
-- ============================================================================

create table if not exists public.notificaciones (
  id          uuid primary key default uuid_generate_v4(),
  usuario_id  uuid not null references public.usuarios (id) on delete cascade,
  tipo        text not null,        -- mencion | alerta_7d | alerta_48h | escalado | desbloqueo
  mensaje     text not null,
  enlace      text,
  leida       boolean not null default false,
  created_at  timestamptz not null default now()
);
create index if not exists idx_notif_usuario on public.notificaciones (usuario_id, leida);
create index if not exists idx_notif_dedupe on public.notificaciones (usuario_id, tipo, enlace);

alter table public.notificaciones enable row level security;

-- Cada usuario ve y gestiona SOLO sus notificaciones; staff puede ver todas.
create policy notif_select on public.notificaciones
  for select using (usuario_id = auth.uid() or public.is_staff());
create policy notif_update on public.notificaciones
  for update using (usuario_id = auth.uid()) with check (usuario_id = auth.uid());

grant select, update on public.notificaciones to authenticated;

-- Crear notificación para CUALQUIER usuario (la inserta el actor para un tercero):
-- SECURITY DEFINER + dedupe del mismo aviso (usuario+tipo+enlace) en el mismo día.
create or replace function public.crear_notificacion(
  p_usuario uuid, p_tipo text, p_mensaje text, p_enlace text
) returns void
language plpgsql security definer set search_path = public as $$
begin
  if p_usuario is null then return; end if;
  if exists (
    select 1 from public.notificaciones
    where usuario_id = p_usuario and tipo = p_tipo
      and enlace is not distinct from p_enlace
      and created_at::date = now()::date
  ) then
    return; -- ya avisado hoy
  end if;
  insert into public.notificaciones (usuario_id, tipo, mensaje, enlace)
  values (p_usuario, p_tipo, p_mensaje, p_enlace);
end $$;

grant execute on function public.crear_notificacion(uuid, text, text, text) to authenticated;

-- ============================================================================
-- Fin migración 0004
-- ============================================================================
