# PRD: [US-06] Chat interno del despacho

> Proyecto: laramarcos-asesores · Backend: native · Generado: 2026-09-30
> Módulo 06 (ampliación aprobada por el cliente, fuera de la propuesta v3). Depende de M1 (tareas,
> notificaciones) y M5 (usuarios, oficinas, clientes).

## Resumen

Hoy los empleados de las cuatro oficinas (Badajoz, Castuera, Don Benito y Orellana) se coordinan por
WhatsApp, email y llamadas, fuera de la plataforma. Así se pierde el contexto de cada gestión y los
datos de clientes circulan por canales que el despacho no controla.

El chat interno lleva esa conversación dentro de la plataforma: canal general, mensajes privados entre
compañeros, canales por oficina y una conversación en cada ficha de cliente. Los mensajes llegan en
tiempo real, las @menciones avisan en la campana que ya usan y todo queda en la infraestructura del
despacho. No hay coste por usuario ni consumo de IA.

## Alcance

### Incluye
- **Fase 1 — Chat básico**: canal general, mensajes directos 1 a 1, entrega en tiempo real, contador
  de no leídos y directorio de compañeros.
- **Fase 2 — Integración con la plataforma**: @menciones con aviso en la campana, conversación en la
  ficha de cliente, comentarios de tarea en tiempo real, enlaces a tareas y clientes dentro del
  mensaje, canales por oficina.
- **Fase 3 — Extras**: adjuntos en un almacén privado de la plataforma, búsqueda de mensajes,
  editar y borrar mensajes, indicador de "escribiendo…" y quién está conectado.

### No incluye
- Llamadas de voz o videollamadas.
- Grupos privados creados libremente por los empleados (solo existen el general, los directos, los
  canales por oficina y los hilos de cliente).
- Notificaciones push al móvil o por email (los avisos son dentro de la plataforma).
- Chat con clientes del despacho (es solo interno; el portal de cliente está fuera de alcance).
- Uso de IA en el chat (resúmenes, respuestas sugeridas).
- Una conversación nueva por tarea: la tarea sigue usando sus comentarios (UC-105), que pasan a
  actualizarse en tiempo real.

---

## User Story

**ID**: US-06 · **Actor**: Responsable, Asesor, Administrativo · **Horas estimadas**: 77h
**Pantallas**: Chat (lista de conversaciones + conversación abierta), Directorio de compañeros,
pestaña Conversación en la ficha de cliente, comentarios en el detalle de tarea, badge de no leídos
en el menú lateral.

> Como empleado del despacho, quiero hablar con mis compañeros dentro de la plataforma, junto a las
> tareas y los clientes de los que hablamos, para no depender de WhatsApp ni perder el contexto de
> cada gestión.

---

## Use Cases

### Fase 1 — Chat básico (28h)

#### UC-601: Directorio de compañeros y mensajes directos
- **Actor**: Cualquier usuario · **Horas**: 7h · **Pantallas**: Directorio, Chat

**Acceptance Criteria:**
- [ ] **AC-01**: Dado un asesor con sesión iniciada, Cuando abre el directorio, Entonces ve a todos
  los compañeros activos con nombre, oficina y rol, aunque sus permisos no le dejen ver la ficha
  completa de otros usuarios.
- [ ] **AC-02**: Dado el directorio abierto, Cuando escribe en el buscador parte de un nombre,
  Entonces la lista se filtra a los compañeros cuyo nombre contiene ese texto, sin distinguir
  mayúsculas ni tildes.
- [ ] **AC-03**: Dado un compañero del directorio, Cuando pulsa "Enviar mensaje", Entonces se abre
  la conversación directa con él; si ya existía, se abre la misma y no se crea una segunda.
- [ ] **AC-04**: Dado un usuario desactivado, Cuando otro empleado abre el directorio, Entonces no
  aparece en la lista, pero sus mensajes anteriores siguen visibles con su nombre.

#### UC-602: Canal general del despacho
- **Actor**: Cualquier usuario · **Horas**: 7h · **Pantallas**: Chat

**Acceptance Criteria:**
- [ ] **AC-05**: Dado cualquier usuario activo, Cuando abre el chat, Entonces el canal "General"
  aparece el primero de su lista y puede leer y escribir en él.
