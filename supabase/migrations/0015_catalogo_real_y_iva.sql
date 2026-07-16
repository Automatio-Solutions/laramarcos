-- ============================================================================
-- Migración 0015 — Catálogo real de LaraMarcos + IVA en presupuestos.
--
-- El despacho aportó su tarifario real (48 servicios: fiscales FSCL-*,
-- laborales LBRL-* y otras gestiones RSTS-*). Trae tres cosas que el modelo
-- no sabía representar:
--   1. Código de servicio (FSCL-001…).
--   2. Servicios facturados POR HORA (no a precio cerrado).
--   3. IVA: el tarifario da base y total (+21%), pero los presupuestos no
--      calculaban IVA. Un presupuesto sin IVA no es válido para un cliente.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Servicios: código y unidad de facturación
-- ---------------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_type where typname = 'unidad_servicio') then
    -- fijo   → precio cerrado por gestión
    -- hora   → tarifa horaria; la cantidad del presupuesto son horas
    -- unidad → precio por unidad (p. ej. impresión por documento)
    create type unidad_servicio as enum ('fijo', 'hora', 'unidad');
  end if;
end$$;

alter table public.servicios add column if not exists codigo text;
alter table public.servicios add column if not exists unidad unidad_servicio not null default 'fijo';

create unique index if not exists idx_servicios_codigo on public.servicios (codigo) where codigo is not null;

-- Precio por unidad con decimales finos: RSTS-006 (impresión) son 0,15 € IVA
-- incluido → base 0,1240. Con 2 decimales, 1.000 documentos desviarían ~5 €.
alter table public.servicios alter column precio_base type numeric(12,4);

-- ---------------------------------------------------------------------------
-- 2. Presupuestos: IVA desglosado (base + cuota + total)
-- ---------------------------------------------------------------------------
alter table public.presupuestos add column if not exists iva_tipo       numeric(5,2)  not null default 21;
alter table public.presupuestos add column if not exists base_imponible numeric(12,2) not null default 0;
alter table public.presupuestos add column if not exists iva_cuota      numeric(12,2) not null default 0;

comment on column public.presupuestos.total is 'Base imponible + cuota de IVA (lo que paga el cliente).';

-- Los presupuestos existentes (demo) llevaban el importe sin IVA en `total`:
-- se recoloca como base y se recalcula el total con su IVA.
update public.presupuestos
   set base_imponible = total,
       iva_cuota      = round(total * 0.21, 2),
       total          = round(total * 1.21, 2)
 where base_imponible = 0 and total > 0;

-- ============================================================================
-- Fin migración 0015
-- ============================================================================
