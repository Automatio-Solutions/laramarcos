-- ============================================================================
-- Migración 0023 — Chat interno, fase 3 (UC-610..UC-613)
-- LaraMarcos Asesores · PostgreSQL (Supabase)
--
--   1. Adjuntos (UC-610)        → columnas adjunto_* en mensajes + bucket
--                                 privado 'chat' (Storage). SIN políticas en
--                                 storage.objects para authenticated: la app
--                                 sube/firma URLs en servidor con service role
--                                 tras comprobar el acceso por RLS.
--   2. Búsqueda (UC-611)        → unaccent + columna tsvector mensajes.busqueda
--                                 (trigger) + índice GIN + chat_buscar(q, lim).
--   3. Editar / borrar (UC-612) → política UPDATE + trigger fn_mensajes_edicion.
--                                 La auditoría (fn_auditoria, 0001) guarda la
--                                 fila OLD y NEW en cada UPDATE → texto anterior.
--   4. Presencia / escribiendo  → Realtime Authorization (canales privados):
--      (UC-613)                   políticas en realtime.messages para los
--                                 topics 'presencia' y 'chat:<conversación>'.
--
-- Idempotente y ejecutable en una sola transacción.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Adjuntos (UC-610)
-- ---------------------------------------------------------------------------
-- Clave del objeto en el bucket 'chat': <conversacion_id>/<uuid>/<nombre-saneado>
alter table public.mensajes add column if not exists adjunto_path   text;
alter table public.mensajes add column if not exists adjunto_nombre text;
alter table public.mensajes add column if not exists adjunto_mime   text;
alter table public.mensajes add column if not exists adjunto_size   int;

alter table public.mensajes drop constraint if exists mensajes_adjunto_completo;
alter table public.mensajes add constraint mensajes_adjunto_completo check (
     (adjunto_path is null and adjunto_nombre is null and adjunto_mime is null and adjunto_size is null)
  or (adjunto_path is not null and adjunto_nombre is not null and adjunto_mime is not null and adjunto_size is not null)
);

alter table public.mensajes drop constraint if exists mensajes_adjunto_size;
alter table public.mensajes add constraint mensajes_adjunto_size
  check (adjunto_size is null or adjunto_size between 1 and 20971520);  -- 20 MB

alter table public.mensajes drop constraint if exists mensajes_adjunto_mime;
alter table public.mensajes add constraint mensajes_adjunto_mime check (
  adjunto_mime is null or adjunto_mime in (
    'application/pdf',
    'image/jpeg', 'image/png', 'image/webp', 'image/gif',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  )
);

-- El objeto debe colgar de la carpeta de SU conversación (y sin '..').
alter table public.mensajes drop constraint if exists mensajes_adjunto_path;
alter table public.mensajes add constraint mensajes_adjunto_path check (
  adjunto_path is null or (
        starts_with(adjunto_path, conversacion_id::text || '/')
    and length(adjunto_path) <= 600
    and position('..' in adjunto_path) = 0
  )
);

alter table public.mensajes drop constraint if exists mensajes_adjunto_nombre;
alter table public.mensajes add constraint mensajes_adjunto_nombre
  check (adjunto_nombre is null or length(btrim(adjunto_nombre)) between 1 and 255);

-- Un mensaje vivo tiene texto o adjunto. Los borrados quedan con texto '' y
-- sin adjunto. (Texto vacío + adjunto = solo el fichero.)
alter table public.mensajes drop constraint if exists mensajes_con_contenido;
alter table public.mensajes add constraint mensajes_con_contenido
  check (borrado or length(btrim(texto)) > 0 or adjunto_path is not null);

-- Bucket privado 'chat' (20 MB, mismos tipos que la columna).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'chat', 'chat', false, 20971520,
  array[
    'application/pdf',
    'image/jpeg', 'image/png', 'image/webp', 'image/gif',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  ]
)
on conflict (id) do update
  set public             = false,
      file_size_limit    = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- ---------------------------------------------------------------------------
-- 2. Búsqueda (UC-611)
-- ---------------------------------------------------------------------------
create extension if not exists unaccent with schema extensions;

