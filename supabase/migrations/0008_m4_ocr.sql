-- ============================================================================
-- Migración 0008 — Módulo 4 (Precontabilización OCR) · US-04
-- facturas_ocr (datos extraídos + semáforo de confianza) + bucket de ficheros.
-- NOTA: en producción los ficheros viven en el VPS propio del despacho (propuesta).
-- En dev usamos Supabase Storage (bucket privado) como stand-in.
-- ============================================================================

create table if not exists public.facturas_ocr (
  id               uuid primary key default uuid_generate_v4(),
  cliente_id       uuid references public.clientes (id) on delete set null,
  proveedor_cif    text,
  proveedor_nombre text,
  fecha            date,
  concepto         text,
  base_imponible   numeric(12,2),
  iva_tipo         numeric(5,2),
  iva_cuota        numeric(12,2),
  total            numeric(12,2),
  subcuenta        text,
  confianza        int not null default 0,    -- 0..100 (semáforo)
  revisada         boolean not null default false,
  archivo_path     text,
  archivo_nombre   text,
  subido_por       uuid references public.usuarios (id) on delete set null,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create index if not exists idx_facturas_cliente on public.facturas_ocr (cliente_id);
create index if not exists idx_facturas_confianza on public.facturas_ocr (confianza);

drop trigger if exists trg_updated_at on public.facturas_ocr;
create trigger trg_updated_at before update on public.facturas_ocr
  for each row execute function public.set_updated_at();
drop trigger if exists trg_auditoria on public.facturas_ocr;
create trigger trg_auditoria after insert or update or delete on public.facturas_ocr
  for each row execute function public.fn_auditoria();

alter table public.facturas_ocr enable row level security;
create policy facturas_staff_all on public.facturas_ocr
  for all using (public.is_staff()) with check (public.is_staff());
create policy facturas_select on public.facturas_ocr
  for select using (
    subido_por = auth.uid()
    or exists (select 1 from public.clientes c where c.id = facturas_ocr.cliente_id and c.asesor_id = auth.uid())
  );
create policy facturas_write on public.facturas_ocr
  for all using (
    subido_por = auth.uid()
    or exists (select 1 from public.clientes c where c.id = facturas_ocr.cliente_id and c.asesor_id = auth.uid())
  ) with check (true);

grant select, insert, update, delete on public.facturas_ocr to authenticated;

-- Bucket privado para los ficheros de factura (dev). Acceso vía service role.
insert into storage.buckets (id, name, public)
  values ('facturas', 'facturas', false)
  on conflict (id) do nothing;

-- ============================================================================
-- Fin migración 0008
-- ============================================================================
