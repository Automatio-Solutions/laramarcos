-- ============================================================================
-- Migración 0002 — Módulo 1 (Gestión de tareas) · US-01
-- Tablas: tareas, subtareas, dependencias_tarea, comentarios, tiempos,
--         lineas_factura, plantillas_tareas. RLS + auditoría + updated_at.
-- ============================================================================

do $$ begin
  create type estado_tarea as enum ('pendiente','en_curso','bloqueada','completada');
exception when duplicate_object then null; end $$;

-- ---------------------------------------------------------------------------
-- tareas
-- ---------------------------------------------------------------------------
create table if not exists public.tareas (
  id              uuid primary key default uuid_generate_v4(),
  cliente_id      uuid references public.clientes (id) on delete set null,
  titulo          text not null,
  descripcion     text,
  categoria       text,
  estado          estado_tarea not null default 'pendiente',
  vencimiento     date,
  bloqueada       boolean not null default false,
  motivo_bloqueo  text,
  responsable_id  uuid references public.usuarios (id) on delete set null,
  servicio_id     uuid references public.servicios (id) on delete set null,
  origen          text not null default 'manual',  -- manual | presupuesto | doe_boe
  completada_at   timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index if not exists idx_tareas_responsable on public.tareas (responsable_id);
create index if not exists idx_tareas_cliente on public.tareas (cliente_id);
create index if not exists idx_tareas_estado on public.tareas (estado);
create index if not exists idx_tareas_vencimiento on public.tareas (vencimiento);

-- ---------------------------------------------------------------------------
-- subtareas
-- ---------------------------------------------------------------------------
create table if not exists public.subtareas (
  id            uuid primary key default uuid_generate_v4(),
  tarea_id      uuid not null references public.tareas (id) on delete cascade,
  titulo        text not null,
  asignado_id   uuid references public.usuarios (id) on delete set null,
  plazo         date,
  estado        estado_tarea not null default 'pendiente',
  depende_de    uuid references public.subtareas (id) on delete set null,
  orden         int not null default 0,
  completada_at timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index if not exists idx_subtareas_tarea on public.subtareas (tarea_id);
create index if not exists idx_subtareas_asignado on public.subtareas (asignado_id);

-- ---------------------------------------------------------------------------
-- dependencias entre tareas (N:M)
-- ---------------------------------------------------------------------------
create table if not exists public.dependencias_tarea (
  tarea_id      uuid not null references public.tareas (id) on delete cascade,
  depende_de_id uuid not null references public.tareas (id) on delete cascade,
  primary key (tarea_id, depende_de_id),
  check (tarea_id <> depende_de_id)
);

-- ---------------------------------------------------------------------------
-- comentarios (con @menciones)
-- ---------------------------------------------------------------------------
create table if not exists public.comentarios (
  id          uuid primary key default uuid_generate_v4(),
  tarea_id    uuid references public.tareas (id) on delete cascade,
  subtarea_id uuid references public.subtareas (id) on delete cascade,
  autor_id    uuid not null references public.usuarios (id) on delete cascade,
  texto       text not null,
  menciones   uuid[] not null default '{}',
  created_at  timestamptz not null default now(),
  check (tarea_id is not null or subtarea_id is not null)
);
create index if not exists idx_comentarios_tarea on public.comentarios (tarea_id);
create index if not exists idx_comentarios_subtarea on public.comentarios (subtarea_id);

-- ---------------------------------------------------------------------------
-- control de tiempo
-- ---------------------------------------------------------------------------
create table if not exists public.tiempos (
  id          uuid primary key default uuid_generate_v4(),
  tarea_id    uuid references public.tareas (id) on delete cascade,
  subtarea_id uuid references public.subtareas (id) on delete cascade,
  usuario_id  uuid not null references public.usuarios (id) on delete cascade,
  segundos    int not null check (segundos >= 0),
  nota        text,
  ts          timestamptz not null default now()
);
create index if not exists idx_tiempos_tarea on public.tiempos (tarea_id);

-- ---------------------------------------------------------------------------
-- líneas de factura (vinculación a facturación)
-- ---------------------------------------------------------------------------
create table if not exists public.lineas_factura (
  id         uuid primary key default uuid_generate_v4(),
  tarea_id   uuid references public.tareas (id) on delete set null,
  cliente_id uuid references public.clientes (id) on delete set null,
  concepto   text not null,
  importe    numeric(12,2) not null default 0,
  facturada  boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists idx_lineas_factura_cliente on public.lineas_factura (cliente_id);
create index if not exists idx_lineas_factura_facturada on public.lineas_factura (facturada);

-- ---------------------------------------------------------------------------
-- plantillas de tareas recurrentes
-- ---------------------------------------------------------------------------
create table if not exists public.plantillas_tareas (
  id         uuid primary key default uuid_generate_v4(),
  nombre     text not null,
  categoria  text,
  subtareas  jsonb not null default '[]'::jsonb,  -- [{orden,nombre,plazo_relativo_dias}]
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- updated_at + auditoría en las nuevas tablas
-- ---------------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['tareas','subtareas','plantillas_tareas']
  loop
    execute format('drop trigger if exists trg_updated_at on public.%I;
      create trigger trg_updated_at before update on public.%I
      for each row execute function public.set_updated_at();', t, t);
  end loop;

  foreach t in array array['tareas','subtareas','dependencias_tarea','comentarios','tiempos','lineas_factura','plantillas_tareas']
  loop
    execute format('drop trigger if exists trg_auditoria on public.%I;
      create trigger trg_auditoria after insert or update or delete on public.%I
      for each row execute function public.fn_auditoria();', t, t);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
alter table public.tareas             enable row level security;
alter table public.subtareas          enable row level security;
alter table public.dependencias_tarea enable row level security;
alter table public.comentarios        enable row level security;
alter table public.tiempos            enable row level security;
alter table public.lineas_factura     enable row level security;
alter table public.plantillas_tareas  enable row level security;

-- tareas: staff todo; el resto ve las suyas (responsable, asesor del cliente, o con subtarea asignada)
create policy tareas_staff_all on public.tareas
  for all using (public.is_staff()) with check (public.is_staff());
create policy tareas_visibles_select on public.tareas
  for select using (
    responsable_id = auth.uid()
    or exists (select 1 from public.clientes c where c.id = tareas.cliente_id and c.asesor_id = auth.uid())
    or exists (select 1 from public.subtareas s where s.tarea_id = tareas.id and s.asignado_id = auth.uid())
  );
create policy tareas_responsable_write on public.tareas
  for update using (responsable_id = auth.uid()) with check (responsable_id = auth.uid());
create policy tareas_insert on public.tareas
  for insert with check (responsable_id = auth.uid() or public.is_staff());

-- subtareas: staff todo; responsable de la tarea gestiona; asignado actualiza la suya
create policy subtareas_staff_all on public.subtareas
  for all using (public.is_staff()) with check (public.is_staff());
create policy subtareas_select on public.subtareas
  for select using (
    asignado_id = auth.uid()
    or exists (select 1 from public.tareas t where t.id = subtareas.tarea_id and t.responsable_id = auth.uid())
  );
create policy subtareas_write on public.subtareas
  for update using (
    asignado_id = auth.uid()
    or exists (select 1 from public.tareas t where t.id = subtareas.tarea_id and t.responsable_id = auth.uid())
  ) with check (
    asignado_id = auth.uid()
    or exists (select 1 from public.tareas t where t.id = subtareas.tarea_id and t.responsable_id = auth.uid())
  );
create policy subtareas_insert on public.subtareas
  for insert with check (
    exists (select 1 from public.tareas t where t.id = subtareas.tarea_id and t.responsable_id = auth.uid())
  );

-- comentarios: autor inserta los suyos; lectura para staff o autor
create policy comentarios_select on public.comentarios
  for select using (public.is_staff() or autor_id = auth.uid());
create policy comentarios_insert on public.comentarios
  for insert with check (autor_id = auth.uid());

-- tiempos: cada uno los suyos; staff todo
create policy tiempos_staff_all on public.tiempos
  for all using (public.is_staff()) with check (public.is_staff());
create policy tiempos_own on public.tiempos
  for all using (usuario_id = auth.uid()) with check (usuario_id = auth.uid());

-- líneas de factura y plantillas: staff gestiona; resto lectura
create policy lineas_staff_all on public.lineas_factura
  for all using (public.is_staff()) with check (public.is_staff());
create policy lineas_read on public.lineas_factura
  for select using (auth.uid() is not null);
create policy dependencias_read on public.dependencias_tarea
  for select using (auth.uid() is not null);
create policy dependencias_staff_write on public.dependencias_tarea
  for all using (public.is_staff()) with check (public.is_staff());
create policy plantillas_t_read on public.plantillas_tareas
  for select using (auth.uid() is not null);
create policy plantillas_t_write on public.plantillas_tareas
  for all using (public.is_staff()) with check (public.is_staff());

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------
grant select, insert, update, delete on
  public.tareas, public.subtareas, public.dependencias_tarea, public.comentarios,
  public.tiempos, public.lineas_factura, public.plantillas_tareas
  to authenticated;

-- ============================================================================
-- Fin migración 0002
-- ============================================================================
