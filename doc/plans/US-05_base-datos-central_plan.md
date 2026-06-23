# Plan: US-05 — Base de datos centralizada (núcleo)

> Generado: 2026-06-19 · Origen: US-05 (backend native) · Estado: Pendiente
> Stack: Next.js (App Router) + Supabase (PostgreSQL, RLS) · Branding: navy #1F223E
> PRD: doc/prd/m5-base-datos-central.md · 8 UC · 20 AC · 60h

---

## Resumen

Construir el núcleo de datos del sistema: esquema PostgreSQL en Supabase con RLS por rol, capa de
acceso a datos con validaciones (CIF/NIF/IBAN/duplicados), y los paneles de administración de
clientes, servicios, proveedores, sectores y plantillas de subtareas, más import/export y auditoría.
Es la base de la que dependen M1-M4.

## Análisis UI (Fase 0)

### Pantallas (admin panel)
| Pantalla | UC | Tipo | Prioridad diseño |
|----------|----|----|------------------|
| Clientes — listado + filtros | UC-502 | Tabla densa + búsqueda | Alta |
| Cliente — formulario alta/edición | UC-502 | Form (12-18 campos) + validación inline | Alta |
| Servicios — listado + form | UC-503 | Tabla + form | Media |
| Proveedores — listado + form | UC-504 | Tabla + form | Media |
| Sectores — gestión + asignación | UC-505 | Lista + chips N:M | Media |
| Plantillas de subtareas — editor | UC-506 | Editor de pasos (lista ordenable) | Media |
| Importador Excel/CSV | UC-507 | Wizard upload + informe validación | Media |
| Auditoría — log consultable | UC-508 | Tabla con filtros | Baja |

### Componentes UI requeridos
| Requisito | Componente | Acción | Criterio |
|-----------|------------|--------|----------|
| Tabla densa con orden/paginación | `DataTable` | CREAR | 100-1000 filas, sortable, server-paginated |
| Búsqueda + filtros avanzados | `FilterBar` | CREAR | CIF, sector, asesor, estado, fechas |
| Formulario con validación inline | `Form` + `FormField` | CREAR | error inline rojo bajo el campo |
| Input validado (CIF/NIF/IBAN) | `ValidatedInput` | CREAR | valida al perder foco, bloquea submit |
| Selector múltiple (sectores) | `MultiSelectChips` | CREAR | N:M cliente↔sector |
| Editor de pasos ordenable | `StepListEditor` | CREAR | drag para reordenar subtareas |
| Wizard de importación | `ImportWizard` | CREAR | upload → informe → confirmar |
| Badge de estado | `StatusBadge` | CREAR | pill por estado |
| Diálogo de confirmación | `ConfirmDialog` | CREAR | acciones destructivas/masivas |
| Estado vacío | `EmptyState` | CREAR | guía al usuario |
| Toast/feedback | `Toast` | CREAR | éxito/error |

