# PRD: [US-03] Vigilancia normativa DOE · BOE

> Proyecto: laramarcos-asesores · Backend: native · Generado: 2026-06-19
> Módulo 03. Funciona independiente (consume sectores de M5 y crea tareas en M1).

## Resumen

Un agente de IA lee el DOE y el BOE cada madrugada, filtra lo relevante por sector usando la
segmentación de la BBDD de clientes, redacta newsletters en lenguaje claro y las envía solo a los
clientes afectados vía Resend. Si detecta una obligación urgente, crea la tarea correspondiente en M1.
El despacho se posiciona como el que siempre va por delante, con cero tiempo de gestión manual.

## Alcance

### Incluye
- Descarga y procesamiento diario automático de DOE + BOE (cron de madrugada, n8n).
- Clasificación por sector con IA usando los sectores definidos en M5.
- Resúmenes accionables por sector (qué cambió, qué hacer, cuándo, enlace oficial).
- Envío de newsletters segmentadas vía Resend con branding; listas dinámicas desde M5; no-send si no hay novedades.
- Creación automática de tareas urgentes en M1 (sin asignar persona).
- Métricas de apertura y engagement por envío.

### No incluye
- Boletines provinciales/DOUE (extensible a futuro, fuera de v1).
- Asesoramiento legal automatizado al cliente (el resumen enlaza al texto oficial).

---

## User Story

**ID**: US-03 · **Actor**: Sistema, Responsable · **Horas estimadas**: 45h
**Pantallas**: Panel de boletines del día, Editor/preview de newsletter, Métricas de envío.

> Como despacho, quiero avisar automáticamente solo a los clientes del sector afectado por una novedad
> del DOE/BOE y crear las tareas urgentes, para ser proactivos sin esfuerzo manual.

---

## Use Cases

### UC-301: Descarga y procesamiento diario de DOE + BOE
- **Actor**: Sistema · **Horas**: 9h
#### Acceptance Criteria
- [ ] **AC-01**: Un job programado (≈06:00) descarga y procesa el DOE y el BOE del día sin intervención manual, vía n8n.
- [ ] **AC-02**: Si la descarga falla, el sistema reintenta y registra el error sin enviar nada erróneo.

### UC-302: Clasificación por sector con IA
- **Actor**: Sistema · **Horas**: 9h
#### Acceptance Criteria
- [ ] **AC-03**: La IA clasifica cada publicación relevante (subvenciones, cambios fiscales, normativa laboral, licitaciones, ayudas, legislación sectorial) por sector usando los sectores de M5.
- [ ] **AC-04**: Las publicaciones sin relevancia para ningún sector del despacho se descartan y no generan newsletter.

### UC-303: Resúmenes accionables por sector
- **Actor**: Sistema · **Horas**: 8h
#### Acceptance Criteria
- [ ] **AC-05**: Para cada sector con novedades, la IA redacta un resumen claro y accionable: qué cambió, qué deben hacer los clientes, plazo y enlace al texto oficial.
- [ ] **AC-06**: El resumen está en lenguaje claro (no legalista) y enlaza directamente al texto oficial.

### UC-304: Envío de newsletters segmentadas vía Resend
- **Actor**: Sistema · **Horas**: 9h
#### Acceptance Criteria
- [ ] **AC-07**: Solo los clientes del sector afectado reciben el email, con la lista construida dinámicamente desde la segmentación de M5 (sin listas paralelas).
- [ ] **AC-08**: El email usa el branding del despacho y se envía vía Resend desde el dominio propio.
- [ ] **AC-09**: Si en un día no hay novedades para ningún sector, no se envía ningún email.

### UC-305: Creación automática de tareas urgentes
- **Actor**: Sistema · **Horas**: 6h
#### Acceptance Criteria
- [ ] **AC-10**: Cuando una novedad implica una obligación urgente, el sistema crea en M1 una tarea (con su plantilla de subtareas si aplica), una por cliente afectado, sin asignar persona.
- [ ] **AC-11**: El responsable del despacho asigna después cada tarea desde el panel.

### UC-306: Métricas de apertura y engagement
- **Actor**: Responsable · **Horas**: 4h
#### Acceptance Criteria
- [ ] **AC-12**: El panel muestra tasa de apertura, clics y subvenciones/temas más consultados por envío (datos de Resend).

---

## Interacciones UI

### Visualización de datos
| Dato | Volumen | Atributos visibles | Acciones por item |
|------|---------|--------------------|-------------------|
| Publicaciones del día | 0-50 | sector, tipo, titular, relevancia | ver, editar resumen, aprobar envío |
| Newsletters enviadas | 0-10/día | sector, nº destinatarios, apertura | ver métricas |

### Acciones del usuario
| Acción | UC | Frecuencia | Criticidad | Confirmación |
|--------|----|-----------|-----------|--------------|
| Revisar/editar resumen antes de enviar | UC-303 | Diaria | Media | No |
| Aprobar envío (si se configura revisión) | UC-304 | Diaria | Alta (sale al cliente) | Sí |

---

## Audiencia (VEG)
Target operativo ICP-1 Responsable (posicionamiento proactivo) y ICP-2 Asesor (revisión rápida). El
destinatario final del email es el cliente del despacho (no usuario de la plataforma). Expectativa
visual newsletter: limpia, branded, lenguaje claro, un CTA al texto oficial.

## Requisitos No Funcionales
| NFR | Criterio | Medición |
|-----|----------|----------|
| Puntualidad | Newsletters listas antes de las 07:00 | Logs del cron |
| Precisión | 0 newsletters a sector no afectado | Test con casos reales |
| No-ruido | 0 emails en días sin novedades | Test de día vacío |
| Entregabilidad | Dominio propio verificado | Headers de envío |

## Riesgos
| Riesgo | Prob. | Impacto | Mitigación |
|--------|-------|---------|------------|
| Cambios de formato/estructura del DOE/BOE | Media | Alto | Parser robusto + alertas de fallo + revisión |
| Falsos positivos de relevancia | Media | Medio | Umbral + opción de revisión humana antes de enviar |
| Volumen de tareas urgentes (1 por cliente) | Baja | Medio | Agrupación y panel de asignación masiva |

---

## Stack y dependencias
- **Automatización**: n8n (descarga/scraping DOE+BOE, orquestación del cron).
- **IA**: Claude (clasificación y redacción).
- **Email**: Resend (mismo dominio que M2).
- **Dependencias**: sectores de **M5**; creación de tareas en **M1** (integración, no bloqueante para el envío).

---
**Prioridad**: high · **Complejidad**: Media-Alta
*Semana 5 de la implementación.*
