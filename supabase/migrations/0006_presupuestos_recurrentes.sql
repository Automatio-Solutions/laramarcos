-- ============================================================================
-- Migración 0006 — Presupuestos recurrentes (UC-208 AC-17).
-- Configuración: para un cliente + servicio, genera un presupuesto cada N días.
-- ============================================================================

create table if not exists public.presupuestos_recurrentes (
  id           uuid primary key default uuid_generate_v4(),
  cliente_id   uuid references public.clientes (id) on delete cascade,
  servicio_id  uuid not null references public.servicios (id) on delete cascade,
  periodo_dias int not null default 90,
  proximo      date not null default current_date,
  activo       boolean not null default true,
  creado_por   uuid references public.usuarios (id) on delete set null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index if not exists idx_presup_rec_proximo on public.presupuestos_recurrentes (proximo) where activo;

drop trigger if exists trg_updated_at on public.presupuestos_recurrentes;
create trigger trg_updated_at before update on public.presupuestos_recurrentes
  for each row execute function public.set_updated_at();
drop trigger if exists trg_auditoria on public.presupuestos_recurrentes;
create trigger trg_auditoria after insert or update or delete on public.presupuestos_recurrentes
  for each row execute function public.fn_auditoria();

alter table public.presupuestos_recurrentes enable row level security;
create policy presup_rec_staff_all on public.presupuestos_recurrentes
  for all using (public.is_staff()) with check (public.is_staff());
create policy presup_rec_select on public.presupuestos_recurrentes
  for select using (
    creado_por = auth.uid()
    or exists (select 1 from public.clientes c where c.id = presupuestos_recurrentes.cliente_id and c.asesor_id = auth.uid())
  );
create policy presup_rec_write on public.presupuestos_recurrentes
  for all using (creado_por = auth.uid()) with check (creado_por = auth.uid());

grant select, insert, update, delete on public.presupuestos_recurrentes to authenticated;

-- ============================================================================
-- Fin migración 0006
-- ============================================================================
