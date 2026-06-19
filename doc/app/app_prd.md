# app_prd — laramarcos-asesores

> Documento canónico de producto (PRD maestro). Fuente de verdad que `/prd`, `/plan` y
> `/visual-setup` consultan para no repreguntar lo decidido a nivel de proyecto.
> Zonas: `manual` (del usuario, nunca se sobrescriben), `auto` (regeneradas por el engine),
> `hybrid` (manual arriba, entradas del engine debajo del marcador).
>
> Generado por `/app-init` · Engine v6.11.0 · 2026-06-19

---

<!-- @specbox:zone id="vision" kind="manual" -->
## 1. Visión

Plataforma de gestión integral para **LaraMarcos Asesores** (gestoría, 20 empleados, Extremadura)
que elimina tareas improductivas, garantiza que **ninguna gestión quede sin cobrar** y posiciona al
despacho como **proactivo** ante sus clientes. Cinco módulos conectados sobre una **base de datos
central** sustituyen los Excel/Sheets sueltos: "sin papel, sin olvidos, sin ineficiencias".
<!-- @specbox:endzone id="vision" -->

---

<!-- @specbox:zone id="audience" kind="manual" -->
## 2. Audiencia

ICPs definidos en `doc/app/app_market.md` (roles internos del despacho):

- **ICP-1 — Responsable / socio del despacho**: control de carga del equipo, asignación de subtareas,
  que todo lo completado se cobre, posicionamiento proactivo.
- **ICP-2 — Asesor (fiscal / contable / laboral)**: ejecuta gestiones, presupuesta, precontabiliza;
  no perder tareas, no transcribir a mano, presupuestar en segundos.
- **ICP-3 — Administrativo / recepción**: alta de clientes, subida de facturas, seguimiento.

No-ICP: grandes asesorías con ERP propio, autónomos sin equipo, despachos que no usan Aplifisa.
<!-- @specbox:endzone id="audience" -->

---

<!-- @specbox:zone id="scope" kind="manual" -->
## 3. Alcance

**En alcance — 5 módulos integrados:**

| ID | Módulo | Núcleo |
|----|--------|--------|
| M5 | Base de datos centralizada | PostgreSQL/Supabase, RLS por rol. Clientes, servicios, proveedores, sectores, plantillas de subtareas, históricos. **Núcleo — se construye primero.** |
| M1 | Gestión de tareas + Clientes | Kanban/Lista/Calendario, subtareas asignables, dependencias, @menciones, alertas, vinculación a facturación. Apartado Clientes (ficha 360, segmentación, permisos por asesor). |
| M2 | Presupuestación con IA | Texto libre → Claude consulta catálogo en BBDD → editor libre → envío Resend → agente lector de aceptaciones → crea tarea + subtareas. Requiere M1 y M5. |
| M3 | Vigilancia DOE/BOE | Agente diario lee boletines, clasifica por sector, newsletters segmentadas vía Resend, crea tareas urgentes en M1. Funciona independiente. |
| M4 | Precontabilización OCR | Facturas (PDF/escaneadas) → OCR + Claude → Excel modelo Aplifisa. Memoria de proveedores, semáforo de confianza. Datos en VPS propio. Independiente o con M1. |

**Fuera de alcance (se presupuestan aparte):** nuevas funcionalidades no contempladas en la propuesta
v3 (CRM completo, portal de cliente, app móvil nativa, integraciones contables adicionales).

**Restricciones de producto:**
- La IA nunca asigna subtareas a personas — lo hace siempre el responsable.
- Datos contables/facturas en VPS propio, nunca en nube de terceros.
- Email solo vía Resend desde dominio propio (presupuestos@laramarcos.es).
- Si no hay novedades DOE/BOE, no se envía newsletter.
<!-- @specbox:endzone id="scope" -->

---

<!-- @specbox:zone id="success_metrics" kind="hybrid" -->
## 4. Métricas de éxito

**North Star Metric**: Horas improductivas eliminadas / mes (conecta con el ROI declarado de
~3.200€/mes de ahorro).

**Input metrics:**
1. Facturas precontabilizadas por OCR / mes (M4) — 2-4h → 8-15 min por lote de 50.
2. Presupuestos generados y enviados automáticamente / mes (M2).
3. Gestiones completadas vinculadas a factura / mes (M1) — proxy de "nada sin cobrar".
4. Newsletters DOE/BOE segmentadas + tareas urgentes auto-creadas / mes (M3).

**Objetivo comercial**: recuperación de la inversión (5.600€) en <2 meses tras la entrega.

<!-- engine-entries-below -->
<!-- @specbox:endzone id="success_metrics" -->

---

<!-- @specbox:zone id="roadmap" kind="auto" -->
## 5. Roadmap

_(Auto-gestionada por el engine. Se puebla con los UC al ejecutar `/prd` y `/plan`.)_

Orden de construcción previsto (plan de 8 semanas de la propuesta):
1. **Sem 1** — M5 Base de datos central + auditoría inicial.
2. **Sem 2** — M1 Gestión de tareas + apartado Clientes.
3. **Sem 3-4** — M2 Presupuestación con IA.
4. **Sem 5** — M3 Vigilancia DOE/BOE.
5. **Sem 6-7** — M4 Precontabilización OCR.
6. **Sem 8** — Integración global, pruebas y formación.
<!-- @specbox:endzone id="roadmap" -->

---

<!-- @specbox:zone id="stakeholders" kind="manual" -->
## 6. Stakeholders

- **Cliente / sponsor**: LaraMarcos Asesores — responsable del despacho (decisor, revisor de KPIs).
- **Usuarios**: 20 empleados (asesores fiscal/contable/laboral + administrativos).
- **Proveedor / equipo de desarrollo**: Automatio (Dani Mestre).
- **Terceros de infraestructura**: Anthropic (Claude), Resend, Supabase; VPS propio del despacho.
<!-- @specbox:endzone id="stakeholders" -->

---

*Fuente de requisitos: Propuesta Comercial LaraMarcos Asesores v3 (mayo 2026) + reunión de mayo.*
