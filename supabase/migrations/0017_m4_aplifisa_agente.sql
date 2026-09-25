-- ============================================================================
-- Migración 0017 — M4: columnas del modelo real de Aplifisa + facturas del servidor.
--
--   1. El "MODELO LIBRO FACTURAS.xlsx" del despacho pide Nº de factura (obligatorio)
--      y retención (base, % y cuota), que no se guardaban.
--   2. Las facturas pueden llegar del programa instalado en el servidor del
--      despacho. Esas no se copian a Supabase Storage: el fichero se queda en el
--      servidor y aquí solo se guarda su ruta relativa y su huella (sha256), que
--      evita procesar dos veces la misma factura.
-- ============================================================================

alter table public.facturas_ocr add column if not exists numero_factura  text;
alter table public.facturas_ocr add column if not exists retencion_base  numeric(12,2);
alter table public.facturas_ocr add column if not exists retencion_tipo  numeric(5,2);
alter table public.facturas_ocr add column if not exists retencion_cuota numeric(12,2);

alter table public.facturas_ocr add column if not exists origen text not null default 'app'
  check (origen in ('app', 'servidor'));
alter table public.facturas_ocr add column if not exists archivo_hash  text;
alter table public.facturas_ocr add column if not exists ruta_servidor text;

create unique index if not exists idx_facturas_archivo_hash
  on public.facturas_ocr (archivo_hash) where archivo_hash is not null;
-- El Excel se genera por cliente y trimestre (fecha de expedición).
create index if not exists idx_facturas_cliente_fecha on public.facturas_ocr (cliente_id, fecha);
-- El programa del servidor pregunta qué ha cambiado desde su última pasada.
create index if not exists idx_facturas_updated_at on public.facturas_ocr (updated_at);

-- ============================================================================
-- Fin migración 0017
-- ============================================================================
