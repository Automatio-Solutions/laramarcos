# app_spec — laramarcos-asesores

> Documento canónico de especificación técnica del proyecto. Define stack, backend de tracking,
> autopilot, arquitectura y decisiones canónicas que el pipeline hereda. Zonas `auto` las regenera
> el engine; `manual`/`hybrid` son del usuario.
>
> Generado por `/app-init` · Engine v6.11.0 · 2026-06-19

---

<!-- @specbox:zone id="stack" kind="auto" -->
## 1. Stack técnico

| Capa | Tecnología |
|------|------------|
| Frontend | React + **Next.js** (App Router), Tailwind CSS |
| Backend ligero | Next.js Route Handlers / Server Actions (webhooks Resend, llamadas Claude, triggers OCR, cron DOE/BOE) |
| Base de datos | PostgreSQL gestionada vía **Supabase** (RLS por rol) |
| Email | **Resend** (dominio propio presupuestos@laramarcos.es) |
| Automatización | **n8n** (cola OCR, descarga/proceso DOE-BOE) |
| IA | **Claude (Anthropic)** — presupuestos, OCR semántico, clasificación DOE/BOE, agente lector |
| Almacenamiento sensible | **VPS propio** del despacho (facturas por cliente) |
| Integraciones | Excel modelo **Aplifisa** (export/import), Google Drive (adjuntos) |
| Testing | Jest (unit), Playwright + playwright-bdd (E2E / acceptance Gherkin es) |

Stack SpecBox: `react`. Detección de lockfiles pendiente (proyecto sin scaffolding aún).
<!-- @specbox:endzone id="stack" -->

---

<!-- @specbox:zone id="tracking_backend" kind="auto" -->
## 2. Backend de tracking

- **Backend**: `native` (Supabase + GitHub OAuth, multi-desarrollador).
- US/UC/AC viven en el backend nativo del engine. Identificadores: US-XX, UC-XXX, AC-XX.
- Estado al onboard: DB nativa vacía (se puebla con `/prd` → `import_spec`).
<!-- @specbox:endzone id="tracking_backend" -->

---

<!-- @specbox:zone id="autopilot" kind="auto" -->
## 3. Autopilot

- **Nivel**: `equilibrado`.
- **image_budget_eur_per_feature**: 5 (VEG / imágenes).
- Refleja `.claude/settings.local.json` → `specbox.autopilot`.
<!-- @specbox:endzone id="autopilot" -->

---

<!-- @specbox:zone id="architecture" kind="auto" -->
## 4. Arquitectura

Next.js App Router. Server Components + TanStack Query en cliente. Route Handlers / Server Actions
para la capa de servidor (webhooks Resend, endpoints de agentes IA, cron DOE/BOE). Supabase como capa
de datos con **RLS por rol de usuario** (responsable ve toda la cartera; asesor solo sus clientes).
n8n para flujos asíncronos pesados (cola OCR M4, scraping/proceso DOE-BOE M3). La BBDD central (M5)
es el núcleo del que dependen el resto de módulos vía API estructurada.

Integraciones entre módulos: M2 (presupuesto aceptado) → M1 (tarea + subtareas); M3 (normativa
urgente) → M1 (tarea); M4 (factura) → Excel Aplifisa; M5 → todos.
<!-- @specbox:endzone id="architecture" -->

---

<!-- @specbox:zone id="canonical_decisions" kind="hybrid" -->
## 5. Decisiones canónicas

Decisiones de proyecto que el engine debe respetar (los `/prd`/`/plan` no las repreguntan):

- **DEC-01 — Frontend Next.js**: elegido sobre React/Vite por la capa de servidor integrada necesaria
  para webhooks, agentes IA y cron. Cuenta como stack `react` en SpecBox.
- **DEC-02 — Datos sensibles en VPS propio**: facturas y datos contables no salen del VPS del
  despacho. El OCR accede al VPS de forma segura; nada en nube de terceros.
- **DEC-03 — La IA propone, el humano decide**: ninguna asignación de subtareas a personas la hace la
  IA. El agente lector (M2) solo crea tarea con aceptación inequívoca.
- **DEC-04 — Email solo vía Resend desde dominio propio**: nunca Gmail/Outlook personales.
- **DEC-05 — BBDD central como única fuente de verdad**: validación CIF/NIF/IBAN/duplicados en el
  alta; sin Excels paralelos. Claude consulta servicios/precios vía API, no envía Excel completo.

<!-- engine-entries-below -->
<!-- @specbox:endzone id="canonical_decisions" -->

---

<!-- @specbox:zone id="constraints" kind="manual" -->
## 6. Restricciones no funcionales

- **Seguridad / RGPD**: datos fiscales sensibles; RLS por rol, VPS propio para ficheros, backups
  diarios (Supabase Pro), trazabilidad de cambios y auditoría completa.
- **Entregabilidad email**: SPF/DKIM verificados en el dominio propio para Resend.
- **Rendimiento OCR**: lote de 50 facturas en 8-15 min; procesamiento en cola paralela (n8n).
- **Disponibilidad**: plataforma web (y móvil-responsive) para los 20 empleados.
- **Coste IA controlado**: consultas estructuradas a la BBDD (no envío de Excel) para minimizar tokens.
- **Calidad (baseline)**: lint zero-tolerance, coverage objetivo 85% (ratchet), acceptance Gherkin es.
<!-- @specbox:endzone id="constraints" -->

---

*Fuente: Propuesta Comercial LaraMarcos Asesores v3 (mayo 2026).*