Todos los componentes usan los tokens de `doc/brand/brand_kit/` (navy #1F223E, Plus Jakarta Sans, radius 8px).

---

## Fases de Implementación

### Fase 1: Bootstrap del proyecto [DBInfra + ReactSpecialist]
- [ ] `create-next-app` (App Router, TS, Tailwind, ESLint). Integrar `tailwind.config.js` del brand kit y `variables.css`.
- [ ] Configurar Supabase client (`@supabase/ssr`), auth helpers, env vars.
- [ ] Estructura: `src/app/(panel)/`, `src/components/ui/`, `src/lib/supabase/`, `src/lib/validators/`, `supabase/migrations/`.
- [ ] Jest + Playwright (playwright-bdd) configurados. ESLint zero-tolerance.
- Estimado: 6h

### Fase 2: Modelo de datos + migraciones + RLS [DBInfra] — UC-501
- [ ] Migración inicial: tablas `usuarios`, `clientes`, `sectores`, `cliente_sectores`, `servicios`, `plantillas_subtareas`, `proveedores`, `auditoria` (FKs, índices, timestamps).
- [ ] Roles (`responsable`, `asesor`, `admin`) y políticas **RLS** por tabla.
- [ ] Trigger genérico de auditoría (INSERT/UPDATE/DELETE → `auditoria` con diff).
- [ ] Backups diarios (Supabase Pro). Tipos TS generados (`generate_typescript_types`).
- [ ] **Test de aislamiento RLS** (asesor no accede a cliente ajeno; responsable accede a todo). → AC-01..04
- Estimado: 12h

### Fase 3: Validadores + capa de acceso a datos [ReactSpecialist + DBInfra]
- [ ] Validadores: CIF/NIF (dígito de control ES), IBAN (módulo 97), email, detección de duplicados. Tests unitarios. → AC-06/07/08
- [ ] Repositorios/queries por entidad (clientes, servicios, proveedores, sectores, plantillas) con RLS aplicada.
- [ ] Endpoints/Server Actions: API de servicios/precios (<200ms) y proveedores (subcuenta/IVA por CIF) para consumo de M2/M4. → AC-10/12
- Estimado: 10h

### Fase 4: Paneles CRUD [ReactSpecialist + DesignSpecialist] — UC-502..506
- [ ] **Clientes**: listado (`DataTable` + `FilterBar`), form con `ValidatedInput` + `MultiSelectChips` (sectores). → AC-05..08, AC-13
- [ ] **Servicios**: CRUD + plantilla asociada + registro de cambio de tarifa. → AC-09/10
- [ ] **Proveedores**: CRUD con subcuenta/IVA/formato. → AC-11
- [ ] **Sectores**: gestión + asignación N:M; endpoint "clientes por sector" para M3. → AC-13/14
- [ ] **Plantillas de subtareas**: `StepListEditor` con pasos y plazos relativos; endpoint de instanciación para M2. → AC-15/16
- Estimado: 18h

### Fase 5: Importación / exportación [ReactSpecialist] — UC-507
- [ ] `ImportWizard`: parseo Excel/CSV, validación de CIFs y duplicados, informe de filas válidas/rechazadas antes de confirmar. → AC-17
- [ ] Exportación de cualquier tabla/consulta a Excel/CSV. → AC-18
- Estimado: 8h

### Fase 6: Auditoría [ReactSpecialist] — UC-508
- [ ] Vista de auditoría consultable y filtrable (usuario, tabla, rango fechas). → AC-19/20
- Estimado: 4h

### Fase 7: QA + Acceptance [QAReviewer + AcceptanceTester/Validator]
- [ ] Unit tests (validadores, repos), coverage ≥85% (ratchet).
- [ ] Acceptance Gherkin (es) por UC en `tests/acceptance/features/UC-50X_*.feature`.
- [ ] E2E Playwright de los flujos clave (alta cliente con validación, import, RLS).
- Estimado: incluido en fases + 2h consolidación

---

## Comandos finales
```bash
npx supabase migration up         # aplicar migraciones
npm run gen:types                 # tipos TS desde el esquema
npx eslint . --fix && npx tsc --noEmit && npx jest
npx playwright test               # E2E + acceptance
```

## Alternativas y Tradeoffs
| Decisión | Elegido | Descartado | Razón |
|----------|---------|-----------|-------|
| Acceso a datos | Supabase client + RLS | ORM (Prisma) sobre service-role | RLS por rol es requisito de seguridad; el cliente con RLS lo aplica nativo |
| Validación CIF/IBAN | Librería propia + tests | Solo regex | El dígito de control y módulo 97 requieren algoritmo, no regex |
| Auditoría | Trigger en DB | Lógica en app | Garantiza 100% de mutaciones registradas, también desde otros módulos |
| Estado servidor | Server Components + Server Actions | SPA pura | Cumple DEC-01 (Next.js), menos JS en cliente |

## Archivos a crear (resumen)
```
supabase/migrations/0001_core_schema.sql        # tablas + RLS + trigger auditoría
src/lib/supabase/{client,server}.ts
src/lib/validators/{cif,iban,email,duplicates}.ts (+ tests)
src/lib/repos/{clientes,servicios,proveedores,sectores,plantillas}.ts
src/app/(panel)/clientes/{page.tsx,[id]/page.tsx}
src/app/(panel)/{servicios,proveedores,sectores,plantillas,importar,auditoria}/page.tsx
src/components/ui/{DataTable,FilterBar,ValidatedInput,MultiSelectChips,StepListEditor,ImportWizard,StatusBadge,ConfirmDialog,EmptyState,Toast}.tsx
tests/acceptance/features/UC-50X_*.feature
```

## Visual Experience Generation
- **Modo VEG**: 1-Uniforme (hereda `doc/veg/base/veg-laramarcos-asesores.md`). Panel interno, un solo perfil de experiencia.
- **Resumen para sub-agentes**: density compact, whitespace moderate, motion subtle, hierarchy dashboard/data-first, CTA medium, navy #1F223E + grey, Plus Jakarta Sans, radius 8px, surface white. Tablas densas legibles, semáforos, badges de estado.

## Diseños Stitch
- **stitch_designs**: PENDING — proyecto Stitch creado (`12029126277063254652`) y DESIGN.md subido, pero el design system formal está bloqueado por OAuth. Las pantallas admin (Clientes listado/form, Servicios, Proveedores, Sectores, Plantillas, Importador, Auditoría) se generarán cuando se decida, usando DESIGN.md como contexto.

## Referencias
- PRD: doc/prd/m5-base-datos-central.md · Plan maestro: doc/plans/master-plan.md
- Brand: doc/brand/brand_kit/ · DESIGN.md: doc/design/DESIGN.md · VEG: doc/veg/base/

---
**Prioridad**: urgent · **Complejidad**: Alta · **Siguiente**: `/implement UC-501` (empezar por el esquema)
