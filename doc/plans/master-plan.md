# Plan Maestro Técnico — laramarcos-asesores

> Proyecto: plataforma de gestión LaraMarcos Asesores (5 módulos) · Stack: Next.js + Supabase + Resend
> + n8n + Claude + VPS propio · Backend tracking: native (5 US, 40 UC, 89 AC, 332h) · 2026-06-19

---

## 1. Arquitectura de referencia

```
                         ┌──────────────────────────────┐
        Navegador  ◄────►│  Next.js (App Router, Vercel) │
        (20 empl.)       │  - Server Components + RSC    │
                         │  - TanStack Query (cliente)   │
                         │  - Route Handlers / Actions   │◄── webhooks Resend, endpoints IA
                         └───────────────┬──────────────┘
                                         │ API segura (RLS)
                         ┌───────────────▼──────────────┐
                         │   Supabase (PostgreSQL)       │  ◄── M5 núcleo
                         │   RLS por rol · Auth · Storage│
                         │   Backups diarios · Auditoría │
                         └───────┬───────────────┬───────┘
                                 │               │
          ┌──────────────────────▼───┐   ┌───────▼─────────────────┐
          │  n8n (flujos pesados)     │   │  Claude (Anthropic)     │
          │  - Cron DOE/BOE (M3)      │   │  - Presupuestos (M2)    │
          │  - Cola OCR (M4)          │   │  - Lector aceptac. (M2) │
          └──────────┬────────────────┘   │  - Clasif. DOE/BOE (M3) │
                     │                     │  - OCR semántico (M4)   │
          ┌──────────▼──────┐              └─────────────────────────┘
          │  VPS propio      │  ◄── facturas/datos sensibles (M4), nunca en nube de terceros
          │  carpetas/cliente│
          └──────────────────┘

          Resend ── email transaccional (presupuestos M2, newsletters M3) desde dominio propio
          Google Drive ── adjuntos de tareas (M1) · Aplifisa ── Excel modelo export (M4)
```

**Principios** (de las decisiones canónicas en app_spec.md): la IA propone y el humano decide; datos
sensibles solo en VPS; email solo Resend dominio propio; BBDD central única fuente de verdad.

---

## 2. Modelo de datos (M5 — núcleo)

Tablas principales (PostgreSQL, todas con `id uuid`, `created_at`, `updated_at`, RLS):

| Tabla | Campos clave | Relaciones |
|-------|-------------|------------|
| `usuarios` | rol (responsable/asesor/admin), email, nombre | ↔ auth.users |
| `clientes` | cif, razon_social, direccion, condiciones_pago, tarifas, asesor_id | asesor_id→usuarios |
| `sectores` | nombre | — |
| `cliente_sectores` | cliente_id, sector_id | N:M clientes↔sectores |
| `servicios` | nombre, categoria, precio_base, condiciones, plantilla_id | plantilla_id→plantillas_subtareas |
| `plantillas_subtareas` | servicio_id, pasos[] (nombre, plazo_relativo_dias) | — |
| `proveedores` | cif, subcuenta_habitual, iva_default, formato_aprendido | — |
| `tareas` | cliente_id, titulo, estado, vencimiento, bloqueada, motivo_bloqueo | cliente_id→clientes |
| `subtareas` | tarea_id, asignado_id, plazo, estado, depende_de | asignado_id→usuarios |
| `comentarios` | tarea_id?/subtarea_id?, autor_id, texto, menciones[] | — |
| `tiempos` | tarea_id/subtarea_id, usuario_id, segundos, ts | — |
| `lineas_factura` | tarea_id, cliente_id, concepto, importe, facturada | — |
| `presupuestos` | cliente_id, lineas[], total, estado, resend_msg_id, aceptado_en, ip | cliente_id→clientes |
| `newsletters` | sector_id, fecha, contenido, enviados, aperturas | — |
| `facturas_ocr` | cliente_id, proveedor_id, base, iva, subcuenta, confianza, correcciones | — |
| `auditoria` | usuario_id, tabla, registro_id, diff, ts | append-only |

**RLS**: `responsable` → acceso total; `asesor` → filas donde `asesor_id = auth.uid()` (clientes y, en
cascada vía joins, tareas/presupuestos/facturas de sus clientes); `admin` → alta/edición sin borrado masivo.

Migraciones versionadas en `supabase/migrations/`. Tipos TS generados con `generate_typescript_types`.

---

## 3. Secuenciación y dependencias

```
M5 (núcleo) ──► M1 (tareas+clientes) ──► M2 (presupuestos IA)
   │                                          │
   ├──► M3 (DOE/BOE) ──(crea tareas)──────────┤──► M1
   └──► M4 (OCR) ──(usa proveedores/clientes)─┘
```

| Módulo | Depende de | Puede empezar | Integraciones salientes |
|--------|-----------|---------------|-------------------------|
| M5 | — | Semana 1 | Alimenta a todos |
| M1 | M5 | Semana 2 | Recibe tareas de M2/M3 |
| M2 | M5, M1 | Semana 3-4 | Crea tarea+subtareas en M1; factura |
| M3 | M5 (sectores), M1 | Semana 5 | Crea tareas urgentes en M1 |
| M4 | M5 (proveedores) | Semana 6-7 | Genera Excel Aplifisa |