- [ ] **AC-06**: Dado un usuario nuevo dado de alta, Cuando entra por primera vez al chat,
  Entonces ya es miembro del canal General sin que nadie tenga que añadirle.
- [ ] **AC-07**: Dada una conversación con más de 50 mensajes, Cuando se abre, Entonces muestra
  los 50 más recientes y carga los 50 anteriores al llegar arriba del todo.

#### UC-603: Mensajes en tiempo real
- **Actor**: Cualquier usuario · **Horas**: 8h · **Pantallas**: Chat

**Acceptance Criteria:**
- [ ] **AC-08**: Dados dos usuarios con la misma conversación abierta, Cuando uno envía un
  mensaje, Entonces el otro lo ve aparecer en menos de 2 segundos sin recargar la página.
- [ ] **AC-09**: Dado un mensaje enviado, Cuando se muestra, Entonces incluye el nombre del autor,
  la hora (y la fecha si no es de hoy) y el texto con los saltos de línea respetados.
- [ ] **AC-10**: Dado un usuario sin conexión, Cuando intenta enviar un mensaje, Entonces el
  mensaje se marca como "No enviado" con opción de reintentar y no se pierde el texto escrito.
- [ ] **AC-11**: Dado un usuario que no es miembro de una conversación, Cuando intenta leer sus
  mensajes por cualquier vía, Entonces no obtiene ninguno.

#### UC-604: Mensajes no leídos
- **Actor**: Cualquier usuario · **Horas**: 6h · **Pantallas**: Chat, menú lateral

**Acceptance Criteria:**
- [ ] **AC-12**: Dada una conversación con mensajes nuevos de otros, Cuando el usuario mira la
  lista de conversaciones, Entonces esa conversación aparece en negrita con el número de mensajes
  sin leer.
- [ ] **AC-13**: Dado un usuario en cualquier pantalla de la plataforma, Cuando le llega un mensaje
  nuevo, Entonces el acceso "Chat" del menú lateral muestra el total de no leídos, actualizado en
  menos de 2 segundos.
- [ ] **AC-14**: Dada una conversación con no leídos, Cuando el usuario la abre, Entonces su
  contador pasa a 0 y el total del menú se reduce en esa cantidad.

### Fase 2 — Integración con la plataforma (21h)

#### UC-605: @menciones en el chat
- **Actor**: Cualquier usuario · **Horas**: 4h · **Pantallas**: Chat, campana de notificaciones

**Acceptance Criteria:**
- [ ] **AC-15**: Dado un usuario escribiendo un mensaje, Cuando teclea "@" y parte de un nombre,
  Entonces aparece una lista de compañeros de esa conversación para elegir.
- [ ] **AC-16**: Dado un mensaje con una @mención, Cuando se envía, Entonces la persona mencionada
  recibe un aviso en la campana que, al pulsarlo, abre la conversación en ese mensaje.
- [ ] **AC-17**: Dado un mensaje con una @mención, Cuando se muestra, Entonces el nombre mencionado
  aparece resaltado, y con más fuerza si el mencionado es quien lo está leyendo.

#### UC-606: Conversación en la ficha de cliente
- **Actor**: Responsable, Asesor · **Horas**: 6h · **Pantallas**: Ficha de cliente (pestaña
  Conversación)

**Acceptance Criteria:**
- [ ] **AC-18**: Dada la ficha de un cliente, Cuando un usuario con acceso a ese cliente abre la
  pestaña "Conversación", Entonces ve y puede escribir en el hilo interno de ese cliente, en tiempo
  real.
- [ ] **AC-19**: Dado un asesor sin acceso a un cliente, Cuando intenta abrir su conversación,
  Entonces no ve ningún mensaje, con las mismas reglas de visibilidad que la ficha de cliente.
- [ ] **AC-20**: Dado un hilo de cliente con mensajes nuevos, Cuando un usuario con acceso mira su
  lista del chat, Entonces el hilo aparece con el nombre del cliente y su contador de no leídos.

#### UC-607: Comentarios de tarea en tiempo real
- **Actor**: Responsable, Asesor · **Horas**: 4h · **Pantallas**: Detalle de tarea

