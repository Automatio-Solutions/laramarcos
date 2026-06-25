-- ============================================================================
-- Migración 0011 — Ciudad y código postal en clientes.
-- Amplía la dirección postal de la ficha de cliente (M1 / M5).
-- ============================================================================

alter table public.clientes add column if not exists ciudad text;
alter table public.clientes add column if not exists codigo_postal text;

-- ============================================================================
-- Fin migración 0011
-- ============================================================================