---

## 4. Setup de infraestructura

| Servicio | Acción de setup | Responsable | Notas |
|----------|----------------|-------------|-------|
| **Supabase** | Crear proyecto Pro, configurar Auth (GitHub/email), RLS, backups | DBInfra | Project ID → app_spec.md / settings |
| **Resend** | Alta plan Pro, verificar dominio (SPF/DKIM) presupuestos@laramarcos.es, webhook de eventos→Next.js | DBInfra | Compartido M2+M3 |
| **n8n** | Instancia (cloud o VPS), credenciales Supabase + Claude, flujos cron DOE/BOE y cola OCR | n8n-specialist | Sem 5-7 |
| **VPS propio** | Estructura de carpetas por cliente, canal seguro de acceso para la IA del OCR | DBInfra | Datos no salen |
| **Vercel** | Proyecto Next.js, env vars (Supabase, Resend, Anthropic keys), cron si no se usa n8n | ReactSpecialist | Deploy continuo |
| **Anthropic** | API key Claude, presupuesto de tokens, prompts versionados | Lead | Coste ~10€/mes est. |
| **Google Drive** | OAuth para adjuntos de M1 | ReactSpecialist | Sem 2 |

Variables de entorno (Vercel/local): `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`,
`RESEND_API_KEY`, `ANTHROPIC_API_KEY`, `N8N_WEBHOOK_URL`, `VPS_OCR_ENDPOINT`.

---

## 5. Integraciones entre módulos (contratos)

| Origen → Destino | Mecanismo | Contrato |
|------------------|-----------|----------|
| M2 aceptación → M1 | Server action / evento interno | `crearTareaDesdePlantilla(servicio_id, cliente_id)` → tarea + subtareas sin asignar |
| M3 urgencia → M1 | n8n → API Next.js | `crearTareaUrgente(cliente_id, plantilla?)` por cliente afectado |
| M4 → Aplifisa | Export | Excel con columnas exactas del modelo |
| Todos → M5 | Supabase client (RLS) | Lectura/escritura validada |
| M2/M3 → Resend | SDK Resend | Envío desde dominio propio + tracking |
| Resend → M2 | Webhook → Route Handler | Eventos entrega/apertura + buzón de respuestas para el agente lector |

---

## 6. Mapa a la spec (native)

| US | Módulo | UC | AC | Horas |
|----|--------|----|----|-------|
| US-05 | M5 Base de datos | 8 | 20 | 60h |
| US-01 | M1 Tareas+Clientes | 12 | 27 | 90h |
| US-02 | M2 Presupuestos IA | 8 | 18 | 70h |
| US-03 | M3 DOE/BOE | 6 | 12 | 45h |
| US-04 | M4 OCR | 6 | 12 | 55h |
| **Total** | | **40** | **89** | **332h** + 12h integración |

Flujo por UC: `find_next_uc` → `start_uc` → implementación por fases → acceptance Gherkin (es) →
`mark_ac_batch` → `complete_uc` → merge secuencial.

---

## 7. Equipo de agentes (team-config.json)

Orchestrator (opus) + ReactSpecialist + DBInfra + DesignSpecialist + QAReviewer + AcceptanceTester +
AcceptanceValidator. n8n-specialist (AG-05) para M3/M4. El Orchestrator delega por fases, no implementa.

---

## 8. Plan de 8 semanas

| Semana | Entrega | UCs principales |
|--------|---------|-----------------|
| 1 | M5 BBDD + RLS + import cartera + alta 20 usuarios | UC-501..508 |
| 2 | M1 Kanban/Lista/Calendario + Clientes + alertas + Drive | UC-101..112 |
| 3-4 | M2 catálogo + Claude + editor + Resend + agente lector + plantillas | UC-201..208 |
| 5 | M3 sectores + 1ª newsletter real + tareas urgentes + métricas | UC-301..306 |
| 6-7 | M4 carpetas VPS + cola n8n + OCR Claude + Excel Aplifisa + semáforo | UC-401..406 |
| 8 | Integración global, pruebas E2E, formación, documentación, entrega | — |

---

## 9. Riesgos transversales

| Riesgo | Mitigación |
|--------|-----------|
| Diseño RLS incorrecto expone datos | Tests de aislamiento obligatorios antes de merge (gate) |
| Entregabilidad de Resend | Dominio dedicado verificado + warm-up |
| Variabilidad coste IA | Consultas estructuradas a BBDD, prompts optimizados, presupuesto por feature |
| Calidad de datos de la cartera Excel | Informe de validación en import + limpieza previa (semana 1) |
| Formato cambiante DOE/BOE/Aplifisa | Parsers/plantillas configurables + alertas de fallo |

---

## 10. Siguientes pasos inmediatos

1. `/visual-setup` — identidad visual (brand kit LaraMarcos, tokens, Stitch) → habilita diseños.
2. Crear proyecto Supabase y aplicar migración inicial de M5 (UC-501).
3. `/plan US-05` → plan detallado del núcleo y comenzar `/implement` por UC.

---
*Plan maestro generado tras onboarding + discovery + PRDs. Fuente: propuesta v3 + app_prd/app_spec.*
