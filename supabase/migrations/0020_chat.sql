-- ============================================================================
-- Migración 0020 — Chat interno (US-06 / UC-601..UC-604)
-- LaraMarcos Asesores · PostgreSQL (Supabase)
--
-- Mensajería interna del despacho, sustituye a los grupos de WhatsApp:
--   · general  → un canal para todo el despacho.
--   · oficina  → un canal por sede (lo ve su gente + responsable/admin).
--   · directo  → conversación 1:1 entre dos compañeros (solo ellos dos).
--   · cliente  → hilo ligado a un cliente (visible con las mismas reglas que
--                la ficha del cliente: staff o misma oficina).
--
-- Tablas: conversaciones, mensajes, chat_lecturas.
-- Las conversaciones NO se crean desde el cliente: las siembra esta migración
-- (general + oficinas) o las crean funciones SECURITY DEFINER (directos).
-- Realtime: mensajes se publica en supabase_realtime (RLS filtra los eventos).
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 0. Tipos
-- ---------------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_type where typname = 'chat_tipo') then
    create type chat_tipo as enum ('general', 'oficina', 'directo', 'cliente');
  end if;
end$$;

-- ---------------------------------------------------------------------------
-- 1. conversaciones
-- ---------------------------------------------------------------------------
create table if not exists public.conversaciones (
  id                 uuid primary key default uuid_generate_v4(),
  tipo               chat_tipo not null,
  nombre             text,                 -- null en directos: la UI muestra al otro
  oficina            oficina,
  cliente_id         uuid references public.clientes (id) on delete cascade,
  usuario_a          uuid references public.usuarios (id) on delete cascade,
  usuario_b          uuid references public.usuarios (id) on delete cascade,
  ultimo_mensaje_at  timestamptz,
  created_at         timestamptz not null default now(),
  -- Pareja ordenada: un único directo por pareja, sin importar quién lo abre.
  constraint conversaciones_pareja_ordenada
    check (usuario_a is null or usuario_b is null or usuario_a < usuario_b),
  -- Cada tipo usa solo sus columnas.
  constraint conversaciones_tipo_coherente check (
       (tipo = 'general' and oficina is null     and cliente_id is null     and usuario_a is null     and usuario_b is null)
    or (tipo = 'oficina' and oficina is not null and cliente_id is null     and usuario_a is null     and usuario_b is null)
    or (tipo = 'directo' and oficina is null     and cliente_id is null     and usuario_a is not null and usuario_b is not null)
    or (tipo = 'cliente' and oficina is null     and cliente_id is not null and usuario_a is null     and usuario_b is null)
  ),
  constraint conversaciones_pareja_unica  unique (usuario_a, usuario_b),
  constraint conversaciones_cliente_unico unique (cliente_id)
);
create unique index if not exists idx_conversaciones_oficina_unica
  on public.conversaciones (oficina) where tipo = 'oficina';
create unique index if not exists idx_conversaciones_general_unica
  on public.conversaciones (tipo) where tipo = 'general';
create index if not exists idx_conversaciones_usuario_b
  on public.conversaciones (usuario_b) where tipo = 'directo';

-- ---------------------------------------------------------------------------
-- 2. mensajes  (el cliente puede aportar su propio id → UI optimista)
-- ---------------------------------------------------------------------------
create table if not exists public.mensajes (
  id               uuid primary key default uuid_generate_v4(),
  conversacion_id  uuid not null references public.conversaciones (id) on delete cascade,
  autor_id         uuid references public.usuarios (id) on delete set null,
  texto            text not null default '' check (length(texto) <= 5000),
  menciones        uuid[] not null default '{}',
  editado_at       timestamptz,
  borrado          boolean not null default false,
  created_at       timestamptz not null default now()
);
create index if not exists idx_mensajes_conversacion
  on public.mensajes (conversacion_id, created_at desc);

-- ---------------------------------------------------------------------------
-- 3. chat_lecturas  (hasta dónde ha leído cada usuario cada conversación)
-- ---------------------------------------------------------------------------
create table if not exists public.chat_lecturas (
  usuario_id       uuid not null references public.usuarios (id) on delete cascade,
  conversacion_id  uuid not null references public.conversaciones (id) on delete cascade,
  ultimo_leido_at  timestamptz not null default now(),
  primary key (usuario_id, conversacion_id)
);
create index if not exists idx_chat_lecturas_conversacion on public.chat_lecturas (conversacion_id);

-- ---------------------------------------------------------------------------
-- 4. Triggers de mensajes
-- ---------------------------------------------------------------------------
-- La hora del mensaje la pone el servidor cuando escribe un usuario de la app
-- (evita mensajes con fecha manipulada que alteren el orden o los no leídos).
create or replace function public.fn_mensajes_hora_servidor()
returns trigger language plpgsql as $$
begin
  if auth.uid() is not null then
    new.created_at := now();
  end if;
  return new;
