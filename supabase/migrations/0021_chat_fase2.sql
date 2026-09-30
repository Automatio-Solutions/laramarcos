-- ============================================================================
-- Migración 0021 — Chat interno, fase 2 (UC-605..UC-609)
-- LaraMarcos Asesores · PostgreSQL (Supabase)
--
--   1. chat_miembros(conv)      → quién puede ver una conversación (para el
--                                 panel de miembros y el autocompletado de @).
--   2. chat_abrir_cliente(cli)  → abre (o recupera) el hilo de un cliente.
--   3. comentarios              → CAMBIO DE VISIBILIDAD (UC-607): hasta ahora un
--                                 comentario solo lo veían staff y su autor; a
--                                 partir de aquí lo ve también cualquiera que
--                                 pueda ver la tarea (o la tarea de la subtarea)
--                                 a la que pertenece.
--   4. Realtime                 → se publica public.comentarios.
--
-- Idempotente y ejecutable en una sola transacción.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Miembros de una conversación
-- ---------------------------------------------------------------------------
-- Usuarios ACTIVOS que pueden ver la conversación, con las mismas reglas que
-- chat_puede_ver (0020):
--   general  → todos los activos
--   oficina  → staff (responsable/admin, como is_staff) o gente de esa sede
--   directo  → los dos participantes
--   cliente  → mismas reglas que puede_ver_cliente (staff o misma sede que el
--              cliente)
-- Si quien pregunta no puede ver la conversación, no devuelve nada.
create or replace function public.chat_miembros(p_conv uuid)
returns table (id uuid, nombre text)
language sql stable security definer set search_path = public as $$
  select u.id, u.nombre
    from public.conversaciones cv
    left join public.clientes cl on cl.id = cv.cliente_id
    join public.usuarios u on u.activo
   where cv.id = p_conv
     and public.chat_puede_ver(p_conv)
     and case cv.tipo
           when 'general' then true
           when 'oficina' then u.rol in ('responsable', 'admin')
                               or (u.oficina is not null and u.oficina = cv.oficina)
           when 'directo' then u.id in (cv.usuario_a, cv.usuario_b)
           when 'cliente' then u.rol in ('responsable', 'admin')
                               or (u.oficina is not null and u.oficina = cl.oficina)
           else false
         end
   order by u.nombre;
$$;

-- ---------------------------------------------------------------------------
-- 2. Abrir (o recuperar) el hilo de un cliente
-- ---------------------------------------------------------------------------
create or replace function public.chat_abrir_cliente(p_cliente uuid)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_yo uuid := auth.uid();
  v_id uuid;
begin
  if v_yo is null
     or not exists (select 1 from public.usuarios where id = v_yo and activo)
     or p_cliente is null
     or not public.puede_ver_cliente(p_cliente) then
    raise exception 'No autorizado' using errcode = '42501';
  end if;
  if not exists (select 1 from public.clientes where id = p_cliente) then
    raise exception 'Ese cliente no existe' using errcode = '22023';
  end if;

  insert into public.conversaciones (tipo, cliente_id)
  values ('cliente', p_cliente)
  on conflict (cliente_id) do nothing
  returning id into v_id;

  if v_id is null then
    select id into v_id from public.conversaciones where cliente_id = p_cliente;
  end if;
  return v_id;
end $$;

revoke execute on function public.chat_miembros(uuid)      from public, anon;
revoke execute on function public.chat_abrir_cliente(uuid) from public, anon;
grant  execute on function public.chat_miembros(uuid)      to authenticated;
grant  execute on function public.chat_abrir_cliente(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 3. Visibilidad de comentarios (UC-607)
-- ---------------------------------------------------------------------------
-- ¿El usuario autenticado puede ver esta tarea? Replica EXACTAMENTE la RLS de
-- SELECT vigente de tareas (tareas_staff_all + tareas_visibles_select, 0002/0003):
--   staff  O  responsable de la tarea
--          O  asesor_id del cliente (y el cliente le es visible: la RLS de
--             clientes filtra esa subconsulta por oficina, ver 0013)
--          O  tiene alguna subtarea asignada en la tarea.
-- SECURITY DEFINER para no reentrar en la RLS de tareas/subtareas (patrón 0003).
-- Si cambia la política de tareas, hay que actualizar esta función.
create or replace function public.fn_puede_ver_tarea(t uuid)
returns boolean
language sql stable security definer set search_path = public as $$
  select auth.uid() is not null and (
    public.is_staff()
    or exists (
      select 1
        from public.tareas tt
       where tt.id = t
         and (
              tt.responsable_id = auth.uid()
           or exists (
                select 1 from public.clientes c
                 where c.id = tt.cliente_id
                   and c.asesor_id = auth.uid()
                   and public.puede_ver_cliente(c.id)
              )
           or exists (
                select 1 from public.subtareas s
                 where s.tarea_id = tt.id and s.asignado_id = auth.uid()
              )
         )
    )
  );
$$;

revoke execute on function public.fn_puede_ver_tarea(uuid) from public, anon;
grant  execute on function public.fn_puede_ver_tarea(uuid) to authenticated;

-- Tarea a la que pertenece un comentario (directa o a través de su subtarea).
create or replace function public.fn_tarea_de_subtarea(p_sub uuid)
returns uuid
language sql stable security definer set search_path = public as $$
  select tarea_id from public.subtareas where id = p_sub;
$$;

revoke execute on function public.fn_tarea_de_subtarea(uuid) from public, anon;
grant  execute on function public.fn_tarea_de_subtarea(uuid) to authenticated;

-- CAMBIO DE COMPORTAMIENTO: antes → is_staff() OR autor_id = auth.uid().
-- Ahora además lo ve quien pueda ver la tarea del comentario (p. ej. el
-- asignado de una subtarea ve lo que escribe el responsable, y viceversa).
-- comentarios_insert se mantiene igual (autor_id = auth.uid()).
drop policy if exists comentarios_select on public.comentarios;
create policy comentarios_select on public.comentarios
  for select using (
    public.is_staff()
    or autor_id = auth.uid()
    or public.fn_puede_ver_tarea(
         coalesce(tarea_id, public.fn_tarea_de_subtarea(subtarea_id))
       )
  );

-- ---------------------------------------------------------------------------
-- 4. Realtime: publicar comentarios (la RLS de SELECT filtra quién recibe qué)
-- ---------------------------------------------------------------------------
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (
       select 1 from pg_publication_tables
        where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'comentarios'
     ) then
    alter publication supabase_realtime add table public.comentarios;
  end if;
end$$;

-- ---------------------------------------------------------------------------
-- 5. Índices
-- ---------------------------------------------------------------------------
-- conversaciones(cliente_id) ya es UNIQUE (0020) y comentarios(tarea_id) /
-- comentarios(subtarea_id) ya están indexados (0002). Falta el de subtareas
-- por (tarea_id, asignado_id) que usa fn_puede_ver_tarea: idx_subtareas_tarea
-- (0002) ya lo cubre suficientemente. No se añaden índices.

-- ============================================================================
-- Fin migración 0021
-- ============================================================================