-- unaccent() es STABLE (depende del search_path); este envoltorio fija el
-- diccionario con su esquema y puede declararse IMMUTABLE.
create or replace function public.chat_unaccent(text)
returns text
language sql immutable parallel safe strict
set search_path = extensions, pg_catalog as $$
  select extensions.unaccent('extensions.unaccent'::regdictionary, $1);
$$;

alter table public.mensajes add column if not exists busqueda tsvector;

create or replace function public.fn_mensajes_busqueda()
returns trigger language plpgsql set search_path = public as $$
begin
  if new.borrado then
    new.busqueda := ''::tsvector;
  else
    new.busqueda := to_tsvector('spanish'::regconfig,
      public.chat_unaccent(coalesce(new.texto, '') || ' ' || coalesce(new.adjunto_nombre, '')));
  end if;
  return new;
end $$;

-- Los BEFORE triggers se disparan por orden alfabético: este debe ir el
-- ÚLTIMO (después de trg_mensajes_edicion, que vacía el texto al borrar).
drop trigger if exists trg_mensajes_zz_busqueda on public.mensajes;
create trigger trg_mensajes_zz_busqueda before insert or update on public.mensajes
  for each row execute function public.fn_mensajes_busqueda();

-- Relleno de las filas existentes (el UPDATE dispara el trigger de arriba;
-- como owner, sin auth.uid(), el de edición no pone restricciones de autor).
update public.mensajes
   set busqueda = null
 where busqueda is null;

create index if not exists idx_mensajes_busqueda on public.mensajes using gin (busqueda);

-- Busca en los mensajes (texto + nombre del adjunto) de las conversaciones que
-- el usuario puede ver. Sin tildes ni mayúsculas. Más recientes primero.
-- Consulta en blanco o de menos de 2 caracteres → 0 filas.
create or replace function public.chat_buscar(p_q text, p_limite int default 50)
returns table (
  id              uuid,
  conversacion_id uuid,
  autor_id        uuid,
  texto           text,
  created_at      timestamptz,
  adjunto_nombre  text
)
language plpgsql stable security definer set search_path = public as $$
declare
  v_q   text := btrim(coalesce(p_q, ''));
  v_tsq tsquery;
begin
  if length(v_q) < 2
     or not exists (select 1 from public.usuarios u where u.id = auth.uid() and u.activo) then
    return;
  end if;
  v_tsq := websearch_to_tsquery('spanish'::regconfig, public.chat_unaccent(v_q));
  return query
    with visibles as materialized (
      select cv.id from public.conversaciones cv where public.chat_puede_ver(cv.id)
    )
    select m.id, m.conversacion_id, m.autor_id, m.texto, m.created_at, m.adjunto_nombre
      from public.mensajes m
      join visibles v on v.id = m.conversacion_id
     where not m.borrado
       and m.busqueda @@ v_tsq
     order by m.created_at desc
     limit least(greatest(coalesce(p_limite, 50), 1), 100);
end $$;

revoke execute on function public.chat_buscar(text, int) from public, anon;
grant  execute on function public.chat_buscar(text, int) to authenticated;

-- ---------------------------------------------------------------------------
-- 3. Editar / borrar (UC-612)
-- ---------------------------------------------------------------------------
-- Reglas (sobre la política UPDATE, que ya limita a autor o staff con acceso):
--   · id, conversacion_id, autor_id, created_at y menciones son inmutables
--     (excepción: autor_id → null por el ON DELETE SET NULL de usuarios).
--   · Borrar = borrado true. No se puede des-borrar. Al borrar se vacían
--     texto, menciones y adjunto; editado_at no cambia.
--   · Editar texto: solo el autor (el staff solo modera borrando). Marca
--     editado_at. El adjunto no se puede cambiar (solo desaparece al borrar).
--   · Un mensaje borrado ya no se puede tocar.
--   · editado_at y busqueda no los fija el cliente.
create or replace function public.fn_mensajes_edicion()
returns trigger language plpgsql set search_path = public as $$
declare
  v_yo uuid := auth.uid();
