-- Seed mínimo (solo para desarrollo local con `supabase db reset`).
-- No incluye usuarios/clientes: la cartera real se importa en M5/UC-507.
insert into public.sectores (nombre) values
  ('Hostelería'), ('Construcción'), ('Agricultura'),
  ('Comercio'), ('Transporte'), ('Salud')
on conflict (nombre) do nothing;
