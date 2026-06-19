# laramarcos-asesores

> Generado con SpecBox Engine v6.11.0

Plataforma de gestión integral para **LaraMarcos Asesores** (despacho/gestoría, 20 empleados,
Extremadura). 5 módulos integrados sobre una base de datos centralizada. Objetivo: eliminar tareas
improductivas, garantizar que ninguna gestión quede sin cobrar y posicionar al despacho como proactivo.

## Módulos

| ID | Módulo | Descripción |
|----|--------|-------------|
| M1 | Gestión de tareas + Clientes | Kanban/Lista/Calendario, subtareas asignables, dependencias, @menciones, vinculación a facturación. Apartado Clientes (ficha 360, segmentación). |
| M2 | Presupuestación con IA | Texto libre → Claude consulta catálogo en BBDD → editor libre → envío Resend → agente lector de aceptaciones → crea tarea + subtareas. |
| M3 | Vigilancia DOE/BOE | Agente diario lee DOE+BOE, clasifica por sector, newsletters segmentadas vía Resend, crea tareas urgentes en M1. |
| M4 | Precontabilización OCR | Facturas (PDF/escaneadas) → OCR + Claude → Excel modelo Aplifisa. Memoria de proveedores, semáforo de confianza. Datos en VPS propio. |
| M5 | Base de datos centralizada | PostgreSQL/Supabase, núcleo: clientes, servicios, proveedores, sectores, plantillas de subtareas, históricos. Una sola fuente de verdad. |

## Stack

| Tecnología | Detalle |
|------------|---------|
| Frontend | React + **Next.js** (App Router) · Tailwind CSS |
| Backend ligero | Next.js API routes / server actions (webhooks Resend, llamadas Claude, triggers OCR, cron DOE/BOE) |
| Base de datos | PostgreSQL gestionada vía **Supabase** (RLS por rol) |
| Email transaccional | **Resend** (dominio propio: presupuestos@laramarcos.es) |
| Automatización pesada | **n8n** (cola OCR, descarga/proceso DOE-BOE) |
| IA | **Claude (Anthropic)** — presupuestos, OCR semántico, clasificación DOE/BOE, agente lector |
| OCR / datos sensibles | **VPS propio** del despacho (carpetas por cliente) |
| Integración contable | Excel modelo **Aplifisa** (export/import) · Google Drive (adjuntos) |

## Arquitectura

Next.js App Router. Server Components + TanStack Query en cliente. Server actions / route handlers
para la capa de servidor (webhooks, agentes IA, cron). Supabase como capa de datos con RLS por rol de
usuario. n8n para flujos asíncronos pesados (cola OCR, scraping DOE/BOE). Ver patrones en
`specbox-engine/architecture/react/`.

## Memoria Persistente (Engram) — REQUERIDO

Este proyecto usa Engram como memoria persistente FTS5 para sobrevivir compactaciones de contexto.
Al inicio de cada sesión, verifica que las tools de Engram (`mem_save`, `mem_search`, `mem_context`)
están disponibles. Si NO lo están, PARA y muestra instrucciones de instalación
(https://github.com/Gentleman-Programming/engram/releases). No hay fallback — es infraestructura crítica.

### Protocolo "Surviving Compaction"
Si detectas compactación de contexto: 1) `mem_context` del proyecto actual, 2) `mem_search` con
keywords si hace falta, 3) continuar solo tras recuperar contexto. NUNCA continúes "de memoria".

### Persistencia activa
- Al iniciar feature: `mem_save` con título, plan y archivos clave.
- Al completar fase de /implement: `mem_save` con resumen.
- Al resolver problema complejo: `mem_save` con diagnóstico y solución.

## Quality Contract — Calidad sobre velocidad

1. **Lee antes de escribir** — `quality-first-guard.mjs` BLOQUEA modificar archivos no leídos en sesión.
2. **Piensa antes de actuar** — para tareas complejas (>3 archivos), articula el enfoque antes de codear.
3. **Verifica antes de cerrar** — no marques completado sin verificar. "Debería funcionar" no es verificación.
4. **Pregunta antes de adivinar** — una pregunta cuesta ~50 tokens; una iteración fallida, miles.
5. **Una correcta > tres rápidas**.

