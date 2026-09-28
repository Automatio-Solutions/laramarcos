-- ============================================================================
-- Migración 0019 — M4: PDF con varias facturas y duplicados por nº de factura.
--
--   1. Muchos clientes mandan todas las facturas del trimestre en un solo PDF
--      (con facturas de varias páginas). Cada factura que sale de él guarda
--      qué páginas ocupa, para poder revisarla contra el original.
--   2. Duplicados: además de por fichero idéntico (archivo_hash), una factura
--      es la misma si coinciden cliente, libro, NIF del tercero y nº de factura
--      (lo mismo que mira Aplifisa). Índice para esa búsqueda.
-- ============================================================================

alter table public.facturas_ocr add column if not exists pagina_desde int;
alter table public.facturas_ocr add column if not exists pagina_hasta int;

create index if not exists idx_facturas_duplicado
  on public.facturas_ocr (cliente_id, tipo, proveedor_cif)
  where numero_factura is not null;

-- ============================================================================
-- Fin migración 0019
-- ============================================================================
