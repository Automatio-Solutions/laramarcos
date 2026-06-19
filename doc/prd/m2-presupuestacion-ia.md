# PRD: [US-02] Presupuestación automática con IA

> Proyecto: laramarcos-asesores · Backend: native · Generado: 2026-06-19
> Módulo 02. **Requiere M1 y M5.**

## Resumen

El empleado describe la gestión en texto libre. Claude consulta el catálogo de servicios y precios de
la BBDD central (no Excel externo), redacta el presupuesto con la plantilla del despacho, permite
editarlo libremente, lo envía con Resend desde el dominio propio y un agente IA lector de respuestas
detecta las aceptaciones para crear automáticamente la tarea + subtareas por plantilla. La asignación
de cada subtarea a una persona la hace siempre el responsable.

## Alcance

### Incluye
- Generación de presupuesto desde texto libre consultando catálogo en BBDD (<30s).
- Editor visual 100% libre (líneas, precios, cantidades, descripciones, descuentos, condiciones).
- Plantilla con branding y datos de cliente auto-rellenados desde M1/M5.
- Envío con Resend desde dominio propio con tracking de entrega y apertura.
- Aceptación digital con firma (enlace, timestamp, IP) y aceptación manual desde panel.
- Agente IA lector que clasifica respuestas (aceptación/cambios/rechazo/pregunta).
- Creación automática de tarea + subtareas plantilla al aceptar; seguimiento, recurrentes, conversión a factura.

### No incluye
- Decisión automática de quién ejecuta cada subtarea (lo hace el responsable).
- Emisión fiscal de la factura final (se prepara la conversión; la factura se emite donde corresponda).

---

## User Story

**ID**: US-02 · **Actor**: Asesor, Responsable · **Horas estimadas**: 70h
**Pantallas**: Generador (texto libre), Editor de presupuesto, Envío, Seguimiento, Bandeja del agente lector.

> Como asesor, quiero generar y enviar un presupuesto en menos de un minuto y que, al aceptarlo el
> cliente, se cree sola la tarea con sus subtareas, para responder rápido y no olvidar facturar.

---

## Use Cases

### UC-201: Generación desde texto libre con catálogo en BBDD
- **Actor**: Asesor · **Horas**: 12h
#### Acceptance Criteria
- [ ] **AC-01**: Dada una descripción en lenguaje natural, Claude consulta vía API la tabla de servicios/precios de M5 (sin enviar Excel) e identifica los servicios y precios aplicables.
- [ ] **AC-02**: El presupuesto se genera en menos de 30 segundos con los datos del cliente auto-rellenados desde M5.
- [ ] **AC-03**: Si la descripción es ambigua o no hay servicio claro, el sistema lo señala en vez de inventar un precio.

### UC-202: Editor visual libre del presupuesto
- **Actor**: Asesor · **Horas**: 10h
#### Acceptance Criteria
- [ ] **AC-04**: El editor inline permite añadir, eliminar y modificar líneas (concepto, cantidad, precio, descripción).
- [ ] **AC-05**: Se pueden aplicar descuentos y editar las condiciones generales antes de enviar, recalculando el total en tiempo real.

### UC-203: Plantilla con branding y datos del cliente
- **Actor**: Sistema · **Horas**: 7h
#### Acceptance Criteria
- [ ] **AC-06**: El PDF del presupuesto incluye logo, colores, condiciones generales, datos fiscales y pie de firma del despacho automáticamente.
- [ ] **AC-07**: Los datos del cliente (razón social, CIF, dirección) se rellenan desde la ficha de M5 sin reescritura.

### UC-204: Envío con Resend desde dominio propio
- **Actor**: Asesor · **Horas**: 9h
#### Acceptance Criteria
- [ ] **AC-08**: El botón "Enviar al cliente" envía el email vía Resend desde presupuestos@laramarcos.es con el PDF adjunto y un enlace de aceptación digital.
- [ ] **AC-09**: El panel registra el estado de entrega y apertura del email (tracking de Resend).

### UC-205: Aceptación digital con firma
- **Actor**: Cliente · **Horas**: 8h
#### Acceptance Criteria
- [ ] **AC-10**: El cliente acepta con un clic en el enlace; queda registrado con timestamp y dirección IP.
- [ ] **AC-11**: También se admite aceptación manual desde el panel por un empleado, con registro de quién y cuándo.

