# PRD: [US-05] Base de datos centralizada (núcleo)

> Proyecto: laramarcos-asesores · Backend: native · Generado: 2026-06-19
> Hereda de doc/app/app_prd.md + app_spec.md. Módulo 05 de la propuesta v3.

## Resumen

El núcleo del sistema. Toda la información del despacho deja de vivir en Excel/Sheets sueltos y pasa
a una **base de datos central PostgreSQL (Supabase)** con Row Level Security por rol: clientes,
servicios, proveedores, precios, sectores, plantillas de subtareas e históricos. Una sola fuente de
verdad que alimenta en tiempo real a los otros cuatro módulos vía API estructurada (menos coste de IA,
validación en el alta, búsquedas instantáneas, auditoría de cambios).

## Alcance

### Incluye
- Esquema PostgreSQL en Supabase con RLS por rol (responsable ve toda la cartera; asesor solo lo suyo).
- CRUD de clientes, servicios/precios, proveedores, sectores y plantillas de subtareas.
- Validaciones automáticas (CIF/NIF, IBAN, email, duplicados) en el alta.
- Importación/exportación masiva Excel/CSV con validación.
- Históricos consultables y auditoría de cambios (quién, cuándo, qué).
- API segura para que los módulos M1-M4 consulten/escriban.

### No incluye
- Lógica de negocio de los módulos consumidores (vive en M1-M4).
- Migración de datos productivos reales (se hace en la fase de implantación, semana 1).

---

## User Story

**ID**: US-05 · **Actor**: Responsable + Administrativo · **Horas estimadas**: 60h
**Pantallas**: Panel BBDD (clientes, servicios, proveedores, sectores, plantillas), Importador, Auditoría.

> Como responsable/administrativo del despacho, quiero una base de datos central validada y auditable
> que sustituya los Excel sueltos, para tener una sola fuente de verdad conectada a todos los módulos.

---

## Use Cases

### UC-501: Esquema PostgreSQL en Supabase con RLS por rol
- **Actor**: Sistema / DBInfra · **Horas**: 10h · **Pantallas**: —
#### Acceptance Criteria
- [ ] **AC-01**: Existen las tablas `clientes`, `servicios`, `proveedores`, `sectores`, `cliente_sectores`, `plantillas_subtareas`, `auditoria` con claves foráneas e índices, creadas vía migración versionada en `supabase/migrations/`.
- [ ] **AC-02**: RLS activado en todas las tablas; un usuario con rol `asesor` solo puede leer/editar filas de clientes donde `asesor_id = auth.uid()`, verificado con un test de aislamiento que falla si accede a un cliente ajeno.
- [ ] **AC-03**: Un usuario con rol `responsable` lee toda la cartera; el test de aislamiento confirma acceso completo.
- [ ] **AC-04**: Backups diarios automáticos habilitados (Supabase Pro) y verificable en la configuración del proyecto.

### UC-502: Gestión de clientes (CRUD) con validación
- **Actor**: Administrativo · **Horas**: 10h · **Pantallas**: Lista clientes, Form cliente
#### Acceptance Criteria
- [ ] **AC-05**: El formulario de alta guarda datos fiscales (CIF/NIF, razón social, dirección), contactos, sector(es), asesor asignado, condiciones de pago y tarifas pactadas.
- [ ] **AC-06**: Al introducir un CIF/NIF con formato inválido, se muestra error inline bajo el campo y el guardado se bloquea (validación de dígito de control española).
- [ ] **AC-07**: Al introducir un IBAN inválido, se muestra error inline y se bloquea el guardado (validación módulo 97).
- [ ] **AC-08**: Al intentar dar de alta un cliente con un CIF ya existente, el sistema avisa de duplicado y no crea el registro.

### UC-503: Catálogo de servicios y precios (CRUD)
- **Actor**: Responsable · **Horas**: 8h · **Pantallas**: Lista servicios, Form servicio
#### Acceptance Criteria
- [ ] **AC-09**: Desde un panel propio se pueden crear/editar/borrar servicios con nombre, categoría, precio base, condiciones por defecto y plantilla de subtareas asociada.
- [ ] **AC-10**: Un cambio de tarifa queda registrado con timestamp y queda disponible vía API para que M2 use siempre la versión más reciente.