end $$;

drop trigger if exists trg_mensajes_hora on public.mensajes;
create trigger trg_mensajes_hora before insert on public.mensajes
  for each row execute function public.fn_mensajes_hora_servidor();

-- Cada mensaje nuevo actualiza la marca de actividad de su conversación
-- (SECURITY DEFINER: el usuario no tiene UPDATE sobre conversaciones).
create or replace function public.fn_mensajes_ultimo_at()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  update public.conversaciones
     set ultimo_mensaje_at = new.created_at
   where id = new.conversacion_id
     and (ultimo_mensaje_at is null or ultimo_mensaje_at < new.created_at);
  return new;
end $$;

drop trigger if exists trg_mensajes_ultimo_at on public.mensajes;
create trigger trg_mensajes_ultimo_at after insert on public.mensajes
  for each row execute function public.fn_mensajes_ultimo_at();

drop trigger if exists trg_auditoria on public.mensajes;
create trigger trg_auditoria after insert or update or delete on public.mensajes
  for each row execute function public.fn_auditoria();

-- ---------------------------------------------------------------------------
-- 5. Funciones de acceso (SECURITY DEFINER → sin recursión de RLS)
-- ---------------------------------------------------------------------------
-- ¿El usuario autenticado (activo) puede ver esta conversación?
--   general  → cualquier usuario activo
--   oficina  → staff o gente de esa sede
--   directo  → solo los dos participantes
--   cliente  → mismas reglas que la ficha del cliente (puede_ver_cliente, 0013)
create or replace function public.chat_puede_ver(p_conv uuid)
returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1
      from public.conversaciones cv
      join public.usuarios yo on yo.id = auth.uid() and yo.activo
     where cv.id = p_conv
       and case cv.tipo
             when 'general' then true
             when 'oficina' then public.is_staff()
                                 or (yo.oficina is not null and cv.oficina = yo.oficina)
             when 'directo' then yo.id in (cv.usuario_a, cv.usuario_b)
             when 'cliente' then public.puede_ver_cliente(cv.cliente_id)
             else false
           end
  );
$$;

-- Directorio de compañeros activos. La RLS de usuarios solo deja al asesor
-- verse a sí mismo; para chatear necesita ver a todos (solo datos básicos).
create or replace function public.chat_directorio()
returns table (id uuid, nombre text, oficina oficina, rol rol_usuario)
language sql stable security definer set search_path = public as $$
  select u.id, u.nombre, u.oficina, u.rol
    from public.usuarios u
   where u.activo
     and exists (select 1 from public.usuarios yo where yo.id = auth.uid() and yo.activo)
   order by u.nombre;
$$;

-- Nombres de autores por id, INCLUIDOS usuarios dados de baja (para que los
-- mensajes antiguos sigan mostrando quién los escribió).
create or replace function public.chat_nombres(p_ids uuid[])
returns table (id uuid, nombre text)
language sql stable security definer set search_path = public as $$
  select u.id, u.nombre
    from public.usuarios u
   where u.id = any (p_ids)
     and exists (select 1 from public.usuarios yo where yo.id = auth.uid() and yo.activo);
$$;

-- Abre (o recupera) la conversación directa con otro compañero activo.
create or replace function public.chat_abrir_directo(p_otro uuid)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_yo uuid := auth.uid();
  v_a  uuid;
  v_b  uuid;
  v_id uuid;
begin
  if v_yo is null or not exists (select 1 from public.usuarios where id = v_yo and activo) then
    raise exception 'No autorizado' using errcode = '42501';
  end if;
  if p_otro is null or p_otro = v_yo then
    raise exception 'No puedes abrir una conversación contigo mismo' using errcode = '22023';
  end if;
  if not exists (select 1 from public.usuarios where id = p_otro and activo) then
    raise exception 'Ese compañero no existe o está dado de baja' using errcode = '22023';
  end if;

  v_a := least(v_yo, p_otro);
  v_b := greatest(v_yo, p_otro);

  insert into public.conversaciones (tipo, usuario_a, usuario_b)
  values ('directo', v_a, v_b)
  on conflict (usuario_a, usuario_b) do nothing
  returning id into v_id;

  if v_id is null then
    select id into v_id
      from public.conversaciones
     where usuario_a = v_a and usuario_b = v_b;
  end if;
  return v_id;
end $$;

