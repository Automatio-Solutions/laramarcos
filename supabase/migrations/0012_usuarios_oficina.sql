-- ============================================================================
-- Migración 0012 — Oficina (sede) del trabajador.
-- LaraMarcos opera en tres sedes; cada usuario de la app se asigna a una.
-- ============================================================================

do $$
begin
  if not exists (select 1 from pg_type where typname = 'oficina') then
    create type oficina as enum ('Badajoz', 'Castuera', 'Don Benito');
  end if;
end$$;

alter table public.usuarios add column if not exists oficina oficina;

-- ============================================================================
-- Fin migración 0012
-- ============================================================================
