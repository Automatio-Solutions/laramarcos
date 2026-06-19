# Discovery: m1-gestion-tareas-clientes

**Discovery ID**: disc-f03e406d5c12
**Created**: 2026-06-19T09:45:58.078247+00:00
**Status**: READY_FOR_PRD
**Mode**: bootstrap
**Source of inheritance**: doc/app/app_market.md (creado en este mismo flujo bootstrap)

Feature: **Módulo 01 — Gestión de tareas + apartado Clientes**. Centro de control del despacho:
Kanban/Lista/Calendario, subtareas asignables a personas, dependencias, @menciones, alertas de
vencimiento, vinculación a facturación, y apartado Clientes (alta/edición, segmentación por sector,
ficha 360, permisos por asesor).

## ICPs involucrados

Hereda los 3 ICPs canónicos de `app_market.md` (no introduce ninguno nuevo):

- **ICP-1 — Responsable / socio del despacho**: ve la carga total del equipo, asigna subtareas,
  controla que toda gestión completada genere factura.
- **ICP-2 — Asesor (fiscal/contable/laboral)**: vive en su Kanban/Lista, gestiona sus subtareas,
  recibe alertas, comenta con @menciones.
- **ICP-3 — Administrativo / recepción**: da de alta y edita clientes, segmenta por sector, consulta
  la ficha 360 y el seguimiento.

## JTBDs racionales

Heredados de `app_market.md`, instanciados para esta feature:

- **JR-G.1 → JR-F1.1**: Cuando completo una gestión, quiero que se cree automáticamente una línea de
  factura asociada, para que ninguna quede sin cobrar.
- **JR-G.2 → JR-F1.2**: Cuando entra trabajo nuevo, quiero descomponerlo en subtareas asignables a
  personas distintas, con plazo, estado, comentarios y dependencias propias, para que nada se pierda.
- **JR-F1.3**: Cuando se acerca un vencimiento, quiero recibir alertas (7 días y 48h antes) y que
  escale al responsable si vence sin completar, para no depender de la memoria.
- **JR-G.6 → JR-F1.4**: Cuando gestiono la cartera, quiero una ficha 360 del cliente (tareas,
  presupuestos, facturas, documentos, comunicaciones), para tener una sola fuente de verdad.
- **JR-F1.5**: Cuando un trabajo depende de un tercero, quiero marcarlo "bloqueado por cliente/persona"
  con motivo y pausar sus alertas, para que el tablero refleje la realidad.

## JTBDs emocionales

- **JE-G.1 → JE-F1.1**: Sentir **control** — el responsable ve de un vistazo que nada se escapa y
  todo lo completado se cobra.
- **JE-G.2 → JE-F1.2**: **Tranquilidad** — el asesor confía en que las alertas y dependencias evitan
  olvidos; no carga mentalmente con los plazos.

## Validation evidence

**[w] Waiver explícito.** Proyecto a medida para un cliente único (LaraMarcos Asesores). Los JTBDs
provienen de la propuesta comercial v3 (mayo 2026) y de la reunión de mayo con el despacho
(documentada en el PDF: cambios sobre la propuesta anterior, ampliaciones de M1/M2, nuevo apartado
Clientes y BBDD central). No requiere validación con usuarios externos: el ICP es interno y conocido,
y los pain points (gestiones sin cobrar, tareas perdidas, transcripción manual) están confirmados por
el cliente. Razón del waiver: requisitos ya validados con el stakeholder en reunión comercial.

## Drift from app_market

- **Nuevos ICPs introducidos**: ninguno (hereda ICP-1, ICP-2, ICP-3).
- **Nuevos JTBDs introducidos**: ninguno (instancia JR-G.1, JR-G.2, JR-G.6 y detalla alertas,
  bloqueos y dependencias ya implícitos en el alcance del producto).
- **Resolución**: `no_drift`.

## Verdict

**READY_FOR_PRD** — ICPs, JTBDs racionales y emocionales, validation evidence y drift resueltos.

---

> Discovery completado en modo bootstrap. `app_market.md` creado a nivel producto y esta feature
> hereda sin drift. Siguiente paso: `/prd m1-gestion-tareas-clientes`.
