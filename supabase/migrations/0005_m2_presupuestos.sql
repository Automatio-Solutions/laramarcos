-- ============================================================================
-- Migración 0005 — Módulo 2 (Presupuestación con IA) · US-02
-- Tabla presupuestos con líneas editables, token de aceptación digital y RLS.
-- ============================================================================

do $$ begin
  create type estado_presupuesto as enum ('borrador','enviado','abierto','aceptado','rechazado');
exception when duplicate_object then null; end $$;

create table if not exists public.presupuestos (
  id              uuid primary key default uuid_generate_v4(),
  cliente_id      uuid references public.clientes (id) on delete set null,
  servicio_id     uuid references public.servicios (id) on delete set null,
  estado          estado_presupuesto not null default 'borrador',
  lineas          jsonb not null default '[]'::jsonb,  -- [{concepto,cantidad,precio,descuento}]
  descuento_global numeric(5,2) not null default 0,    -- % sobre el subtotal
  total           numeric(12,2) not null default 0,
  condiciones     text,
  validez_dias    int not null default 30,
  creado_por      uuid references public.usuarios (id) on delete set null,
  token           uuid not null default uuid_generate_v4() unique,  -- enlace de aceptación digital
  resend_msg_id   text,
  enviado_at      timestamptz,
  abierto_at      timestamptz,
  aceptado_at     timestamptz,
  aceptado_ip     text,
  rechazado_at    timestamptz,
  tarea_id        uuid references public.tareas (id) on delete set null,  -- tarea creada al aceptar
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index if not exists idx_presupuestos_cliente on public.presupuestos (cliente_id);
create index if not exists idx_presupuestos_estado on public.presupuestos (estado);
create index if not exists idx_presupuestos_token on public.presupuestos (token);

-- updated_at + auditoría
drop trigger if exists trg_updated_at on public.presupuestos;
create trigger trg_updated_at before update on public.presupuestos
  for each row execute function public.set_updated_at();
drop trigger if exists trg_auditoria on public.presupuestos;
create trigger trg_auditoria after insert or update or delete on public.presupuestos
  for each row execute function public.fn_auditoria();

-- RLS
alter table public.presupuestos enable row level security;

create policy presupuestos_staff_all on public.presupuestos
  for all using (public.is_staff()) with check (public.is_staff());
create policy presupuestos_select on public.presupuestos
  for select using (
    creado_por = auth.uid()
    or exists (select 1 from public.clientes c where c.id = presupuestos.cliente_id and c.asesor_id = auth.uid())
  );
create policy presupuestos_insert on public.presupuestos
  for insert with check (creado_por = auth.uid() or public.is_staff());
create policy presupuestos_update on public.presupuestos
  for update using (
    creado_por = auth.uid()
    or exists (select 1 from public.clientes c where c.id = presupuestos.cliente_id and c.asesor_id = auth.uid())
  ) with check (true);

grant select, insert, update, delete on public.presupuestos to authenticated;

-- ============================================================================
-- Fin migración 0005
-- ============================================================================
