-- ============================================================================
-- Migración 0018 — M4: modelo Aplifisa definitivo (reunión con el despacho).
--
--   1. Dos libros por cliente: GASTOS (facturas recibidas) e INGRESOS (emitidas).
--   2. Dos cuentas por factura. En el Excel:
--        "Subcuenta"               = cuenta de gasto/ingreso (62700000; en
--                                    autónomos, el código de concepto: 627)
--        "Subcuenta Gasto/Ingreso" = subcuenta del proveedor/cliente en la
--                                    contabilidad de ESE cliente (41000023)
--      En BBDD: `subcuenta` y `subcuenta_tercero`.
--   3. Inversión del sujeto pasivo (columna "Sujeto Pasivo" con X).
--   4. Varios tipos de IVA en una factura → una fila por tipo (`lineas_iva`).
--   5. Factura atrasada: conserva su fecha y se contabiliza en otro periodo
--      (`fecha_contable`, p. ej. el 1 del trimestre siguiente).
--   6. Avisos de revisión (importes que no cuadran, falta la subcuenta…).
--   7. Memoria de cuentas POR CLIENTE: el mismo proveedor tiene una subcuenta
--      distinta en cada empresa que lleva el despacho.
--   8. Régimen del cliente: sociedades → partida doble; autónomos → programa
--      fiscal (concepto). Null = se deduce del NIF.
-- ============================================================================

alter table public.facturas_ocr add column if not exists tipo text not null default 'gasto'
  check (tipo in ('gasto', 'ingreso'));
alter table public.facturas_ocr add column if not exists subcuenta_tercero text;
alter table public.facturas_ocr add column if not exists sujeto_pasivo boolean not null default false;
alter table public.facturas_ocr add column if not exists lineas_iva jsonb not null default '[]'::jsonb;
alter table public.facturas_ocr add column if not exists fecha_contable date;
alter table public.facturas_ocr add column if not exists avisos jsonb not null default '[]'::jsonb;

create index if not exists idx_facturas_cliente_tipo_fecha
  on public.facturas_ocr (cliente_id, tipo, (coalesce(fecha_contable, fecha)));

alter table public.clientes add column if not exists regimen_contable text
  check (regimen_contable in ('partida_doble', 'fiscal'));

-- Memoria de cuentas por cliente + NIF del tercero (proveedor en gastos, cliente en ingresos).
create table if not exists public.cuentas_terceros (
  id                 uuid primary key default uuid_generate_v4(),
  cliente_id         uuid not null references public.clientes (id) on delete cascade,
  tipo               text not null check (tipo in ('gasto', 'ingreso')),
  nif                text not null,
  nombre             text,
  subcuenta          text,   -- gasto/ingreso (o código de concepto en autónomos)
  subcuenta_tercero  text,   -- la del proveedor/cliente en la contabilidad de este cliente
  iva_default        numeric(5,2),
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  unique (cliente_id, tipo, nif)
);

drop trigger if exists trg_updated_at on public.cuentas_terceros;
create trigger trg_updated_at before update on public.cuentas_terceros
  for each row execute function public.set_updated_at();
drop trigger if exists trg_auditoria on public.cuentas_terceros;
create trigger trg_auditoria after insert or update or delete on public.cuentas_terceros
  for each row execute function public.fn_auditoria();

alter table public.cuentas_terceros enable row level security;
drop policy if exists cuentas_terceros_cliente on public.cuentas_terceros;
create policy cuentas_terceros_cliente on public.cuentas_terceros
  for all using (public.puede_ver_cliente(cliente_id)) with check (public.puede_ver_cliente(cliente_id));
grant select, insert, update, delete on public.cuentas_terceros to authenticated;

-- ============================================================================
-- Fin migración 0018
-- ============================================================================
