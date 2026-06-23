-- ============================================================================
-- Migración 0007 — Módulo 3 (Vigilancia normativa DOE/BOE) · US-03
-- publicaciones (clasificadas por sector), newsletters y log de ingesta.
-- ============================================================================

create table if not exists public.publicaciones (
  id          uuid primary key default uuid_generate_v4(),
  boletin     text not null,                 -- DOE | BOE
  fecha       date not null,
  titulo      text not null,
  resumen     text,
  enlace      text,
  sector_id   uuid references public.sectores (id) on delete set null,
  urgente     boolean not null default false,
  created_at  timestamptz not null default now(),
  unique (boletin, enlace)
);
create index if not exists idx_publicaciones_fecha on public.publicaciones (fecha);
create index if not exists idx_publicaciones_sector on public.publicaciones (sector_id);

create table if not exists public.newsletters (
  id            uuid primary key default uuid_generate_v4(),
  sector_id     uuid references public.sectores (id) on delete set null,
  fecha         date not null,
  asunto        text not null,
  contenido     text not null,
  destinatarios int not null default 0,
  enviada       boolean not null default false,
  resend_msg_id text,
  aperturas     int not null default 0,
  clics         int not null default 0,
  created_at    timestamptz not null default now()
);
create index if not exists idx_newsletters_fecha on public.newsletters (fecha);

-- Log de ingesta (UC-301 AC-02: registrar éxito/fallo de la descarga)
create table if not exists public.ingesta_log (
  id         bigint generated always as identity primary key,
  fecha      date not null,
  boletin    text not null,
  estado     text not null,   -- ok | error
  mensaje    text,
  items      int not null default 0,
  created_at timestamptz not null default now()
);

alter table public.publicaciones enable row level security;
alter table public.newsletters   enable row level security;
alter table public.ingesta_log   enable row level security;

-- Lectura para cualquier autenticado; escritura solo staff (el cron usa service role)
create policy publicaciones_read on public.publicaciones for select using (auth.uid() is not null);
create policy publicaciones_write on public.publicaciones for all using (public.is_staff()) with check (public.is_staff());
create policy newsletters_read on public.newsletters for select using (auth.uid() is not null);
create policy newsletters_write on public.newsletters for all using (public.is_staff()) with check (public.is_staff());
create policy ingesta_read on public.ingesta_log for select using (public.is_staff());

grant select on public.publicaciones, public.newsletters, public.ingesta_log to authenticated;
grant insert, update, delete on public.publicaciones, public.newsletters to authenticated;

-- ============================================================================
-- Fin migración 0007
-- ============================================================================
