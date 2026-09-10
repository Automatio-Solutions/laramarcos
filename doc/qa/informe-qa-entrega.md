# Informe de QA — Entrega al cliente

> Prueba integral de la plataforma LaraMarcos Asesores previa a la entrega.
> Metodología SpecBox (US/UC/AC). Fecha: 2026-09-10. Ejecutor: QA automatizada + funcional.
> BBDD: datos reales del despacho (594 clientes, 15 empleados, 49 servicios). Cero datos demo.

## Resultado global

**✅ APTO PARA ENTREGA.** Se probó cada punto accesible de la aplicación en 6 capas.
Se encontraron y **corrigieron 2 bugs reales** y se **modernizaron 2 tests desactualizados**.
No queda ningún fallo abierto salvo lo que está pendiente de construir (depende de
servicios externos que aporta el cliente: Resend, VPS, Supabase Pro).

| Capa | Alcance | Resultado |
|------|---------|-----------|
| 1. Estática | `tsc` + `eslint` + `next build` (34 páginas) | ✅ limpio |
| 2. Unitaria | 22 tests (lógica pura: IVA, IBAN/CIF, alertas, OCR, plantillas, import) | ✅ 22/22 |
| 3. Integración BBDD | 9 scripts contra Supabase real (RLS, clientes, catálogo, tareas, ficha, alertas, facturación, presupuestos, OCR) | ✅ todos verdes |
| 4. Rutas (render) | 24 rutas autenticadas + página pública | ✅ 24/24 HTTP 200, sin errores |
| 5. Páginas de detalle | Ficha de tarea, editor de presupuesto, PDF, aceptación pública, revisión OCR (con datos reales) | ✅ contenido correcto |
| 6. Control de acceso | Aislamiento por oficina y por rol (asesor / responsable / admin) | ✅ correcto (tras corregir 2 fugas) |
| 7. IA en vivo | M2 presupuestos y M3 DOE/BOE contra la API real de Claude | ✅ correcto |

---

## Bugs encontrados y corregidos

### BUG-01 · La importación de clientes rompía la visibilidad por oficina 🔴
- **Módulo**: M5 · `/importar`.
- **Síntoma**: la acción de importación insertaba clientes con `asesor_id` pero **sin `oficina`**. Bajo la RLS por sede, un cliente sin oficina es invisible para todos salvo responsable/admin, y un asesor ni siquiera podía importar (la RLS rechazaba el `insert`).
- **Corrección**: la importación fija la `oficina` del usuario que importa; la página y la acción quedan restringidas a staff (responsable/admin).
- **Verificación**: un asesor es redirigido a `/dashboard`; los clientes importados heredan oficina y son visibles.

### BUG-02 · La página de Auditoría no bloqueaba a los asesores 🟡
- **Módulo**: M5 · `/auditoria`.
- **Síntoma**: la página se anunciaba como "solo responsables/admin" pero **no redirigía**; un asesor entraba (aunque la RLS dejaba los datos vacíos) y el enlace aparecía en el menú.
- **Corrección**: guard de rol con redirección a `/dashboard`, y el enlace se oculta en el menú para no-staff (igual que Archivo y Usuarios).
- **Verificación**: un asesor es redirigido; un responsable entra con normalidad.

### Tests modernizados (no eran bugs de la app, pero rompían el suite)
- **`rls-test`**: estaba escrito para el modelo antiguo (visibilidad por `asesor_id`). Reescrito al modelo por **oficina**, añadiendo la comprobación nueva (dos asesores de la misma sede se ven entre sí). 9/9.
- **`clientes-test`**: usaba las columnas `iban`/`condiciones_pago`, eliminadas al pasar a cuentas múltiples. Actualizado al esquema actual (`cliente_cuentas`, `oficina`). 4/4.

---

## Detalle de la prueba de rutas (capa 4)

Todas las rutas del panel respondieron **HTTP 200** autenticadas, sin errores de servidor:
Dashboard, Tareas (+nueva), Archivo, Clientes (+nuevo, +ficha), Presupuestos
(+nuevo, +recurrentes), Facturación, Vigilancia, Precontabilización, Servicios
(+nuevo, +ficha, +plantilla), Proveedores (+nuevo), Sectores, Plantillas, Auditoría,
Usuarios, Importar. La página pública de aceptación de presupuesto (`/p/<token>`)
responde sin sesión, como debe.

## Detalle del control de acceso (capa 6)

| Ruta | Asesor | Responsable | Correcto |
|------|--------|-------------|----------|
| /archivo | → /tareas | 200 | ✅ |
| /usuarios | → /dashboard | 200 | ✅ |
| /auditoria | → /dashboard | 200 | ✅ (corregido) |
| /importar | → /dashboard | 200 | ✅ (corregido) |
| /clientes | solo su oficina | toda la cartera | ✅ |

Verificado también a nivel de BBDD: un asesor de Badajoz ve la cartera de Badajoz
(incluidos clientes que no son "suyos", para cubrirse entre compañeros) y **no** la de
otras sedes; responsable/admin ven las cuatro oficinas.

---

## Observaciones menores (no bloquean la entrega)

1. **Catálogos de solo lectura para asesores**: las páginas de Servicios, Proveedores,
   Sectores y Plantillas muestran a los asesores los formularios de alta/edición, aunque
   la RLS impide que escriban (sus cambios se rechazan). No es un fallo de seguridad (los
   datos están protegidos), pero conviene decidir si esos formularios deben ocultarse a
   quien no es staff. Es una decisión de producto.
2. La importación en la app (`/importar`) asigna la oficina del que importa; para cargas
   multi-oficina se sigue usando el script `scripts/importar-cartera.mjs` (como se hizo con
   la cartera real).

---

## Fuera de alcance (pendiente de construir — depende del cliente)

No son fallos: son funcionalidades que esperan servicios externos que aporta el despacho.

| Pendiente | Depende de |
|-----------|-----------|
| Envío de presupuestos y newsletters por email; métricas de apertura; agente lector | **Resend** + DNS |
| Copias de seguridad diarias (producción) | **Supabase Pro** |
| Carpeta por cliente en servidor + subida de facturas al OCR en producción | **VPS** del despacho |
| Segmentación real de newsletters | **sector de cada cliente** (no venía en los Excel) |

---

*Registros técnicos de esta QA: tracking SpecBox (US de QA con sus UCs/AC) + este informe.*