### UC-504: Proveedores (CRUD) con memoria contable
- **Actor**: Administrativo · **Horas**: 6h · **Pantallas**: Lista proveedores, Form proveedor
#### Acceptance Criteria
- [ ] **AC-11**: Cada proveedor almacena CIF, subcuenta habitual, tipo de IVA por defecto y formato de factura aprendido.
- [ ] **AC-12**: La API expone, dado un CIF de proveedor, su subcuenta y tipo de IVA por defecto en <200ms para consumo de M4.

### UC-505: Sectores y segmentación
- **Actor**: Responsable · **Horas**: 6h · **Pantallas**: Sectores, asignación en ficha cliente
#### Acceptance Criteria
- [ ] **AC-13**: Se pueden definir sectores del despacho y asignar uno o varios a cada cliente (relación N:M).
- [ ] **AC-14**: La API devuelve la lista de clientes de un sector dado, lista para que M3 construya las listas de envío sin mantenimiento manual.

### UC-506: Plantillas de subtareas por servicio
- **Actor**: Responsable · **Horas**: 6h · **Pantallas**: Editor de plantillas
#### Acceptance Criteria
- [ ] **AC-15**: Cada servicio puede tener una plantilla de subtareas con pasos y plazos relativos (días desde inicio).
- [ ] **AC-16**: La API permite instanciar una plantilla (devolver las subtareas con plazos calculados) para que M2 cree la tarea al aceptar un presupuesto.

### UC-507: Importación / exportación masiva
- **Actor**: Administrativo · **Horas**: 8h · **Pantallas**: Importador
#### Acceptance Criteria
- [ ] **AC-17**: Al subir un Excel/CSV de clientes, el sistema valida CIFs y detecta duplicados, mostrando un informe de filas válidas/rechazadas antes de confirmar la carga.
- [ ] **AC-18**: Cualquier tabla o consulta puede exportarse a Excel/CSV en cualquier momento.

### UC-508: Históricos y auditoría
- **Actor**: Responsable · **Horas**: 6h · **Pantallas**: Auditoría, Ficha histórica
#### Acceptance Criteria
- [ ] **AC-19**: Toda creación/edición/borrado registra en `auditoria` el usuario, timestamp, tabla, registro y diff de campos modificados.
- [ ] **AC-20**: La auditoría es consultable y filtrable por usuario, tabla y rango de fechas.

---

## Interacciones UI

### Visualización de datos
| Dato | Volumen | Atributos visibles | Acciones por item |
|------|---------|--------------------|-------------------|
| Clientes | 100-1000 | CIF, razón social, sector, asesor, estado | ver, editar, borrar, ficha 360 |
| Servicios | 20-100 | nombre, categoría, precio | ver, editar, borrar |
| Proveedores | 100-2000 | CIF, subcuenta, IVA | ver, editar |
| Registros auditoría | miles | usuario, fecha, tabla, diff | ver, filtrar |

### Acciones del usuario
| Acción | UC | Frecuencia | Criticidad | Confirmación |
|--------|----|-----------|-----------|--------------|
| Alta cliente | UC-502 | Frecuente | Media | No |
| Importar cartera | UC-507 | Rara | Alta (masiva) | Sí |
| Cambiar tarifa servicio | UC-503 | Ocasional | Media | No |
| Borrar registro | varios | Rara | Alta (irreversible) | Sí |

---

## Requisitos No Funcionales

| NFR | Criterio | Medición |
|-----|----------|----------|
| Seguridad | RLS por rol, aislamiento por asesor | Test de aislamiento automatizado |
| Integridad | Validación CIF/NIF/IBAN/duplicados en alta | Tests unitarios de validadores |
| Rendimiento | Consultas API a servicios/proveedores < 200ms | Medición en endpoint |
| Auditoría | 100% de mutaciones registradas | Test de cobertura de triggers |
| Backups | Diarios automáticos | Config Supabase |

## Riesgos

| Riesgo | Prob. | Impacto | Mitigación |
|--------|-------|---------|------------|
| Calidad de datos en la cartera Excel actual | Alta | Medio | Informe de validación en import + corrección previa |
| Diseño de RLS incorrecto expone datos | Media | Alto | Tests de aislamiento obligatorios antes de merge |
| Esquema cambia al avanzar M1-M4 | Media | Medio | Migraciones versionadas, no edición destructiva |

---

## Stack y dependencias
- **DB**: Supabase PostgreSQL, RLS. Migraciones en `supabase/migrations/`.
- **API**: Next.js Route Handlers / Supabase client con políticas RLS.
- **Dependencias**: ninguna (es el núcleo; el resto depende de M5).

---
**Prioridad**: urgent · **Complejidad**: Alta
*Núcleo — se construye primero (semana 1).*
