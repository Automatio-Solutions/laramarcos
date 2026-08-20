-- ============================================================================
-- Migración 0016 — Cuarta oficina (Orellana) + código de cliente.
--
-- Al recibir la cartera real del despacho aparecieron dos cosas nuevas:
--   1. Una CUARTA oficina, Orellana (clientes de la serie 3000), que no estaba
--      en el enum de oficinas.
--   2. El despacho numera a sus clientes (1001, 2001, 3001, 4001…). Se guarda
--      ese código para poder reimportar de forma idempotente y para que el
--      personal reconozca al cliente por su número de siempre.
-- ============================================================================

-- El nuevo valor del enum no puede USARSE en esta misma transacción (PG), pero
-- sí quedar añadido; la carga de clientes (script aparte) ya lo tendrá commiteado.
alter type oficina add value if not exists 'Orellana';

alter table public.clientes add column if not exists codigo text;
create unique index if not exists idx_clientes_codigo on public.clientes (codigo) where codigo is not null;

-- ============================================================================
-- Fin migración 0016
-- ============================================================================
