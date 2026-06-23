-- ============================================================================
-- Migración 0001 — Núcleo de datos (M5 / US-05 / UC-501)
-- LaraMarcos Asesores · PostgreSQL (Supabase)
-- Tablas: usuarios, sectores, clientes, cliente_sectores, servicios,
--         plantillas_subtareas, proveedores, auditoria
-- RLS por rol (responsable / asesor / admin) + trigger de auditoría.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 0. Extensiones y tipos
-- ---------------------------------------------------------------------------
create extension if not exists "uuid-ossp";

do $$ begin
  create type rol_usuario as enum ('responsable', 'asesor', 'admin');
exception when duplicate_object then null; end $$;

-- ---------------------------------------------------------------------------
-- 1. usuarios  (identidad de aplicación, 1:1 con auth.users)
-- ---------------------------------------------------------------------------
create table if not exists public.usuarios (
  id          uuid primary key references auth.users (id) on delete cascade,
  email       text not null unique,
  nombre      text not null,
  rol         rol_usuario not null default 'asesor',
  activo      boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- Helpers de rol (SECURITY DEFINER para poder leer usuarios sin recursión RLS)
create or replace function public.current_rol()
returns rol_usuario
language sql stable security definer set search_path = public as $$
  select rol from public.usuarios where id = auth.uid();
$$;

create or replace function public.is_responsable()
returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select rol = 'responsable' from public.usuarios where id = auth.uid()), false);
$$;

create or replace function public.is_staff()  -- responsable o admin: gestión global
returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select rol in ('responsable','admin') from public.usuarios where id = auth.uid()), false);
$$;