begin
  if new.id <> old.id
     or new.conversacion_id <> old.conversacion_id
     or new.created_at <> old.created_at
     or new.menciones is distinct from old.menciones
     or (new.autor_id is distinct from old.autor_id
         and not (new.autor_id is null and pg_trigger_depth() > 1)) then
    raise exception 'No se puede modificar ese dato del mensaje' using errcode = '42501';
  end if;

  if old.borrado then
    if not new.borrado or new.texto is distinct from old.texto
       or new.adjunto_path is distinct from old.adjunto_path then
      raise exception 'El mensaje está borrado' using errcode = '42501';
    end if;
    new.editado_at := old.editado_at;
    return new;
  end if;

  if new.borrado then
    new.texto          := '';
    new.menciones      := '{}';
    new.adjunto_path   := null;
    new.adjunto_nombre := null;
    new.adjunto_mime   := null;
    new.adjunto_size   := null;
    new.editado_at     := old.editado_at;
    return new;
  end if;

  if new.adjunto_path   is distinct from old.adjunto_path
     or new.adjunto_nombre is distinct from old.adjunto_nombre
     or new.adjunto_mime   is distinct from old.adjunto_mime
     or new.adjunto_size   is distinct from old.adjunto_size then
    raise exception 'El adjunto no se puede cambiar' using errcode = '42501';
  end if;

  if new.texto is distinct from old.texto then
    if v_yo is not null and old.autor_id is distinct from v_yo then
      raise exception 'Solo el autor puede editar el mensaje' using errcode = '42501';
    end if;
    new.editado_at := now();
  else
    new.editado_at := old.editado_at;
  end if;
  return new;
end $$;

drop trigger if exists trg_mensajes_edicion on public.mensajes;
create trigger trg_mensajes_edicion before update on public.mensajes
  for each row execute function public.fn_mensajes_edicion();

drop policy if exists mensajes_update on public.mensajes;
create policy mensajes_update on public.mensajes
  for update to authenticated
  using      (public.chat_puede_ver(conversacion_id) and (autor_id = auth.uid() or public.is_staff()))
  with check (public.chat_puede_ver(conversacion_id) and (autor_id = auth.uid() or public.is_staff()));

grant update on public.mensajes to authenticated;

-- ---------------------------------------------------------------------------
-- 4. Presencia y "escribiendo…" (UC-613) — Realtime Authorization
-- ---------------------------------------------------------------------------
-- Canales privados:
--   'presencia'          → presencia global: cualquier usuario activo.
--   'chat:<uuid conv>'   → broadcast de "escribiendo": quien ve la conversación.
-- Cualquier otro topic (o uno mal formado) → denegado.
-- plpgsql (no sql) para que el cast a uuid nunca se evalúe por plegado de
-- constantes sobre un topic mal formado.
create or replace function public.chat_puede_usar_canal(p_topic text)
returns boolean
language plpgsql stable security definer set search_path = public as $$
begin
  if p_topic is null then
    return false;
  elsif p_topic = 'presencia' then
    return exists (select 1 from public.usuarios u where u.id = auth.uid() and u.activo);
  elsif p_topic ~* '^chat:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    return coalesce(public.chat_puede_ver(substr(p_topic, 6)::uuid), false);
  end if;
  return false;
end $$;

revoke execute on function public.chat_puede_usar_canal(text) from public, anon;
grant  execute on function public.chat_puede_usar_canal(text) to authenticated;

do $$
begin
  if to_regclass('realtime.messages') is not null then
    execute 'drop policy if exists chat_realtime_select on realtime.messages';
    execute $p$
      create policy chat_realtime_select on realtime.messages
        for select to authenticated
        using (
          realtime.messages.extension in ('broadcast', 'presence')
          and public.chat_puede_usar_canal(realtime.topic())
        )
    $p$;
    execute 'drop policy if exists chat_realtime_insert on realtime.messages';
    execute $p$
      create policy chat_realtime_insert on realtime.messages
        for insert to authenticated
        with check (
          realtime.messages.extension in ('broadcast', 'presence')
          and public.chat_puede_usar_canal(realtime.topic())
        )
    $p$;
  end if;
end$$;

-- Realtime de mensajes: la publicación supabase_realtime (0020) emite
-- INSERT/UPDATE/DELETE, así que las ediciones y borrados ya llegan en vivo.

-- ============================================================================
-- Fin migración 0023
-- ============================================================================