**Acceptance Criteria:**
- [ ] **AC-21**: Dados dos usuarios con el mismo detalle de tarea abierto, Cuando uno añade un
  comentario, Entonces el otro lo ve aparecer en menos de 2 segundos sin recargar la página.
- [ ] **AC-22**: Dado un comentario con @mención en una tarea, Cuando se publica, Entonces el aviso
  en la campana funciona igual que hasta ahora.

#### UC-608: Enlaces a tareas y clientes en los mensajes
- **Actor**: Cualquier usuario · **Horas**: 3h · **Pantallas**: Chat

**Acceptance Criteria:**
- [ ] **AC-23**: Dado un mensaje que contiene el enlace de una tarea o de un cliente de la
  plataforma, Cuando se muestra, Entonces aparece como una tarjeta con el título de la tarea (o el
  nombre del cliente) y su estado, y al pulsarla abre esa página.
- [ ] **AC-24**: Dado un usuario sin permiso sobre la tarea o el cliente enlazado, Cuando ve el
  mensaje, Entonces el enlace aparece como "Elemento no disponible", sin mostrar título ni datos.

#### UC-609: Canales por oficina
- **Actor**: Cualquier usuario; Responsable/Admin para gestionar · **Horas**: 4h · **Pantallas**:
  Chat

**Acceptance Criteria:**
- [ ] **AC-25**: Dado un usuario asignado a una oficina, Cuando abre el chat, Entonces es miembro
  del canal de su oficina (Badajoz, Castuera, Don Benito u Orellana) y no ve los de las demás.
- [ ] **AC-26**: Dado un usuario al que se le cambia de oficina, Cuando vuelve a abrir el chat,
  Entonces sale del canal anterior y entra en el nuevo.
- [ ] **AC-27**: Dado un responsable o administrador, Cuando abre el chat, Entonces puede ver y
  escribir en los canales de todas las oficinas.

### Fase 3 — Extras (28h)

#### UC-610: Adjuntos en el chat
- **Actor**: Cualquier usuario · **Horas**: 14h · **Pantallas**: Chat

**Acceptance Criteria:**
- [ ] **AC-28**: Dado un usuario en una conversación, Cuando adjunta un fichero PDF, de imagen,
  Excel o Word de hasta 20 MB, Entonces el mensaje muestra el nombre, el tipo y el tamaño, y los
  miembros pueden descargarlo.
- [ ] **AC-29**: Dado un fichero adjunto, Cuando se guarda, Entonces queda en un almacén privado
  de la plataforma, sin enlace público, y solo se puede descargar con un enlace temporal que caduca
  a los 5 minutos.
- [ ] **AC-30**: Dado un fichero de más de 20 MB o de un tipo no permitido, Cuando se intenta
  adjuntar, Entonces se rechaza con un mensaje que indica el motivo y el límite.
- [ ] **AC-31**: Dado un usuario que no es miembro de la conversación, Cuando intenta descargar uno
  de sus adjuntos con el enlace directo, Entonces se le deniega el acceso.

#### UC-611: Búsqueda de mensajes
- **Actor**: Cualquier usuario · **Horas**: 6h · **Pantallas**: Chat

**Acceptance Criteria:**
- [ ] **AC-32**: Dado un usuario, Cuando busca una palabra en el chat, Entonces obtiene, en menos de
  1 segundo, los mensajes que la contienen en sus conversaciones, ordenados del más reciente al más
  antiguo, con la conversación y la fecha de cada uno.
- [ ] **AC-33**: Dado un resultado de búsqueda, Cuando lo pulsa, Entonces se abre la conversación
  situada en ese mensaje y resaltado.
- [ ] **AC-34**: Dado un mensaje de una conversación de la que el usuario no es miembro, Cuando
  busca un texto que contiene, Entonces ese mensaje no aparece en los resultados.

#### UC-612: Editar y borrar mensajes
- **Actor**: Autor del mensaje; Responsable/Admin para moderar · **Horas**: 4h · **Pantallas**: Chat

**Acceptance Criteria:**
- [ ] **AC-35**: Dado el autor de un mensaje, Cuando lo edita, Entonces todos los miembros ven el
  texto nuevo con la marca "(editado)" en menos de 2 segundos.
- [ ] **AC-36**: Dado el autor de un mensaje, o un responsable o administrador, Cuando lo borra
  tras confirmarlo, Entonces el mensaje se sustituye por "Mensaje eliminado" para todos y su texto
  ya no aparece en búsquedas.