-- ---------------------------------------------------------------------------
-- 2. sectores
-- ---------------------------------------------------------------------------
create table if not exists public.sectores (
  id          uuid primary key default uuid_generate_v4(),
  nombre      text not null unique,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- 3. clientes
-- ---------------------------------------------------------------------------
create table if not exists public.clientes (
  id                uuid primary key default uuid_generate_v4(),
  cif               text not null unique,
  razon_social      text not null,
  direccion         text,
  email             text,
  telefono          text,
  iban              text,
  condiciones_pago  text,
  tarifas           jsonb not null default '{}'::jsonb,
  asesor_id         uuid references public.usuarios (id) on delete set null,
  activo            boolean not null default true,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
create index if not exists idx_clientes_asesor on public.clientes (asesor_id);
create index if not exists idx_clientes_cif on public.clientes (cif);

-- ---------------------------------------------------------------------------
-- 4. cliente_sectores  (N:M)
-- ---------------------------------------------------------------------------
create table if not exists public.cliente_sectores (
  cliente_id  uuid not null references public.clientes (id) on delete cascade,
  sector_id   uuid not null references public.sectores (id) on delete cascade,
  primary key (cliente_id, sector_id)
);
create index if not exists idx_cliente_sectores_sector on public.cliente_sectores (sector_id);

-- ---------------------------------------------------------------------------
-- 5. servicios
-- ---------------------------------------------------------------------------
create table if not exists public.servicios (
  id                  uuid primary key default uuid_generate_v4(),
  nombre              text not null,
  categoria           text,
  precio_base         numeric(12,2) not null default 0,
  condiciones_default text,
  activo              boolean not null default true,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- 6. plantillas_subtareas  (1:1 con servicio; pasos como jsonb ordenado)
--    pasos = [{ "orden": 1, "nombre": "Notaría", "plazo_relativo_dias": 3 }, ...]
-- ---------------------------------------------------------------------------
create table if not exists public.plantillas_subtareas (
  id          uuid primary key default uuid_generate_v4(),
  servicio_id uuid not null unique references public.servicios (id) on delete cascade,
  pasos       jsonb not null default '[]'::jsonb,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- 7. proveedores  (memoria contable para el OCR de M4)
-- ---------------------------------------------------------------------------
create table if not exists public.proveedores (
  id                  uuid primary key default uuid_generate_v4(),
  cif                 text not null unique,
  nombre              text not null,
  subcuenta_habitual  text,
  iva_default         numeric(5,2),
  formato_aprendido   jsonb not null default '{}'::jsonb,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);
create index if not exists idx_proveedores_cif on public.proveedores (cif);

-- ---------------------------------------------------------------------------
-- 8. auditoria  (append-only, poblada por trigger)
-- ---------------------------------------------------------------------------
create table if not exists public.auditoria (
  id           bigint generated always as identity primary key,
  usuario_id   uuid,
  tabla        text not null,
  registro_id  text,
  operacion    text not null check (operacion in ('INSERT','UPDATE','DELETE')),
  diff         jsonb,
  ts           timestamptz not null default now()
);
create index if not exists idx_auditoria_tabla on public.auditoria (tabla);
create index if not exists idx_auditoria_ts on public.auditoria (ts);
create index if not exists idx_auditoria_usuario on public.auditoria (usuario_id);

-- ---------------------------------------------------------------------------
-- 9. updated_at automático
-- ---------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at := now(); return new; end $$;

do $$
declare t text;
begin
  foreach t in array array['usuarios','sectores','clientes','servicios','plantillas_subtareas','proveedores']
  loop
    execute format(
      'drop trigger if exists trg_updated_at on public.%I;
       create trigger trg_updated_at before update on public.%I
       for each row execute function public.set_updated_at();', t, t);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- 10. Trigger de auditoría genérico (registra todas las mutaciones con diff)
-- ---------------------------------------------------------------------------
create or replace function public.fn_auditoria()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_reg text;
  v_diff jsonb;
begin
  if tg_op = 'DELETE' then
    v_reg := coalesce((to_jsonb(old)->>'id'), null);
    v_diff := jsonb_build_object('old', to_jsonb(old));
  elsif tg_op = 'INSERT' then
    v_reg := coalesce((to_jsonb(new)->>'id'), null);
    v_diff := jsonb_build_object('new', to_jsonb(new));
  else -- UPDATE
    v_reg := coalesce((to_jsonb(new)->>'id'), null);
    v_diff := jsonb_build_object('old', to_jsonb(old), 'new', to_jsonb(new));
  end if;

  insert into public.auditoria (usuario_id, tabla, registro_id, operacion, diff)
  values (auth.uid(), tg_table_name, v_reg, tg_op, v_diff);

  if tg_op = 'DELETE' then return old; else return new; end if;
end $$;

do $$
declare t text;
begin
  foreach t in array array['usuarios','sectores','clientes','cliente_sectores','servicios','plantillas_subtareas','proveedores']
  loop
    execute format(
      'drop trigger if exists trg_auditoria on public.%I;
       create trigger trg_auditoria after insert or update or delete on public.%I
       for each row execute function public.fn_auditoria();', t, t);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- 11. Row Level Security
-- ---------------------------------------------------------------------------
alter table public.usuarios              enable row level security;
alter table public.sectores              enable row level security;
alter table public.clientes              enable row level security;
alter table public.cliente_sectores      enable row level security;
alter table public.servicios             enable row level security;
alter table public.plantillas_subtareas  enable row level security;
alter table public.proveedores           enable row level security;
alter table public.auditoria             enable row level security;

-- usuarios: cada uno se ve a sí mismo; staff ve y gestiona todos
create policy usuarios_self_select on public.usuarios
  for select using (id = auth.uid() or public.is_staff());
create policy usuarios_staff_write on public.usuarios
  for all using (public.is_staff()) with check (public.is_staff());

-- clientes: responsable/admin todo; asesor solo los suyos
create policy clientes_staff_all on public.clientes
  for all using (public.is_staff()) with check (public.is_staff());
create policy clientes_asesor_select on public.clientes
  for select using (asesor_id = auth.uid());
create policy clientes_asesor_update on public.clientes
  for update using (asesor_id = auth.uid()) with check (asesor_id = auth.uid());
create policy clientes_asesor_insert on public.clientes
  for insert with check (asesor_id = auth.uid());
create policy clientes_asesor_delete on public.clientes
  for delete using (asesor_id = auth.uid());

-- cliente_sectores: se hereda del acceso al cliente
create policy cliente_sectores_access on public.cliente_sectores
  for all using (
    public.is_staff() or exists (
      select 1 from public.clientes c
      where c.id = cliente_sectores.cliente_id and c.asesor_id = auth.uid())
  ) with check (
    public.is_staff() or exists (
      select 1 from public.clientes c
      where c.id = cliente_sectores.cliente_id and c.asesor_id = auth.uid())
  );

-- catálogos globales (sectores, servicios, plantillas, proveedores):
-- lectura para cualquier autenticado; escritura solo staff
create policy sectores_read   on public.sectores   for select using (auth.uid() is not null);
create policy sectores_write  on public.sectores   for all using (public.is_staff()) with check (public.is_staff());
create policy servicios_read  on public.servicios  for select using (auth.uid() is not null);
create policy servicios_write on public.servicios  for all using (public.is_staff()) with check (public.is_staff());
create policy plantillas_read  on public.plantillas_subtareas for select using (auth.uid() is not null);
create policy plantillas_write on public.plantillas_subtareas for all using (public.is_staff()) with check (public.is_staff());
create policy proveedores_read  on public.proveedores for select using (auth.uid() is not null);
create policy proveedores_write on public.proveedores for all using (public.is_staff()) with check (public.is_staff());

-- auditoria: solo staff puede leer; nadie escribe directamente (lo hace el trigger SECURITY DEFINER)
create policy auditoria_staff_read on public.auditoria for select using (public.is_staff());

-- ---------------------------------------------------------------------------
-- 12. Grants de tabla para el rol `authenticated` (RLS filtra las filas)
-- ---------------------------------------------------------------------------
grant usage on schema public to authenticated;
grant select, insert, update, delete on
  public.usuarios, public.sectores, public.clientes, public.cliente_sectores,
  public.servicios, public.plantillas_subtareas, public.proveedores
  to authenticated;
grant select on public.auditoria to authenticated;  -- INSERT lo hace el trigger SECURITY DEFINER

-- ============================================================================
-- Fin migración 0001
-- ============================================================================
