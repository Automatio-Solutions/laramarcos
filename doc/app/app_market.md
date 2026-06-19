# app_market — laramarcos-asesores

> Documento canónico de mercado del producto. Define **para quién** es la plataforma y **qué
> trabajos** resuelve. Lo heredan `/discovery`, `/prd` y `/plan`. Generado en bootstrap (jun 2026).
>
> Contexto: plataforma de gestión interna a medida para **LaraMarcos Asesores** (gestoría, 20
> empleados, Extremadura). 5 módulos sobre BBDD central. Cliente único; ICPs = roles internos.

---

## ICPs primarios

<!-- zone: icps_primary -->

### ICP-1 — Responsable / socio del despacho
Dirige LaraMarcos. Su éxito es que el despacho funcione "sin papel, sin olvidos, sin ineficiencias".
- **Quiere**: control total de la carga del equipo, que ninguna gestión quede sin cobrar, posicionar
  el despacho como proactivo ante clientes, decidir quién hace qué.
- **Decisiones que dispara**: dashboards y KPIs sobre detalle operativo; asignación humana de
  subtareas (el responsable asigna, nunca la IA); visibilidad de presupuestos y facturación.
- **Sanity check (3 personas concretas)**: ✅ identificable — la dirección de LaraMarcos y de
  cualquier despacho cliente de Automatio.

### ICP-2 — Asesor (fiscal / contable / laboral)
El empleado que ejecuta las gestiones del día a día. Es quien más toca la herramienta.
- **Quiere**: no perder ni olvidar tareas, no transcribir facturas campo a campo, generar
  presupuestos en segundos, recibir alertas claras antes de los vencimientos.
- **Decisiones que dispara**: vista Kanban/Lista/Calendario por persona, editor de presupuestos
  libre, semáforo de confianza en OCR, plantillas de subtareas recurrentes.
- **Sanity check**: ✅ identificable — los ~15-18 asesores del equipo de LaraMarcos.

### ICP-3 — Administrativo / recepción
Soporte operativo: alta de clientes, subida de facturas, seguimiento de presupuestos enviados.
- **Quiere**: dar de alta clientes sin errores (validación CIF/IBAN), subir lotes de facturas
  rápido, ver el estado de los presupuestos (enviado/abierto/aceptado).
- **Decisiones que dispara**: formularios con validación, importación masiva Excel/CSV, panel de
  seguimiento de presupuestos.
- **Sanity check**: ✅ identificable — el personal administrativo del despacho.

---

## No-ICPs (anti-mercado)

<!-- zone: no_icps -->

- **Grandes asesorías (>100 empleados) con ERP propio** — ya tienen suite contable integrada; el
  encaje con Aplifisa y el VPS propio no aplica.
- **Autónomos / freelancers sin equipo** — no necesitan asignación de tareas ni carga de equipo; el
  valor de coordinación desaparece.
- **Despachos que no trabajan con Aplifisa** — el módulo OCR (M4) está calibrado para el Excel
  modelo de Aplifisa; sin él, M4 pierde su diferenciador.
- **Clientes finales del despacho (PYMES asesoradas)** — son destinatarios de newsletters y
  presupuestos, no usuarios de la plataforma.

---

## JTBDs racionales globales

<!-- zone: jtbds_rational -->

- **JR-G.1**: Cuando completo una gestión, quiero que quede registrada y vinculada a una línea de
  factura, para que ninguna gestión se quede sin cobrar.
- **JR-G.2**: Cuando entra trabajo nuevo, quiero descomponerlo en subtareas asignables con plazos y
  dependencias, para que nada se pierda ni se olvide y cada persona sepa qué le toca.
- **JR-G.3**: Cuando un cliente pide un presupuesto, quiero generarlo en <30s con precios actuales y
  enviarlo desde el dominio del despacho, para responder rápido sin trabajo manual ni errores.
- **JR-G.4**: Cuando recibo un lote de facturas, quiero precontabilizarlas automáticamente al Excel
  modelo de Aplifisa, para no transcribir campo a campo ni cometer errores de transcripción.
