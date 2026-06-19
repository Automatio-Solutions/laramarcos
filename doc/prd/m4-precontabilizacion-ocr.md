# PRD: [US-04] Precontabilización automática con OCR e IA

> Proyecto: laramarcos-asesores · Backend: native · Generado: 2026-06-19
> Módulo 04. Independiente o con M1. Datos sensibles en VPS propio.

## Resumen

El personal sube las facturas de un cliente a una carpeta en el VPS propio. La IA las lee e interpreta
(digitales y escaneadas), asigna subcuentas por histórico del proveedor y vuelca toda la información
en el Excel modelo de Aplifisa que ya usa la gestoría, con un semáforo de confianza por fila. Sin
introducción manual de datos, sin errores de transcripción. Los datos contables nunca salen del VPS.

## Alcance

### Incluye
- Carpeta por cliente en el VPS propio, sincronizada con la BBDD de clientes (M5).
- OCR + interpretación semántica con Claude (proveedor, CIF, fecha, concepto, base, tipo y cuota de IVA).
- Asignación automática de subcuentas por histórico de proveedor (memoria en M5).
- Generación del Excel modelo Aplifisa con semáforo de confianza (verde/naranja/rojo).
- Panel de revisión con corrección manual y aprendizaje por proveedor.
- Historial/auditoría por factura y métricas de productividad.

### No incluye
- Importación final dentro de Aplifisa (se entrega el Excel listo; la importación la hace el asesor).
- Almacenamiento de facturas en la nube (residen en el VPS propio).

---

## User Story

**ID**: US-04 · **Actor**: Asesor, Administrativo · **Horas estimadas**: 55h
**Pantallas**: Subida de facturas, Cola de procesamiento, Panel de revisión (semáforo), Historial.

> Como asesor, quiero subir un lote de facturas y obtener el Excel modelo de Aplifisa ya rellenado y
> revisable en minutos, para no transcribir campo a campo ni cometer errores.

---

## Use Cases

### UC-401: Carpeta por cliente en VPS + subida de facturas
- **Actor**: Asesor · **Horas**: 9h
#### Acceptance Criteria
- [ ] **AC-01**: Cada cliente (sincronizado con M5) tiene su carpeta en el VPS; el empleado arrastra archivos PDF/JPG/PNG desde la app o el explorador.
- [ ] **AC-02**: Los ficheros y los datos extraídos permanecen en el VPS propio y no se envían a almacenamiento de terceros.

### UC-402: OCR + interpretación semántica con Claude
- **Actor**: Sistema · **Horas**: 12h
#### Acceptance Criteria
- [ ] **AC-03**: El sistema lee facturas digitales (PDF nativo) y escaneadas (imagen) y extrae proveedor, CIF, fecha, concepto, base imponible, tipo y cuota de IVA.
- [ ] **AC-04**: Ante datos implícitos (ej. "IVA reducido aplicado" sin número), la IA infiere el valor correcto (10%) y, si el concepto es ambiguo, sugiere la subcuenta más probable con explicación.

### UC-403: Asignación de subcuentas por histórico de proveedor
- **Actor**: Sistema · **Horas**: 8h
#### Acceptance Criteria
- [ ] **AC-05**: Si el proveedor ya apareció antes, el sistema aplica automáticamente la subcuenta que se le asignó (memoria en M5).
- [ ] **AC-06**: Cada factura procesada refuerza el conocimiento del sistema sobre ese proveedor.

### UC-404: Excel modelo Aplifisa con semáforo de confianza
- **Actor**: Sistema · **Horas**: 10h
#### Acceptance Criteria
- [ ] **AC-07**: El sistema genera el Excel con las columnas, orden y nombres exactos del modelo de Aplifisa, importable directamente.
- [ ] **AC-08**: Cada fila lleva un indicador de confianza: verde (>90%, aprobado automáticamente), naranja (revisión rápida), rojo (revisar manualmente).

### UC-405: Panel de revisión y corrección con aprendizaje
- **Actor**: Asesor · **Horas**: 9h
#### Acceptance Criteria
- [ ] **AC-09**: El panel permite revisar solo las filas naranja/rojo y corregir cualquier campo; el procesamiento muestra progreso en tiempo real.
- [ ] **AC-10**: Cuando el asesor corrige un campo, el sistema registra la corrección y la aplica en futuras facturas del mismo proveedor.

### UC-406: Historial, auditoría y métricas
- **Actor**: Responsable · **Horas**: 7h
#### Acceptance Criteria
- [ ] **AC-11**: Cada factura registra quién la subió, cuándo, qué extrajo la IA y qué corrigió el asesor (trazabilidad total).
- [ ] **AC-12**: El panel muestra métricas: tiempo ahorrado, facturas procesadas por período, precisión por proveedor y comparativa manual vs automático.

---

## Interacciones UI

### Visualización de datos
| Dato | Volumen | Atributos visibles | Acciones por item |
|------|---------|--------------------|-------------------|
| Facturas en cola | 1-400/mes | nombre, cliente, estado, confianza | ver, reprocesar |
| Filas extraídas | 50 por lote | proveedor, base, IVA, subcuenta, semáforo | revisar, corregir |
| Historial | miles | factura, usuario, correcciones | ver, auditar |

### Acciones del usuario
| Acción | UC | Frecuencia | Criticidad | Confirmación |
|--------|----|-----------|-----------|--------------|
| Subir lote de facturas | UC-401 | Diaria | Media | No |
| Corregir fila naranja/rojo | UC-405 | Diaria | Media | No |
| Exportar Excel Aplifisa | UC-404 | Diaria | Alta (entra en contabilidad) | Sí |

---

## Audiencia (VEG)
Target ICP-2 Asesor (revisión rápida, semáforo) y ICP-3 Administrativo (subida de lotes). Expectativa
visual: panel de tabla tipo hoja de cálculo con código de color claro (verde/naranja/rojo), progreso
en vivo.

## Requisitos No Funcionales
| NFR | Criterio | Medición |
|-----|----------|----------|
| Rendimiento | Lote de 50 facturas en 8-15 min | Medición de cola |
| Privacidad | Datos y ficheros solo en VPS propio | Auditoría de red/almacenamiento |
| Precisión | Filas verde con error < 1% | Muestreo de validación |
| Compatibilidad | Excel importable en Aplifisa sin reescritura | Test de importación real |

## Riesgos
| Riesgo | Prob. | Impacto | Mitigación |
|--------|-------|---------|------------|
| Facturas con layouts atípicos / tickets físicos | Alta | Medio | Semáforo rojo + revisión; aprendizaje por proveedor |
| Cambios en el formato Excel de Aplifisa | Baja | Alto | Plantilla de columnas configurable + validación |
| Acceso seguro de la IA al VPS | Media | Alto | Canal seguro, credenciales mínimas, datos no salen |

---

## Stack y dependencias
- **OCR/IA**: Claude (interpretación semántica) sobre imágenes/PDF.
- **Cola**: n8n (procesamiento en paralelo, progreso en tiempo real).
- **Almacenamiento**: VPS propio del despacho (carpetas por cliente).
- **Dependencias**: memoria de proveedores en **M5** (mejora la asignación; M4 puede operar independiente).

---
**Prioridad**: high · **Complejidad**: Alta
*Semanas 6-7 de la implementación.*
