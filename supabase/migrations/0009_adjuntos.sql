-- ============================================================================
-- Migración 0009 — Adjuntos de tareas (UC-106).
-- Ficheros (PDF/Excel/escáneres/contratos) vinculados a una tarea.
-- En dev: Supabase Storage (bucket privado). En prod puede sincronizarse con
-- Google Drive si el cliente aporta credenciales OAuth.
-- ============================================================================

create table if not exists public.adjuntos (
  id          uuid primary key default uuid_generate_v4(),
  tarea_id    uuid not null references public.tareas (id) on delete cascade,
  nombre      text not null,
  path        text not null,
  mime        text,
  size        int,
  subido_por  uuid references public.usuarios (id) on delete set null,
  created_at  timestamptz not null default now()
);
create index if not exists idx_adjuntos_tarea on public.adjuntos (tarea_id);

drop trigger if exists trg_auditoria on public.adjuntos;
create trigger trg_auditoria after insert or update or delete on public.adjuntos
  for each row execute function public.fn_auditoria();

alter table public.adjuntos enable row level security;

-- Visible/gestionable si eres staff, el que lo subió, o tienes acceso a la tarea
create policy adjuntos_select on public.adjuntos
  for select using (
    public.is_staff()
    or subido_por = auth.uid()
    or public.fn_es_responsable_tarea(tarea_id)
    or public.fn_asignado_en_tarea(tarea_id)
  );
create policy adjuntos_insert on public.adjuntos
  for insert with check (
    public.is_staff()
    or public.fn_es_responsable_tarea(tarea_id)
    or public.fn_asignado_en_tarea(tarea_id)
  );
create policy adjuntos_delete on public.adjuntos
  for delete using (public.is_staff() or subido_por = auth.uid() or public.fn_es_responsable_tarea(tarea_id));

grant select, insert, delete on public.adjuntos to authenticated;

insert into storage.buckets (id, name, public)
  values ('adjuntos', 'adjuntos', false)
  on conflict (id) do nothing;

-- ============================================================================
-- Fin migración 0009
-- ============================================================================