### UC-206: Agente IA lector de respuestas
- **Actor**: Sistema · **Horas**: 12h
#### Acceptance Criteria
- [ ] **AC-12**: Un agente conectado al buzón de presupuestos clasifica cada respuesta entrante en: aceptación, cambios solicitados, rechazo o pregunta.
- [ ] **AC-13**: Solo cuando la aceptación es inequívoca (clic en el enlace o respuesta afirmativa clara) el agente dispara la creación de la tarea; en caso de duda, marca para revisión humana.

### UC-207: Creación automática de tarea + subtareas plantilla
- **Actor**: Sistema · **Horas**: 8h
#### Acceptance Criteria
- [ ] **AC-14**: Al detectar aceptación, el sistema crea la tarea en M1 e instancia la plantilla de subtareas del servicio (con plazos), sin asignar personas.
- [ ] **AC-15**: La asignación de cada subtarea a un asesor la realiza después el responsable desde el panel; el agente nunca decide quién hace qué.

### UC-208: Seguimiento, recurrentes y conversión a factura
- **Actor**: Responsable · **Horas**: 8h
#### Acceptance Criteria
- [ ] **AC-16**: El panel lista todos los presupuestos por estado (enviado, abierto, aceptado, rechazado, pendiente) y alerta si uno lleva X días sin respuesta.
- [ ] **AC-17**: Para servicios fijos, el sistema genera y envía el presupuesto automáticamente cada período (recurrentes).
- [ ] **AC-18**: Un presupuesto aceptado puede convertirse en factura tras completarse la tarea, cerrando el ciclo en la plataforma.

---

## Interacciones UI

### Visualización de datos
| Dato | Volumen | Atributos visibles | Acciones por item |
|------|---------|--------------------|-------------------|
| Presupuestos | 30-100/mes | cliente, total, estado, fecha envío | ver, editar, enviar, duplicar |
| Líneas de presupuesto | 1-15 por presupuesto | concepto, cantidad, precio, descuento | añadir, editar, borrar |
| Respuestas del buzón | 30-100/mes | cliente, clasificación IA, fecha | revisar, confirmar aceptación |

### Acciones del usuario
| Acción | UC | Frecuencia | Criticidad | Confirmación |
|--------|----|-----------|-----------|--------------|
| Generar presupuesto | UC-201 | Frecuente | Baja | No |
| Enviar al cliente | UC-204 | Frecuente | Alta (sale al exterior) | Sí |
| Confirmar aceptación dudosa | UC-206 | Ocasional | Alta | Sí |

### Formularios
| Formulario | UC | Campos | Contexto |
|------------|----|--------|----------|
| Generador texto libre | UC-201 | 1 (textarea) | Página |
| Editor de presupuesto | UC-202 | tabla dinámica | Página |

---

## Audiencia (VEG)
Hereda de app_market.md. Target principal ICP-2 Asesor (rapidez, editor libre) y ICP-1 Responsable
(control de aceptaciones y conversión). Expectativa visual: generación tipo "IA → resultado en
segundos", editor tipo hoja de presupuesto profesional con branding.

## Requisitos No Funcionales
| NFR | Criterio | Medición |
|-----|----------|----------|
| Rendimiento IA | Presupuesto generado < 30s | Medición end-to-end |
| Coste IA | Consulta estructurada a BBDD, no envío de Excel | Conteo de tokens por presupuesto |
| Entregabilidad | SPF/DKIM verificados en dominio propio | Test de envío + headers |
| Precisión agente | 0 falsos positivos de aceptación (preferir revisión) | Test con corpus de respuestas |

## Riesgos
| Riesgo | Prob. | Impacto | Mitigación |
|--------|-------|---------|------------|
| Agente clasifica mal una aceptación | Media | Alto | Umbral conservador + revisión humana en duda |
| Entregabilidad email (spam) | Media | Alto | Dominio propio verificado, warm-up, dominio dedicado |
| Precios desactualizados | Baja | Medio | Catálogo único en M5, lectura en vivo |

---

## Stack y dependencias
- **IA**: Claude (Anthropic) con tool-use sobre API de catálogo (M5).
- **Email**: Resend (envío + webhook de respuestas/eventos hacia un Route Handler de Next.js).
- **Dependencias**: **requiere M5** (catálogo, plantillas) y **M1** (creación de tarea+subtareas).

---
**Prioridad**: high · **Complejidad**: Alta
*Semanas 3-4 de la implementación.*