- [ ] **AC-37**: Dado un usuario que no es el autor ni responsable o administrador, Cuando mira un
  mensaje ajeno, Entonces no tiene opciones de editarlo ni de borrarlo.
- [ ] **AC-38**: Dada una edición o un borrado, Cuando se consulta la auditoría, Entonces queda
  registrado quién lo hizo, cuándo y el texto anterior.

#### UC-613: "Escribiendo…" y presencia
- **Actor**: Cualquier usuario · **Horas**: 4h · **Pantallas**: Chat, Directorio

**Acceptance Criteria:**
- [ ] **AC-39**: Dados dos usuarios en la misma conversación, Cuando uno está escribiendo, Entonces
  el otro ve "Fulano está escribiendo…", que desaparece a los 5 segundos sin teclear o al enviar.
- [ ] **AC-40**: Dado el directorio o una conversación directa, Cuando un compañero tiene la
  plataforma abierta, Entonces aparece un punto verde de "conectado", que desaparece en menos de
  30 segundos después de cerrar la plataforma.

---

## Interacciones UI

### Visualización de datos
| Dato | Volumen | Atributos visibles | Acciones por item |
|------|---------|--------------------|-------------------|
| Conversaciones del usuario | 5-40 (general, oficina, directos, clientes) | nombre, último mensaje, hora, no leídos | abrir |
| Mensajes de una conversación | 50 por página; 200-500 mensajes/día en total | autor, hora, texto, menciones, tarjetas de enlace, adjuntos | editar, borrar (propios), descargar adjunto |
| Directorio de compañeros | ~20 | nombre, oficina, rol, conectado | enviar mensaje |
| Resultados de búsqueda | 0-50 | extracto resaltado, conversación, fecha | abrir en contexto |

### Acciones del usuario
| Acción | UC | Frecuencia | Criticidad | Confirmación |
|--------|----|-----------|-----------|--------------|
| Enviar mensaje | UC-603 | Muy frecuente (varias por hora) | Baja | No |
| Abrir conversación directa | UC-601 | Diaria | Baja | No |
| Mencionar a un compañero | UC-605 | Diaria | Baja | No |
| Escribir en el hilo de un cliente | UC-606 | Diaria | Media (queda en la ficha) | No |
| Adjuntar fichero | UC-610 | Semanal | Media (datos de cliente) | No |
| Editar mensaje propio | UC-612 | Ocasional | Baja | No |
| Borrar mensaje | UC-612 | Rara | Media (irreversible para el lector) | Sí |

### Selecciones/Filtros
| Filtro | Opciones | Selección | Frecuencia |
|--------|----------|-----------|------------|
| Buscador del directorio | texto libre | — | Diaria |
| Tipo de conversación en la lista | Todas / Directos / Canales / Clientes | Única | Frecuente |
| Búsqueda de mensajes | texto libre | — | Semanal |

### Formularios
| Formulario | UC | Campos | Contexto |
|------------|----|--------|----------|
| Caja de mensaje | UC-603/605/610 | texto multilínea (Enter envía, Mayús+Enter salto de línea), adjuntar | Fija abajo de la conversación |
| Edición de mensaje | UC-612 | texto | En línea sobre el propio mensaje |

---

## Audiencia (VEG)

Heredada de `doc/app/app_prd.md`: ICP-1 Responsable, ICP-2 Asesor e ICP-3 Administrativo, todos
usuarios internos. Uso en escritorio durante toda la jornada, con el chat abierto junto al trabajo.
Expectativa visual: sobria y compacta, en la línea de Slack o Teams, con la identidad Financial Pro
del proyecto. Los mensajes deben ser densos en información, sin burbujas grandes de estilo móvil.

---

## Requisitos No Funcionales

| NFR | Criterio | Medición |
|-----|----------|----------|
| Latencia | Mensaje visible para el destinatario en < 2 s | Test E2E con dos sesiones |
| Carga | Conversación abierta con sus 50 últimos mensajes en < 1 s | DevTools / Playwright |
| Privacidad | Ningún usuario lee mensajes de conversaciones de las que no es miembro | Tests de aislamiento por rol |
| Datos sensibles | Adjuntos en almacén privado, solo con enlace temporal | Test de acceso sin permiso |
| Coste | 0 € adicionales de infraestructura para 20 usuarios; sin consumo de IA | Panel de uso de Supabase |
| Trazabilidad | Ediciones y borrados auditados | Consulta de auditoría |