-- Mensajes sin leer por conversación (solo las que tienen alguno).
-- Sin lectura registrada se cuenta desde el alta del usuario.
-- La visibilidad se evalúa una vez por conversación (CTE materializada),
-- no por mensaje.
create or replace function public.chat_no_leidos()
returns table (conversacion_id uuid, no_leidos int)
language sql stable security definer set search_path = public as $$
  with yo as (
    select u.id, u.created_at
      from public.usuarios u
     where u.id = auth.uid() and u.activo
  ),
  visibles as materialized (
    select cv.id
      from public.conversaciones cv
     where public.chat_puede_ver(cv.id)
  )
  select m.conversacion_id, count(*)::int as no_leidos
    from visibles v
    cross join yo
    left join public.chat_lecturas l
           on l.conversacion_id = v.id and l.usuario_id = yo.id
    join public.mensajes m
      on m.conversacion_id = v.id
     and m.created_at > coalesce(l.ultimo_leido_at, yo.created_at)
     and m.autor_id is distinct from yo.id
     and not m.borrado
   group by m.conversacion_id;
$$;

-- Marca la conversación como leída hasta ahora.
create or replace function public.chat_marcar_leida(p_conv uuid)
returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.chat_puede_ver(p_conv) then
    return;
  end if;
  insert into public.chat_lecturas (usuario_id, conversacion_id, ultimo_leido_at)
  values (auth.uid(), p_conv, now())
  on conflict (usuario_id, conversacion_id)
  do update set ultimo_leido_at = greatest(public.chat_lecturas.ultimo_leido_at, excluded.ultimo_leido_at);
end $$;

revoke execute on function public.chat_puede_ver(uuid)     from public, anon;
revoke execute on function public.chat_directorio()        from public, anon;
revoke execute on function public.chat_nombres(uuid[])     from public, anon;
revoke execute on function public.chat_abrir_directo(uuid) from public, anon;
revoke execute on function public.chat_no_leidos()         from public, anon;
revoke execute on function public.chat_marcar_leida(uuid)  from public, anon;

grant execute on function public.chat_puede_ver(uuid)     to authenticated;
grant execute on function public.chat_directorio()        to authenticated;
grant execute on function public.chat_nombres(uuid[])     to authenticated;
grant execute on function public.chat_abrir_directo(uuid) to authenticated;
grant execute on function public.chat_no_leidos()         to authenticated;
grant execute on function public.chat_marcar_leida(uuid)  to authenticated;

-- ---------------------------------------------------------------------------
-- 6. Row Level Security
-- ---------------------------------------------------------------------------
alter table public.conversaciones enable row level security;
alter table public.mensajes       enable row level security;
alter table public.chat_lecturas  enable row level security;

-- conversaciones: solo lectura; se crean por seed o chat_abrir_directo()
drop policy if exists conversaciones_select on public.conversaciones;
create policy conversaciones_select on public.conversaciones
  for select using (public.chat_puede_ver(id));

-- mensajes: leer donde se puede ver; escribir solo como uno mismo.
-- (Editar/borrar llegará en una fase posterior.)
drop policy if exists mensajes_select on public.mensajes;
create policy mensajes_select on public.mensajes
  for select using (public.chat_puede_ver(conversacion_id));

drop policy if exists mensajes_insert on public.mensajes;
create policy mensajes_insert on public.mensajes
  for insert with check (
    autor_id = auth.uid()
    and public.chat_puede_ver(conversacion_id)
    and borrado = false
    and editado_at is null
  );

-- chat_lecturas: cada uno las suyas
drop policy if exists chat_lecturas_select on public.chat_lecturas;
create policy chat_lecturas_select on public.chat_lecturas
  for select using (usuario_id = auth.uid());

drop policy if exists chat_lecturas_insert on public.chat_lecturas;
create policy chat_lecturas_insert on public.chat_lecturas
  for insert with check (usuario_id = auth.uid() and public.chat_puede_ver(conversacion_id));

drop policy if exists chat_lecturas_update on public.chat_lecturas;
create policy chat_lecturas_update on public.chat_lecturas
  for update using (usuario_id = auth.uid())
  with check (usuario_id = auth.uid() and public.chat_puede_ver(conversacion_id));

grant select                 on public.conversaciones to authenticated;
grant select, insert         on public.mensajes       to authenticated;
grant select, insert, update on public.chat_lecturas  to authenticated;

-- ---------------------------------------------------------------------------
-- 7. Seed: canal General + un canal por oficina
-- ---------------------------------------------------------------------------
insert into public.conversaciones (tipo, nombre)
select 'general', 'General'
 where not exists (select 1 from public.conversaciones where tipo = 'general');

insert into public.conversaciones (tipo, nombre, oficina)
select 'oficina', o::text, o
  from unnest(enum_range(null::oficina)) as o
 where not exists (
   select 1 from public.conversaciones c where c.tipo = 'oficina' and c.oficina = o
 );

-- ---------------------------------------------------------------------------
-- 8. Realtime: publicar mensajes (la RLS de SELECT filtra quién recibe qué)
-- ---------------------------------------------------------------------------
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (
       select 1 from pg_publication_tables
        where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'mensajes'
     ) then
    alter publication supabase_realtime add table public.mensajes;
  end if;
end$$;

-- ============================================================================
-- Fin migración 0020
-- ============================================================================
