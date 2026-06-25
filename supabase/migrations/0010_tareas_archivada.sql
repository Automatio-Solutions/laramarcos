-- ============================================================================
-- Migración 0010 — Archivado de tareas.
-- Las tareas archivadas desaparecen del tablero y van al apartado Archivo (staff).
-- ============================================================================

alter table public.tareas add column if not exists archivada boolean not null default false;
create index if not exists idx_tareas_archivada on public.tareas (archivada);

-- ============================================================================
-- Fin migración 0010
-- ============================================================================
