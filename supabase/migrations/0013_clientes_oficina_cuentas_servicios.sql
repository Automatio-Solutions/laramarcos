-- ============================================================================
-- Migración 0013 — Mejoras de la ficha de cliente pedidas por el despacho:
--   1. Oficina del cliente (visibilidad por sede para los asesores).
--   2. Varias cuentas bancarias por cliente, cada una con su nombre.
--   3. Servicios contratados con fecha de inicio y evolución de la cuota.
--   4. Enlace a la carpeta del cliente en el servidor.
--   5. Fecha de finalización (baja del servicio).
--   6. Se retira "condiciones de pago" (siempre son las mismas).
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Nuevas columnas de clientes
-- ---------------------------------------------------------------------------
alter table public.clientes add column if not exists oficina      oficina;
alter table public.clientes add column if not exists carpeta_url  text;
alter table public.clientes add column if not exists fecha_baja   date;

create index if not exists idx_clientes_oficina on public.clientes (oficina);

-- ---------------------------------------------------------------------------
-- 2. Cuentas bancarias (un cliente puede tener varias)
-- ---------------------------------------------------------------------------
create table if not exists public.cliente_cuentas (
  id          uuid primary key default uuid_generate_v4(),
  cliente_id  uuid not null references public.clientes (id) on delete cascade,
  iban        text not null,
  descripcion text,                       -- nombre corto para reconocerla
  created_at  timestamptz not null default now()
);
create index if not exists idx_cliente_cuentas_cliente on public.cliente_cuentas (cliente_id);

-- Migrar el IBAN existente a la nueva tabla antes de eliminar la columna.
insert into public.cliente_cuentas (cliente_id, iban, descripcion)
select c.id, c.iban, 'Cuenta principal'
  from public.clientes c
 where c.iban is not null
   and btrim(c.iban) <> ''
   and not exists (select 1 from public.cliente_cuentas cc where cc.cliente_id = c.id);

alter table public.clientes drop column if exists iban;
alter table public.clientes drop column if exists condiciones_pago;

-- ---------------------------------------------------------------------------
-- 3. Servicios contratados + evolución de la cuota
-- ---------------------------------------------------------------------------
create table if not exists public.cliente_servicios (
  id            uuid primary key default uuid_generate_v4(),
  cliente_id    uuid not null references public.clientes (id)  on delete cascade,
  servicio_id   uuid not null references public.servicios (id) on delete restrict,
  fecha_inicio  date not null default current_date,
  fecha_fin     date,                     -- null = sigue contratado
  created_at    timestamptz not null default now()
);
create index if not exists idx_cliente_servicios_cliente  on public.cliente_servicios (cliente_id);
create index if not exists idx_cliente_servicios_servicio on public.cliente_servicios (servicio_id);

-- Cada cambio de precio deja registro con su fecha de efecto → evolución.
create table if not exists public.cliente_servicio_cuotas (
  id                   uuid primary key default uuid_generate_v4(),
  cliente_servicio_id  uuid not null references public.cliente_servicios (id) on delete cascade,
  importe              numeric(12,2) not null,
  fecha_efecto         date not null default current_date,
  nota                 text,
  created_at           timestamptz not null default now()
);
create index if not exists idx_cuotas_cliente_servicio
  on public.cliente_servicio_cuotas (cliente_servicio_id, fecha_efecto desc);

-- ---------------------------------------------------------------------------
-- 4. Helpers de visibilidad (SECURITY DEFINER → evitan recursión de RLS)
-- ---------------------------------------------------------------------------
create or replace function public.mi_oficina()
returns oficina
language sql stable security definer set search_path = public as $$
  select oficina from public.usuarios where id = auth.uid();
$$;

-- Staff (responsable/admin) ve toda la cartera; el asesor, la de su sede.
create or replace function public.puede_ver_cliente(p_cliente uuid)
returns boolean
language sql stable security definer set search_path = public as $$
  select public.is_staff() or exists (
    select 1
      from public.clientes c
     where c.id = p_cliente
       and public.mi_oficina() is not null
       and c.oficina = public.mi_oficina()
  );
$$;

create or replace function public.puede_ver_cliente_servicio(p_cs uuid)
returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1
      from public.cliente_servicios cs
     where cs.id = p_cs
       and public.puede_ver_cliente(cs.cliente_id)
  );
$$;

-- ---------------------------------------------------------------------------
-- 5. RLS — clientes por oficina (sustituye a las políticas por asesor_id)
-- ---------------------------------------------------------------------------
drop policy if exists clientes_asesor_select on public.clientes;
drop policy if exists clientes_asesor_update on public.clientes;
drop policy if exists clientes_asesor_insert on public.clientes;
drop policy if exists clientes_asesor_delete on public.clientes;

-- El asesor ve Y edita todos los clientes de su oficina.
drop policy if exists clientes_asesor_oficina on public.clientes;
create policy clientes_asesor_oficina on public.clientes
  for all
  using       (public.mi_oficina() is not null and oficina = public.mi_oficina())
  with check  (public.mi_oficina() is not null and oficina = public.mi_oficina());

-- cliente_sectores: se hereda del acceso al cliente (ahora por oficina)
drop policy if exists cliente_sectores_access on public.cliente_sectores;
create policy cliente_sectores_access on public.cliente_sectores
  for all
  using      (public.puede_ver_cliente(cliente_id))
  with check (public.puede_ver_cliente(cliente_id));

-- ---------------------------------------------------------------------------
-- 6. RLS — tablas nuevas (heredan el acceso al cliente)
-- ---------------------------------------------------------------------------
alter table public.cliente_cuentas          enable row level security;
alter table public.cliente_servicios        enable row level security;
alter table public.cliente_servicio_cuotas  enable row level security;

drop policy if exists cliente_cuentas_access on public.cliente_cuentas;
create policy cliente_cuentas_access on public.cliente_cuentas
  for all
  using      (public.puede_ver_cliente(cliente_id))
  with check (public.puede_ver_cliente(cliente_id));

drop policy if exists cliente_servicios_access on public.cliente_servicios;
create policy cliente_servicios_access on public.cliente_servicios
  for all
  using      (public.puede_ver_cliente(cliente_id))
  with check (public.puede_ver_cliente(cliente_id));

drop policy if exists cliente_servicio_cuotas_access on public.cliente_servicio_cuotas;
create policy cliente_servicio_cuotas_access on public.cliente_servicio_cuotas
  for all
  using      (public.puede_ver_cliente_servicio(cliente_servicio_id))
  with check (public.puede_ver_cliente_servicio(cliente_servicio_id));

-- ============================================================================
-- Fin migración 0013
-- ============================================================================
