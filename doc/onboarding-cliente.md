# Estado del proyecto y qué falta por parte de LaraMarcos

> Documento vivo. Refleja el estado real tras cargar los datos del despacho (2026-08).
> Prioridad: 🔴 crítico (bloquea) · 🟡 importante · ⚪ opcional.

Nota: según la propuesta, los **costes de terceros los contrata y paga el cliente**
(Resend, Supabase Pro, VPS). Automatio los configura.

---

## Estado global

**34 de 40 casos de uso cerrados (84%).** Los 6 que faltan dependen **en su totalidad**
de servicios externos que debe aportar el despacho — no hay trabajo de desarrollo pendiente.

| Módulo | Estado | Nota |
|--------|--------|------|
| M5 Base de datos | ✅ 7/8 | Falta solo backups (Supabase Pro, AC-04 de UC-501) |
| M1 Gestión de tareas + Clientes | ✅ 12/12 | Completo |
| M2 Presupuestación IA | 🔄 6/8 | IA activa. Falta envío Resend (UC-204) y agente lector (UC-206) |
| M3 Vigilancia DOE/BOE | 🔄 4/6 | Clasificación IA activa. Falta newsletters Resend (UC-304) y métricas (UC-306) |
| M4 Precontabilización OCR | 🔄 5/6 | OCR con IA verificado. Falta carpeta en VPS + subida (UC-401) |

---

## ✅ Ya recibido y cargado (no volver a pedir)

| Qué | Estado |
|-----|--------|
| **API de Claude** | ✅ Configurada y funcionando (modelo `claude-opus-4-8`). IA real en M2/M3/M4. |
| **Logo** | ✅ Integrado (login + cabecera). |
| **Tarifario de servicios** | ✅ 49 servicios reales cargados (FSCL/LBRL/RSTS), con IVA y tarifas por hora. |
| **Cartera de clientes** | ✅ **594 clientes** en 4 oficinas: Badajoz 206, Don Benito 178, Orellana 97, Castuera 113. Con IBAN (los de Badajoz compuestos desde el CCC antiguo). |
| **Empleados** | ✅ 15 dados de alta con rol y oficina. RLS por oficina verificado. |
| **Cuarta oficina (Orellana)** | ✅ Añadida al sistema (no estaba contemplada). |
| **Modelo de presupuesto** | ✅ Recibido (2 plantillas: Badajoz y resto con logo antiguo temporal). Datos fiscales: "LARA Y MARCOS ASESORIA Y CONSULTORIA, SL". Pendiente aplicarlo al PDF. |
| **Modelo Aplifisa (libro facturas)** | ✅ Recibido (el de Juanma). Incluye retención IRPF y dos subcuentas; a aplicar al afinar M4. |

---

## 🔴 Lo que falta por parte del despacho (bloquea)

Los 6 UCs pendientes dependen de esto:

| # | Qué | Desbloquea | Prio |
|---|-----|-----------|------|
| 1 | **Resend** (cuenta + API key) **+ acceso al DNS de laramarcos.es** (SPF/DKIM) | UC-204 envío presupuestos, UC-206 agente lector, UC-304 newsletters, UC-306 métricas de apertura. Email de notificaciones. | 🔴 |
| 2 | **Supabase plan Pro** (a su nombre) | Producción + backups diarios → cierra AC-04 de UC-501 (M5 al 100%). | 🔴 |
| 3 | **Acceso al VPS** + **Excel modelo Aplifisa** (ya recibido) + **facturas reales de ejemplo** | UC-401 carpeta por cliente + subida. Completa M4. | 🔴 |
| 4 | **Sector de cada cliente** (o epígrafe/CNAE) | Los Excel de la cartera NO traían sector → M3 no puede segmentar newsletters por actividad. | 🔴 |

---

## 🟡 Decisiones pendientes del despacho

| # | Qué | Estado |
|---|-----|--------|
| D1 | **3 CIF/NIF repetidos** en sus propios listados: `08850507S` (2× Badajoz), `B06373344` (2× Orellana), `78776769K` (Don Benito + Orellana). Se cargó uno de cada. | ¿Duplicados o mismo cliente en dos oficinas? |
| D2 | **Roles**: socios (Antonio, Pascual) = responsable (ven todo); resto = asesor (ven su oficina). | ¿Directores de oficina / Francisco (dirección zona) deben ver más de una sede? |
| D3 | **Cuotas mensuales / igualas**: el tarifario son gestiones puntuales, sin cuota mensual. La función "servicios contratados con evolución de cuota" está construida pero sin servicios reales que enganchar. | ¿Hay hoja de igualas, se negocian por cliente, o no hay? |
| D4 | **174 clientes sin email** y la mayoría de Castuera sin enlace a carpeta. | Solo informativo (no se les puede enviar por correo). |

---

## 🟡 Otros servicios (según se avance)

| # | Qué | Para qué |
|---|-----|----------|
| A5 | **Google Drive** — credenciales OAuth | Adjuntos de tareas (UC-106). |
| A6 | **n8n** — instancia | Scraping DOE/BOE, cola OCR, crons diarios. |
| D-fiscal | **Condiciones generales** del presupuesto | Ya conocidas del modelo (100% por adelantado clientes no vinculados). A confirmar el texto final. |

---

## Estado del entorno de desarrollo (handoff)

- **BBDD**: proyecto Supabase de pruebas (`opgivzunzsmrizqozucs`). Es free-tier: **se auto-pausa** por inactividad; si un día no conecta, reactivar desde el panel de Supabase.
- **Login**: los usuarios demo (`admin@laramarcos.es`…) fueron **eliminados**. Entrar como empleado real: `antonio@laramarcosasesores.es` (dirección, ve todo) o cualquier asesor. Contraseña provisional: `laramarcos2026`.
- **Datos**: solo reales. 594 clientes, 15 empleados, 49 servicios. Cero demo.
- **Scripts útiles**:
  - `npm run catalogo` — recarga el tarifario.
  - `node scripts/importar-cartera.mjs [--dry-run]` — (re)importa la cartera desde `doc/Envio Asesoria/`.
  - `node scripts/limpiar-demo.mjs` — purga cualquier dato demo (idempotente).
- **RGPD**: `doc/Envio Asesoria/` (cartera real, cuentas, datos fiscales) está en `.gitignore`. **Nunca sube al repositorio.**

---

*Actualizado: 2026-08-25.*