## Reglas del Proyecto

- Datos contables/fiscales de clientes son sensibles: OCR y ficheros de facturas viven en el VPS propio,
  nunca en la nube de terceros. La BBDD central valida CIF/NIF/IBAN en el alta.
- El agente IA **nunca decide quién hace una subtarea**: la asignación a personas la hace siempre el
  responsable del despacho desde el panel.
- El agente lector (M2) solo crea tarea cuando la aceptación es **inequívoca**.
- Newsletters DOE/BOE: si no hay novedades del día, no se envía nada.
- Email solo vía Resend desde dominio propio, nunca Gmail/Outlook personales.

## Sistema de Diseño

> Configurado vía `/visual-setup` — 2026-06-19. Estética Financial Pro (navy sobrio).

| Campo | Valor |
|-------|-------|
| Primary | `#1F223E` (navy del logo) |
| Secondary | `#828999` (slate grey) |
| Accent | `#5B6699` · Surface | blanco |
| Font | Plus Jakarta Sans |
| Roundness | Medium (8px) · Device | desktop-first |
| Color Variant (Stitch) | FIDELITY · Color Mode | LIGHT |

Artefactos: `doc/brand/brand_kit/` (SKILL.md, variables.css, tailwind.config.js, light.md, dark.md),
`doc/veg/base/veg-laramarcos-asesores.md`, `doc/design/stitch-prompt-template.md`.

**Stitch remoto PENDIENTE**: falta `stitch_set_api_key` + `stitch_create_project` +
`stitch_create_design_system` (la API key se ofusca en disco y no es recuperable de otros proyectos).
Reglas: Stitch genera en LIGHT (dark mode en código con tokens CSS); cada pantalla → 3 form factors.

## Servicios Externos

### Supabase
- Project ID: TBD · Entorno: desarrollo · RLS por rol. Patrones: `specbox-engine/infra/supabase/patterns.md`

### Resend
- Dominio: presupuestos@laramarcos.es (verificar SPF/DKIM). Plan Pro estimado.

### n8n
- Cola de procesamiento OCR (M4) y descarga/proceso DOE-BOE (M3).

### Google Stitch (UI)
- Project ID: TBD · Device: DESKTOP · Model: GEMINI_3_PRO · Diseños en `doc/design/{feature}/`

## Comandos Disponibles

| Comando | Propósito |
|---------|-----------|
| /discovery | ICP/JTBD + app_market.md (bootstrap) |
| /app-init | Crea doc/app/app_prd.md y app_spec.md (docs canónicos) |
| /prd | Genera PRD + work item |
| /plan | Plan de implementación + diseños Stitch + VEG |
| /implement | Autopilot: rama + fases + design-to-code + QA + PR |
| /feedback | Reporta bugs de testing manual → bloquea merge |

## Flujo de Desarrollo

```
/discovery → app_market.md (ICP/JTBD)
  |
/app-init → app_prd.md + app_spec.md (canon del proyecto)
  |
/prd → PRD + spec (US/UC/AC) con Definition Quality Gate
  |
/plan → Plan técnico + Diseños Stitch + VEG (si hay targets en PRD)
  |
/implement → Autopilot: rama + design-to-code + QA + Acceptance Gate + PR
```

## Tracking — Native (multi-desarrollador)

Backend de tracking: **native** (Supabase + GitHub OAuth). US/UC/AC viven en el backend nativo del
engine. Identificadores: US-XX (User Story), UC-XXX (Use Case), AC-XX (Acceptance Criteria).

## Acceptance Testing — Gherkin BDD (es)

ACs validados con Gherkin en español. React → `tests/acceptance/features/` con `playwright-bdd`.

## Reglas globales
Aplican las reglas de `specbox-engine/rules/GLOBAL_RULES.md`.

---

*Generado: 2026-06-19 · Engine: SpecBox Engine v6.11.0*
