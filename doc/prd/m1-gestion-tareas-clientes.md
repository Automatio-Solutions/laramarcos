# PRD: [US-01] Gestión de tareas + apartado Clientes

> Proyecto: laramarcos-asesores · Backend: native · Generado: 2026-06-19
> Discovery: doc/discovery/m1-gestion-tareas-clientes/icp_jtbd.md (READY_FOR_PRD). Módulo 01.

## Resumen

Centro de control del despacho: una plataforma web/móvil-responsive para los 20 empleados con
Kanban + Lista + Calendario, subtareas asignables individualmente, dependencias, @menciones, alertas
automáticas de vencimiento, control de tiempo, plantillas recurrentes y vinculación directa a
facturación. Incluye el apartado **Clientes** (ficha 360, segmentación, permisos por asesor).
Promesa: nada se pierde, nada se olvida, todo se cobra.

## Alcance

### Incluye
- Tres vistas (Kanban/Lista/Calendario) con filtros por persona, categoría, estado, cliente, fecha.
- Subtareas asignables a personas distintas con plazo, estado, comentarios y dependencias propias.
- Alertas (7 días y 48h), escalado al responsable, bloqueos por terceros, dependencias en cascada.
- @menciones, adjuntos (Google Drive), control de tiempo, plantillas recurrentes.
- Vinculación a facturación, dashboard de productividad, notificaciones inteligentes.
- Apartado Clientes: alta/edición, ficha 360, búsqueda/filtros avanzados, permisos por asesor.

### No incluye
- Generación de presupuestos (M2) ni precontabilización (M4).
- Emisión real de facturas en un sistema externo (solo se crea la línea de factura).

---

## User Story

**ID**: US-01 · **Actor**: Responsable, Asesor, Administrativo · **Horas estimadas**: 90h
**Pantallas**: Kanban, Lista, Calendario, Detalle de tarea, Detalle subtarea, Clientes (lista + ficha 360).

> Como equipo del despacho, quiero un centro de control de tareas y clientes donde nada se pierda y
> todo lo completado quede vinculado a facturación, para no olvidar gestiones ni dejar de cobrarlas.

---

## Use Cases

### UC-101: Tablero Kanban + Lista + Calendario
- **Actor**: Asesor · **Horas**: 12h
#### Acceptance Criteria
- [ ] **AC-01**: Las tareas se muestran en tres vistas conmutables (Kanban por estado, Lista, Calendario por fecha límite) sobre los mismos datos.
- [ ] **AC-02**: Se puede filtrar por persona, categoría, estado, cliente y rango de fechas; el asesor ve por defecto sus tareas y el responsable la carga total.
- [ ] **AC-03**: Arrastrar una tarjeta entre columnas del Kanban actualiza su estado y persiste tras recargar.

### UC-102: Subtareas con asignación individual
- **Actor**: Responsable · **Horas**: 12h
#### Acceptance Criteria
- [ ] **AC-04**: Una tarea se descompone en subtareas, cada una asignable a una persona distinta, con plazo y estado propios.
- [ ] **AC-05**: Cada subtarea tiene su propio hilo de comentarios y sus propias dependencias.
- [ ] **AC-06**: La asignación de una subtarea a una persona solo puede hacerla un usuario con rol responsable (la IA nunca asigna).

### UC-103: Fechas límite y alertas automáticas
- **Actor**: Sistema · **Horas**: 8h
#### Acceptance Criteria
- [ ] **AC-07**: El sistema envía email de aviso 7 días y 48h antes del vencimiento al responsable de la tarea/subtarea.
- [ ] **AC-08**: Si una tarea vence sin completarse, se escala por email al responsable del despacho.

### UC-104: Tareas bloqueadas por terceros
- **Actor**: Asesor · **Horas**: 5h
#### Acceptance Criteria
- [ ] **AC-09**: Una tarea puede marcarse "bloqueada por cliente" o "bloqueada por [persona]" con motivo obligatorio.
- [ ] **AC-10**: Mientras está bloqueada, el sistema pausa sus alertas de vencimiento y notifica al desbloquearse.

### UC-105: Comentarios con @menciones
- **Actor**: Asesor · **Horas**: 6h
#### Acceptance Criteria
- [ ] **AC-11**: Cada tarea y subtarea tiene un hilo de comentarios con historial (quién, qué, cuándo).
- [ ] **AC-12**: Escribir @nombre notifica por email/in-app a la persona mencionada.

### UC-106: Adjuntos y documentos (Google Drive)
- **Actor**: Asesor · **Horas**: 7h
#### Acceptance Criteria
- [ ] **AC-13**: Se pueden adjuntar PDFs, Excel, escáneres o contratos a una tarea, integrados con Google Drive.
- [ ] **AC-14**: Los adjuntos son accesibles desde la tarea sin reenvíos por correo.

### UC-107: Dependencias entre tareas y subtareas
- **Actor**: Responsable · **Horas**: 8h
#### Acceptance Criteria
- [ ] **AC-15**: Una tarea/subtarea puede declararse dependiente de otra; no puede pasar a "en curso" hasta que la predecesora esté completada.
- [ ] **AC-16**: Completar una predecesora desbloquea automáticamente sus dependientes en cascada y lo notifica.

