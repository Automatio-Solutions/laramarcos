-- ============================================================================
-- Migración 0014 — Explicación de la subcuenta sugerida (UC-402, AC-02).
-- Cuando el concepto de la factura es ambiguo, Claude propone la subcuenta más
-- probable y explica por qué. El asesor ve el motivo antes de aceptarla.
-- ============================================================================

alter table public.facturas_ocr add column if not exists subcuenta_motivo text;

-- De dónde salió la subcuenta: histórico del proveedor (UC-403) o sugerencia IA.
do $$
begin
  if not exists (select 1 from pg_type where typname = 'origen_subcuenta') then
    create type origen_subcuenta as enum ('historico', 'ia', 'manual');
  end if;
end$$;

alter table public.facturas_ocr add column if not exists subcuenta_origen origen_subcuenta;

-- ============================================================================
-- Fin migración 0014
-- ============================================================================
