# Checklist — Qué necesitamos de LaraMarcos Asesores

> Para la visita. Todo lo que el cliente debe proporcionar/decidir para poner en producción
> los módulos ya construidos (M5, M1, M2, M3) y completar lo pendiente (M2/M3 envíos, M4 OCR).
> Prioridad: 🔴 crítico (bloquea) · 🟡 importante · ⚪ opcional.

Nota: según la propuesta (pág. 19), los **costes de terceros los contrata y paga el cliente**
directamente (Anthropic, Resend, Supabase, VPS). Automatio los configura.

---

## A. Cuentas y API keys (servicios externos)

| # | Qué | Para qué (módulo) | Prio | Coste aprox. |
|---|-----|-------------------|------|--------------|
| A1 | **Anthropic (Claude) — API key** | IA real: presupuestos (M2), clasificación/redacción DOE-BOE (M3), OCR semántico (M4), agente lector (M2). Hoy va con fallback. | 🔴 | ~10€/mes |
| A2 | **Resend — cuenta + API key** | Envío de presupuestos (M2), newsletters (M3), métricas de apertura, agente lector de respuestas (M2). | 🔴 | ~20€/mes Pro |
| A3 | **Supabase — proyecto en plan Pro** (a su nombre) | Producción + **backups diarios** (cierra AC-04). El proyecto actual de pruebas es de otra cuenta. | 🔴 | ~25€/mes |
| A4 | **VPS propio del despacho — acceso seguro** (SSH/endpoint + credenciales) | M4: carpetas por cliente + OCR. La propuesta exige datos contables en VPS, **no en nube**. | 🔴 (para M4) | ya lo tienen |
| A5 | **Google Workspace / Drive — credenciales OAuth** (client_id + secret) o cuenta de servicio | Adjuntos de tareas (UC-106) e integración documental. | 🟡 | incluido en su Workspace |
| A6 | **n8n — instancia + credenciales** (cloud o en su VPS) | Flujos pesados: scraping DOE+BOE (M3), cola de OCR (M4), disparo de crons diarios. | 🟡 | según hosting |
| A7 | **Google Stitch — login OAuth** | Materializar el design system (el endpoint pide OAuth, no API key). Solo afecta a generación de diseños. | ⚪ | gratis |

---

## B. Dominio y correo (para Resend)

| # | Qué | Prio |
|---|-----|------|
| B1 | Confirmar dominio **laramarcos.es** y **acceso a su DNS** para añadir registros **SPF / DKIM / DMARC** (Resend). | 🔴 |
| B2 | Confirmar el buzón **presupuestos@laramarcos.es** (remitente de presupuestos y newsletters). | 🔴 |
| B3 | Método de **recepción de respuestas** para el agente lector (M2): Resend inbound o reenvío del buzón a un webhook. | 🟡 |
| B4 | Confirmar el correo del **DOE de Extremadura** / su web para el scraping (el BOE ya tiene API abierta; el DOE hay que confirmar la fuente). | 🟡 |

---

## C. Datos del negocio (carga inicial en la BBDD — M5)

> Idealmente en Excel/CSV; los importamos con validación automática (UC-507).

| # | Qué | Detalle | Prio |
|---|-----|---------|------|
| C1 | **Cartera de clientes** | CIF/NIF, razón social, dirección, contactos, email, teléfono, IBAN, condiciones de pago, tarifas pactadas, asesor asignado. | 🔴 |
| C2 | **Catálogo de servicios y precios** | Nombre, categoría, precio base, condiciones por defecto. | 🔴 |
| C3 | **Sectores** del despacho | Lista (Hostelería, Construcción, Agricultura…) **y a qué sector pertenece cada cliente** (alimenta las newsletters M3). | 🔴 |
| C4 | **Plantillas de subtareas por servicio** | Ej. *Constitución SL* → notaría, alta censal, alta SS, ROI… con **plazos relativos** (días). Se instancian al aceptar un presupuesto. | 🟡 |
| C5 | **Plantillas de tareas recurrentes** | Ej. *Cierre trimestral IVA* con sus subtareas y plazos. | 🟡 |
| C6 | **Proveedores habituales** | CIF, subcuenta habitual, tipo de IVA por defecto (memoria del OCR — M4). | 🟡 (para M4) |

---

## D. Identidad y plantillas (presupuestos M2 / newsletters M3)