---

## Riesgos

| Riesgo | Prob. | Impacto | Mitigación |
|--------|-------|---------|------------|
| Adjuntos grandes superan el límite de subida de las funciones | Alta | Medio | Subida directa del navegador al almacén con enlace firmado, sin pasar por el servidor de la app |
| Reconexión del tiempo real (portátil suspendido, red inestable) | Media | Medio | Al reconectar, volver a cargar los mensajes desde el último recibido; test de reconexión |
| Que el chat se use en paralelo a WhatsApp y no se adopte | Media | Medio | Fase 2 (clientes y menciones) da el motivo para usarlo; formación breve en la entrega |
| Datos fiscales de clientes pegados como texto en el chat | Media | Medio | Mismas reglas de visibilidad que la ficha de cliente; auditoría de borrados |
| Límite de conexiones simultáneas del plan de Supabase | Baja | Bajo | ~20 usuarios con 1-2 pestañas, muy por debajo del límite |

---

## Decisiones del cliente (confirmadas 2026-09-30)

1. **Mensajes directos libres entre todos**: cualquier empleado puede escribir a cualquier otro.
   Solo están restringidos los canales de oficina (UC-609) y los hilos de cliente (UC-606).
2. **Adjuntos incluidos** (UC-610), en el almacén privado de la plataforma (mismo sitio que los
   adjuntos de tareas). Se descartó el servidor propio: no es accesible desde la nube y cada
   descarga esperaría a la pasada del agente.

---

## Stack y dependencias

- **Tiempo real**: Supabase Realtime. El navegador conecta directamente con Supabase, así que no
  cuenta contra los límites de funciones de Vercel.
- **Datos (migración nueva `chat`)**: `conversaciones` (tipo general | oficina | directo | cliente,
  nombre, cliente_id, oficina), `conversacion_miembros` (usuario, `ultimo_leido_at` para los no
  leídos) y `mensajes` (autor, texto, menciones, editado_at, borrado, índice de texto completo en
  español). RLS por pertenencia a la conversación; los hilos de cliente heredan el acceso al
  cliente.
- **Directorio**: vista o función con permisos de definidor que expone solo nombre, oficina, rol y
  estado activo, ya que la RLS actual de `usuarios` solo deja ver el propio registro.
- **Reutiliza**: notificaciones y `crear_notificacion()` (M1) para las menciones; la resolución de
  @menciones por nombre de los comentarios de tarea (UC-105); `comentarios` de tarea para UC-607;
  auditoría (`fn_auditoria`); oficinas de `usuarios`.
- **Presencia y "escribiendo…"**: canales de presencia y broadcast de Realtime, sin guardar nada en
  la base de datos.
- **Adjuntos**: bucket privado de Supabase Storage con subida firmada desde el navegador.

---

## Criterios de Aceptación (consolidado)

### Funcionales
AC-01 a AC-40 (ver cada UC). Fase 1: AC-01–AC-14 · Fase 2: AC-15–AC-27 · Fase 3: AC-28–AC-40.

### Técnicos (no validados por AG-09)
- [ ] Proyecto compila sin errores; lint sin avisos
- [ ] Tests unitarios de permisos (aislamiento por conversación, oficina y cliente) en verde
- [ ] Escenarios Gherkin (es) de AC-08, AC-11, AC-16, AC-19 y AC-31 en `tests/acceptance/features/`

---

## Estimación por fase

| Fase | UCs | Horas | Días (8h) |
|------|-----|-------|-----------|
| 1 — Chat básico | UC-601 a UC-604 | 28h | 3,5 |
| 2 — Integración | UC-605 a UC-609 | 21h | 2,6 |
| 3 — Extras | UC-610 a UC-613 | 28h | 3,5 |
| **Total** | 13 UCs | **77h** | **≈ 9,6** |

Sin adjuntos (UC-610): 63h (≈ 7,9 días).

---
**Prioridad**: high · **Complejidad**: Media
*Generado: 2026-09-30*
