-- ============================================================================
-- Migración 0003 — Corrige recursión infinita en RLS de tareas/subtareas.
-- Las políticas se referenciaban entre tablas (tareas→subtareas→tareas).
-- Se sustituyen los subqueries cruzados por funciones SECURITY DEFINER que
-- saltan RLS y rompen el ciclo.
-- ============================================================================

create or replace function public.fn_asignado_en_tarea(t uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.subtareas s
    where s.tarea_id = t and s.asignado_id = auth.uid()
  );
$$;

create or replace function public.fn_es_responsable_tarea(t uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.tareas tt
    where tt.id = t and tt.responsable_id = auth.uid()
  );
$$;

-- tareas: el subquery a subtareas pasa a usar la función (sin recursión)
drop policy if exists tareas_visibles_select on public.tareas;
create policy tareas_visibles_select on public.tareas
  for select using (
    responsable_id = auth.uid()
    or exists (select 1 from public.clientes c where c.id = tareas.cliente_id and c.asesor_id = auth.uid())
    or public.fn_asignado_en_tarea(tareas.id)
  );

-- subtareas: el subquery a tareas pasa a usar la función (sin recursión)
drop policy if exists subtareas_select on public.subtareas;
create policy subtareas_select on public.subtareas
  for select using (
    asignado_id = auth.uid() or public.fn_es_responsable_tarea(subtareas.tarea_id)
  );

drop policy if exists subtareas_write on public.subtareas;
create policy subtareas_write on public.subtareas
  for update using (
    asignado_id = auth.uid() or public.fn_es_responsable_tarea(subtareas.tarea_id)
  ) with check (
    asignado_id = auth.uid() or public.fn_es_responsable_tarea(subtareas.tarea_id)
  );

drop policy if exists subtareas_insert on public.subtareas;
create policy subtareas_insert on public.subtareas
  for insert with check (public.fn_es_responsable_tarea(subtareas.tarea_id));

-- ============================================================================
-- Fin migración 0003
-- ============================================================================
