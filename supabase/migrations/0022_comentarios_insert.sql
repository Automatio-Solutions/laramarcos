-- ============================================================================
-- Migración 0022 — Comentarios de tareas: escritura restringida y destinatarios
--                  de menciones (correcciones de la auditoría del chat fase 2)
-- LaraMarcos Asesores · PostgreSQL (Supabase)
--
--   1. fn_usuario_ve_tarea(u, t) → la regla de visibilidad de tareas evaluada
--                                  para CUALQUIER usuario (uso interno).
--   2. fn_puede_ver_tarea(t)     → pasa a ser fn_usuario_ve_tarea(auth.uid(), t),
--                                  así las dos no pueden divergir.
--   3. tarea_quienes_ven(t)      → usuarios activos que ven la tarea (para
--                                  resolver @menciones en comentarios). Vacío si
--                                  quien pregunta no ve la tarea.
--   4. comentarios_insert        → CAMBIO DE COMPORTAMIENTO: además de firmar
--                                  como uno mismo, hay que poder ver la tarea
--                                  (o la tarea de la subtarea) del comentario.
--
-- Idempotente y ejecutable en una sola transacción.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Visibilidad de una tarea para un usuario cualquiera
-- ---------------------------------------------------------------------------
-- Replica EXACTAMENTE la RLS de SELECT vigente de tareas (tareas_staff_all +
-- tareas_visibles_select, 0002/0003), evaluada para p_usuario:
--   staff (rol responsable/admin, como is_staff)
--   O responsable de la tarea
--   O asesor_id del cliente de la tarea Y ese cliente le es visible (la RLS de
--     clientes filtra esa subconsulta: staff o misma oficina, ver 0013)
--   O tiene alguna subtarea asignada en la tarea.
-- No exige usuario activo (is_staff/mi_oficina tampoco lo hacen): quien filtra
-- por activos es tarea_quienes_ven.
-- SECURITY DEFINER para no reentrar en la RLS de tareas/subtareas (patrón 0003).
-- Si cambia la política de tareas, hay que actualizar ESTA función.
create or replace function public.fn_usuario_ve_tarea(p_usuario uuid, p_tarea uuid)
returns boolean
language sql stable security definer set search_path = public as $$
  select p_usuario is not null and (
    exists (
      select 1 from public.usuarios u
       where u.id = p_usuario and u.rol in ('responsable', 'admin')
    )
    or exists (
      select 1
        from public.tareas tt
       where tt.id = p_tarea
         and (
              tt.responsable_id = p_usuario
           or exists (
                select 1
                  from public.clientes c
                  join public.usuarios u on u.id = p_usuario
                 where c.id = tt.cliente_id
                   and c.asesor_id = p_usuario
                   and (
                        u.rol in ('responsable', 'admin')
                     or (u.oficina is not null and c.oficina = u.oficina)
                   )
              )
           or exists (
                select 1 from public.subtareas s
                 where s.tarea_id = tt.id and s.asignado_id = p_usuario
              )
         )
    )
  );
$$;

-- Solo para uso interno (desde otras funciones SECURITY DEFINER): no permite
-- preguntar por la visibilidad de terceros desde la API.
revoke execute on function public.fn_usuario_ve_tarea(uuid, uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 2. fn_puede_ver_tarea (0021) = fn_usuario_ve_tarea(auth.uid(), t)
-- ---------------------------------------------------------------------------
create or replace function public.fn_puede_ver_tarea(t uuid)
returns boolean
language sql stable security definer set search_path = public as $$
  select public.fn_usuario_ve_tarea(auth.uid(), t);
$$;

revoke execute on function public.fn_puede_ver_tarea(uuid) from public, anon;
grant  execute on function public.fn_puede_ver_tarea(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 3. Quiénes ven una tarea (destinatarios posibles de una @mención)
-- ---------------------------------------------------------------------------
-- Usuarios ACTIVOS para los que fn_usuario_ve_tarea es cierto. Si quien
-- pregunta no está activo, no ve la tarea o la tarea no existe → 0 filas.
create or replace function public.tarea_quienes_ven(p_tarea uuid)
returns table (id uuid, nombre text)
language sql stable security definer set search_path = public as $$
  select u.id, u.nombre
    from public.usuarios u
   where u.activo
     and exists (select 1 from public.tareas t where t.id = p_tarea)
     and exists (select 1 from public.usuarios yo where yo.id = auth.uid() and yo.activo)
     and public.fn_usuario_ve_tarea(auth.uid(), p_tarea)
     and public.fn_usuario_ve_tarea(u.id, p_tarea)
   order by u.nombre;
$$;

revoke execute on function public.tarea_quienes_ven(uuid) from public, anon;
grant  execute on function public.tarea_quienes_ven(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 4. Escritura de comentarios
-- ---------------------------------------------------------------------------
-- CAMBIO DE COMPORTAMIENTO: antes → autor_id = auth.uid() (cualquiera que
-- conociera el id de una tarea podía comentar en ella). Ahora además hay que
-- poder ver la tarea del comentario (directa o a través de su subtarea).
drop policy if exists comentarios_insert on public.comentarios;
create policy comentarios_insert on public.comentarios
  for insert with check (
    autor_id = auth.uid()
    and public.fn_puede_ver_tarea(
          coalesce(tarea_id, public.fn_tarea_de_subtarea(subtarea_id))
        )
  );

-- ============================================================================
-- Fin migración 0022
-- ============================================================================