- **JR-G.5**: Cuando se publica normativa en DOE/BOE, quiero avisar solo a los clientes del sector
  afectado y crear las tareas urgentes, para posicionar al despacho como proactivo sin esfuerzo.
- **JR-G.6**: Cuando gestiono la cartera, quiero una ficha 360 del cliente con todo su histórico,
  para tener una sola fuente de verdad en lugar de Excels sueltos.

---

## JTBDs emocionales globales

<!-- zone: jtbds_emotional -->

- **JE-G.1**: Sentir **control** — saber que nada se escapa, nada se olvida y todo se cobra.
- **JE-G.2**: **Tranquilidad de cierre** — no la ansiedad de "¿se me ha pasado algo?" en plazos y
  vencimientos.
- **JE-G.3**: **Orgullo profesional** — ser percibidos por los clientes como el despacho que va por
  delante, no el que reacciona tarde.

---

## North Star Metric

<!-- zone: north_star -->

**NSM — Horas improductivas eliminadas / mes.** Horas de trabajo manual evitadas gracias a la
plataforma (OCR, presupuestación, alertas y avisos automáticos). Conecta con el ROI declarado en la
propuesta (~3.200€/mes de ahorro estimado). Es la prueba directa de la promesa "sin ineficiencias".

**Input metrics:**
1. **Facturas precontabilizadas por OCR / mes** (M4) — vs tiempo manual equivalente (2-4h por lote
   de 50 → 8-15 min).
2. **Presupuestos generados y enviados automáticamente / mes** (M2) — minutos de intervención humana
   por presupuesto.
3. **Gestiones completadas vinculadas a factura / mes** (M1) — proxy de "nada sin cobrar".
4. **Newsletters DOE/BOE segmentadas y tareas urgentes auto-creadas / mes** (M3).

---

## Posicionamiento competitivo

<!-- zone: positioning -->

No es un Trello genérico ni un OCR suelto: es una **plataforma vertical para gestorías** donde los 5
módulos hablan entre sí sobre una BBDD central. El diferenciador es la **integración end-to-end**
(DOE→tarea, presupuesto aceptado→tarea+subtareas→factura, factura→Aplifisa) y el respeto a la
infraestructura existente del despacho (VPS propio para datos sensibles, Excel modelo Aplifisa).

---

## Principios anti-feature

<!-- zone: anti_feature_principles -->

- **La IA propone, el humano decide.** Ninguna asignación de subtareas a personas la hace la IA: la
  hace siempre el responsable. Las aceptaciones de presupuesto solo crean tarea cuando son inequívocas.
- **Datos sensibles nunca salen del despacho.** Ficheros contables/facturas viven en el VPS propio.
- **Nada de ruido.** Si no hay novedades en DOE/BOE, no se envía newsletter. Las alertas son
  accionables, no decorativas.
- **Una sola fuente de verdad.** Nada vuelve a Excels sueltos: todo en la BBDD central validada.

---

## Exportable copy (auto-derivada)

<!-- zone: exportable_copy -->

- **Landing headline**: "El despacho sin papel, sin olvidos y sin gestiones sin cobrar."
- **Elevator pitch**: "Una plataforma con 5 módulos conectados sobre una base de datos central que
  automatiza la gestión de tu asesoría: tareas y clientes, presupuestos con IA, vigilancia DOE/BOE,
  precontabilización OCR a Aplifisa. Recuperas la inversión en menos de 2 meses."
- **LinkedIn post**: "Digitalizamos LaraMarcos Asesores de punta a punta: presupuestos en 20s,
  facturas precontabilizadas solas, normativa del DOE/BOE avisada al cliente afectado el mismo día.
  ~3.200€/mes recuperados. Así trabaja una gestoría que va por delante. #Asesoría #IA #Automatización"

---

*Generado en bootstrap por `/discovery` · Engine v6.11.0 · 2026-06-19*