| # | Qué | Prio |
|---|-----|------|
| D1 | **Logo** del despacho (vectorial SVG o PNG alta resolución). | 🔴 |
| D2 | **Colores corporativos** — confirmar (tenemos navy `#1F223E` + gris `#828999` del logo). | 🟡 |
| D3 | **Datos fiscales del despacho** (razón social, CIF, dirección, pie de firma) para el PDF de presupuestos. | 🔴 |
| D4 | **Condiciones generales** del presupuesto (texto legal, validez por defecto, forma de pago). | 🔴 |
| D5 | Su **plantilla/estilo actual** de presupuesto y de newsletter (si la tienen) para replicar. | ⚪ |

---

## E. Modelo contable (M4 — Precontabilización OCR)

| # | Qué | Prio |
|---|-----|------|
| E1 | **Excel modelo de Aplifisa** — el fichero exacto, con sus columnas, orden y nombres, para volcar el OCR en ese formato. | 🔴 (para M4) |
| E2 | **Facturas reales de ejemplo** (PDF nativas y escaneadas) para calibrar el OCR. | 🔴 (para M4) |
| E3 | **Plan de subcuentas** habituales por proveedor (600, 628, 410…). | 🟡 |

---

## F. Usuarios y configuración operativa

| # | Qué | Prio |
|---|-----|------|
| F1 | **Lista de los 20 empleados** (nombre + email) con su **rol**: responsable / asesor / administrativo. Para crear usuarios y permisos (RLS). | 🔴 |
| F2 | Identificar al/los **responsable(s)** del despacho (reciben escalados y alertas de vencimiento). | 🔴 |
| F3 | **Categorías de tareas** y **estados/SLAs** que usan (avisos 7 días / 48h ya por defecto — confirmar). | 🟡 |
| F4 | Confirmar **permisos**: cada asesor ve solo sus clientes, el responsable ve toda la cartera. | 🟡 |
| F5 | Qué **servicios son recurrentes** y con qué periodicidad (presupuestos recurrentes M2). | ⚪ |

---

## G. Decisiones de producto

| # | Decisión | Estado actual | Prio |
|---|----------|---------------|------|
| G1 | **Canal de notificaciones**: hoy **in-app** (campanita). ¿Quieren también **email** vía Resend? | in-app listo; email pendiente de A2 | 🟡 |
| G2 | **App móvil nativa** o **web responsive**. La propuesta menciona "web y móvil"; hoy es web responsive. | web responsive | 🟡 |
| G3 | **Adjuntos**: Google Drive (propuesta) o Supabase Storage. | a decidir | 🟡 |
| G4 | Dónde se **aloja la app** (Vercel — a nombre de quién) y dónde corren los **crons diarios** (Vercel cron o n8n): alertas, resumen diario, presupuestos recurrentes, DOE/BOE. | a decidir | 🟡 |

---

## Resumen de lo que desbloquea cada cosa

- **Anthropic key (A1)** → IA real en M2/M3/M4 (hoy fallback).
- **Resend (A2) + dominio/DNS (B1-B2)** → M2 envío presupuestos + agente lector (UC-204/206), M3 envío newsletters + métricas (UC-304/306), email de notificaciones (G1).
- **Supabase Pro (A3)** → producción + backups (AC-04, cierra UC-501 al 100%).
- **VPS (A4) + Excel Aplifisa (E1) + facturas (E2)** → M4 completo.
- **Drive (A5)** → adjuntos (UC-106, cierra M1 al 100%).
- **n8n (A6)** → scraping DOE/DOE + cola OCR + crons.
- **Datos C1-C6** → arranque real con su cartera/catálogo/sectores.
- **Identidad D1-D4** → presupuestos y newsletters con su marca.
- **Usuarios F1-F2** → alta de los 20 empleados y permisos.

---

## Estado actual del desarrollo (para contexto en la reunión)

| Módulo | Estado | Nota |
|--------|--------|------|
| M5 Base de datos | ✅ 8/8 | Completo y verificado |
| M1 Gestión de tareas | ✅ 11/12 | Falta UC-106 adjuntos (necesita Drive, A5) |
| M2 Presupuestación IA | 🔄 6/8 | Falta envío Resend y agente lector (A2) |
| M3 Vigilancia DOE/BOE | 🔄 4/6 | Falta envío newsletters y métricas (A2) |
| M4 Precontabilización OCR | ⏳ 0 | Pendiente de arrancar (necesita E1/E2, A1, A4) |

Todo lo construido funciona hoy con **fallbacks** (sin las keys): la IA usa coincidencia
determinista, las notificaciones son in-app, y los envíos quedan "pendientes de envío".
Al recibir las keys, se activan sin reescribir nada.
