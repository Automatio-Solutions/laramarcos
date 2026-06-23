# Supabase — Núcleo de datos (M5)

Esquema central de LaraMarcos Asesores: clientes, servicios, proveedores, sectores, plantillas de
subtareas, históricos y auditoría, con **RLS por rol** (responsable / asesor / admin).

## Estructura
```
supabase/
├── config.toml                       # config del proyecto
├── seed.sql                          # datos mínimos (sectores) — solo dev local
├── migrations/
│   └── 0001_core_schema.sql          # tablas + FKs + índices + RLS + auditoría
└── README.md
```

## Aplicar la migración (sin Docker)

1. Copia `.env.example` → `.env.local` y rellena `SUPABASE_DB_URL` (Dashboard → Project Settings →
   Database → Connection string → URI).
2. Instala dependencias y aplica:
   ```bash
   npm install
   npm run db:apply        # aplica supabase/migrations/*.sql
   npm run db:rls-test     # verifica el aislamiento RLS (AC-02 / AC-03)
   # o ambos:
   npm run db:verify
   ```

> Alternativa con Supabase CLI (requiere link del proyecto):
> `supabase link --project-ref <REF>` y `supabase db push`.

## Modelo (resumen)

| Tabla | Rol de acceso |
|-------|---------------|
| `usuarios` | cada uno a sí mismo; staff a todos |
| `clientes` | responsable/admin: todo · asesor: solo `asesor_id = auth.uid()` |
| `cliente_sectores` | hereda del acceso al cliente |
| `sectores`, `servicios`, `plantillas_subtareas`, `proveedores` | lectura: cualquier autenticado · escritura: staff |
| `auditoria` | lectura: staff · escritura: solo el trigger (SECURITY DEFINER) |

Helpers: `current_rol()`, `is_responsable()`, `is_staff()`. Trigger `fn_auditoria` registra toda
mutación con diff. Trigger `set_updated_at` mantiene `updated_at`.

## AC-04 — Backups diarios (Supabase Pro)

Los backups diarios automáticos son una característica del **plan Pro** de Supabase. Verificación:
Dashboard → Database → **Backups** (deben aparecer snapshots diarios y PITR si está activo). El proyecto
debe estar en plan Pro. Esta migración no controla los backups (es configuración del proyecto), pero el
criterio se valida comprobando que están habilitados en el panel.

## Acceptance Criteria de UC-501
- **AC-01** — Tablas con FKs e índices vía migración versionada → `migrations/0001_core_schema.sql`.
- **AC-02** — RLS: asesor solo accede a sus clientes → `scripts/rls-test.mjs`.
- **AC-03** — Responsable accede a toda la cartera → `scripts/rls-test.mjs`.
- **AC-04** — Backups diarios → verificar en Dashboard (plan Pro).