### UC-108: Control de tiempo
- **Actor**: Asesor · **Horas**: 6h
#### Acceptance Criteria
- [ ] **AC-17**: Se puede registrar el tiempo dedicado por tarea y subtarea, con historial de timestamps.
- [ ] **AC-18**: El tiempo registrado es consultable para justificar facturación y detectar cuellos de botella.

### UC-109: Plantillas de tareas recurrentes
- **Actor**: Responsable · **Horas**: 7h
#### Acceptance Criteria
- [ ] **AC-19**: Crear una tarea desde plantilla (ej. "Cierre trimestral IVA") genera todas sus subtareas y plazos prefijados con un clic.
- [ ] **AC-20**: Tras crearla, el responsable asigna cada subtarea a la persona correspondiente desde el panel.

### UC-110: Vinculación a facturación
- **Actor**: Sistema · **Horas**: 7h
#### Acceptance Criteria
- [ ] **AC-21**: Marcar una tarea como completada crea automáticamente una línea de factura asociada al cliente.
- [ ] **AC-22**: Existe una vista de líneas de factura pendientes de facturar por cliente, de modo que ninguna gestión completada quede sin cobrar.

### UC-111: Dashboard de productividad y notificaciones
- **Actor**: Responsable · **Horas**: 8h
#### Acceptance Criteria
- [ ] **AC-23**: El dashboard muestra carga por empleado, tareas vencidas, tiempo medio de resolución y cumplimiento de SLA.
- [ ] **AC-24**: Cada empleado recibe un resumen diario matutino por email con sus tareas, configurable por persona.

### UC-112: Apartado Clientes — ficha 360, búsqueda y permisos
- **Actor**: Administrativo · **Horas**: 12h
#### Acceptance Criteria
- [ ] **AC-25**: La ficha 360 de un cliente muestra su histórico: tareas, presupuestos enviados/aceptados, facturas procesadas, comunicaciones y documentos en un único punto.
- [ ] **AC-26**: La búsqueda permite filtrar por CIF, nombre, sector, asesor asignado, estado, importe facturado y fecha de alta, y exportar el resultado.
- [ ] **AC-27**: Un asesor solo ve los clientes que tiene asignados; el responsable ve toda la cartera (consume RLS de M5).

---

## Interacciones UI

### Visualización de datos
| Dato | Volumen | Atributos visibles | Acciones por item |
|------|---------|--------------------|-------------------|
| Tareas | 50-500 activas | título, cliente, responsable, estado, vencimiento | ver, editar, mover, completar, bloquear |
| Subtareas | 0-10 por tarea | título, asignado, plazo, estado | asignar, comentar, completar |
| Clientes | 100-1000 | CIF, razón social, sector, asesor | ver ficha 360, editar |

### Acciones del usuario
| Acción | UC | Frecuencia | Criticidad | Confirmación |
|--------|----|-----------|-----------|--------------|
| Mover tarea en Kanban | UC-101 | Diaria | Baja (reversible) | No |
| Asignar subtarea | UC-102 | Diaria | Media | No |
| Completar tarea (→ factura) | UC-110 | Diaria | Alta (genera cobro) | Sí |
| Bloquear tarea | UC-104 | Ocasional | Media | No |

### Formularios
| Formulario | UC | Campos | Contexto |
|------------|----|--------|----------|
| Nueva tarea / desde plantilla | UC-101/109 | 6-10 | Modal |
| Ficha cliente | UC-112 | 12-18 | Página dedicada |

---

## Audiencia (VEG)

Hereda de doc/app/app_market.md. Targets: ICP-1 Responsable, ICP-2 Asesor, ICP-3 Administrativo.
JTBD racional: nada se pierde, todo se cobra (JR-F1.1/1.2). JTBD emocional: control y tranquilidad
(JE-F1.1/1.2). Expectativa visual: panel denso pero claro, tipo herramienta de productividad
(referentes: Trello/Asana/Linear) con identidad sobria del despacho.

## Requisitos No Funcionales

| NFR | Criterio | Medición |
|-----|----------|----------|
| Rendimiento | Kanban con 500 tareas carga < 2s | Lighthouse / DevTools |
| Seguridad | Permisos por asesor (RLS M5) | Test de aislamiento |
| Fiabilidad alertas | 0 alertas perdidas en cron diario | Test de cron + logs |
| Accesibilidad | WCAG 2.1 AA | axe-core |

## Riesgos

| Riesgo | Prob. | Impacto | Mitigación |
|--------|-------|---------|------------|
| Integración Google Drive (OAuth/cuotas) | Media | Medio | Spike previo + fallback almacenamiento propio |
| Complejidad de dependencias en cascada | Media | Medio | Modelo de grafo simple + tests |
| Adopción del equipo (cambio de hábito) | Media | Alto | Migración de tareas + formación (semana 2) |

---

## Stack y dependencias
- **Frontend**: Next.js App Router, TanStack Query, Tailwind. Drag&drop Kanban.
- **Datos**: tablas `tareas`, `subtareas`, `comentarios`, `dependencias`, `tiempos`, `lineas_factura` en M5.
- **Dependencias**: **requiere M5** (clientes, plantillas de subtareas, RLS). Cron de alertas (n8n o Vercel cron).

---
**Prioridad**: urgent · **Complejidad**: Alta
*Semana 2 de la implementación.*
