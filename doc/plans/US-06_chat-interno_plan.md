# Plan: US-06 — Chat interno del despacho

> Generado: 2026-09-30 · Origen: US-06 (backend native, `laramarcos-asesores`) · Estado: Pendiente
> Stack: Next.js 16 (App Router) + Supabase (PostgreSQL, RLS, Realtime, Storage) · Branding: navy #1F223E
> PRD: doc/prd/m6-chat-interno.md · 13 UC · 40 AC · 77h
> Decisiones del cliente (2026-09-30): directos libres entre todos · adjuntos incluidos, en almacén
> privado de la plataforma (no en el servidor propio)
> **stitch_designs: MANUAL**: sin Stitch, como M1–M5. Se construye con los tokens y componentes del
> proyecto siguiendo `doc/design/DESIGN.md` y el VEG base.

---

## Resumen

Chat interno en tiempo real dentro del panel: canal General, canales por oficina, mensajes directos
y un hilo por cliente, con @menciones a la campana, enlaces enriquecidos, adjuntos, búsqueda,
edición y borrado, "escribiendo…" y presencia. Los comentarios de tarea pasan a tiempo real. Sin IA
y sin coste extra de infraestructura: el navegador se conecta a Supabase Realtime directamente, así
que no le afectan los límites de funciones de Vercel.

---

## Arquitectura

### Idea central: la pertenencia se calcula, no se guarda

En lugar de una tabla de miembros que haya que mantener sincronizada (altas, bajas, cambios de
oficina, reasignación de clientes), **quién puede ver una conversación se calcula** con una sola
función `chat_puede_ver(conversacion_id)`, que usan la RLS, la búsqueda, los adjuntos y los canales
privados de Realtime:

| Tipo | Quién la ve | Filas |
|------|-------------|-------|
| `general` | cualquier usuario activo | 1 (sembrada) |
| `oficina` | usuarios de esa oficina + staff | 4 (sembradas: Badajoz, Castuera, Don Benito, Orellana) |
| `directo` | los dos participantes (`usuario_a < usuario_b`, único por par) | bajo demanda |
| `cliente` | quien puede ver el cliente (misma RLS de `clientes`: staff u oficina) | bajo demanda, única por cliente |

Con esto AC-06 (el usuario nuevo ya está en General) y AC-26 (el cambio de oficina mueve de canal)
salen solos, sin triggers de sincronización.

### Modelo de datos — migración `0020_chat.sql`

```
conversaciones (id, tipo chat_tipo, nombre, oficina oficina NULL, cliente_id NULL,
                usuario_a NULL, usuario_b NULL, ultimo_mensaje_at, created_at)
  UNIQUE (cliente_id) · UNIQUE (usuario_a, usuario_b) · CHECK usuario_a < usuario_b
  UNIQUE (tipo, oficina) para oficina · índice parcial único para general

mensajes (id, conversacion_id, autor_id, texto, menciones uuid[], editado_at, borrado bool,
          adjunto_path, adjunto_nombre, adjunto_mime, adjunto_size, created_at,
          busqueda tsvector GENERATED ALWAYS AS (to_tsvector('spanish', unaccent(texto))) STORED)
  índices: (conversacion_id, created_at desc) · GIN(busqueda)
  trigger fn_auditoria (AC-38) · trigger que actualiza conversaciones.ultimo_mensaje_at

chat_lecturas (usuario_id, conversacion_id, ultimo_leido_at)  PK (usuario_id, conversacion_id)
```

Funciones (SECURITY DEFINER, `search_path = public`):
- `chat_puede_ver(conv uuid) → bool`: la tabla de arriba. Para `cliente` hace `exists` sobre
  `clientes` con las mismas condiciones de su RLS (`is_staff()` o `oficina = mi_oficina()`).
- `chat_directorio() → (id, nombre, oficina, rol, activo)`: solo usuarios activos y solo esos
  campos. Resuelve que la RLS de `usuarios` solo deja ver el propio registro (AC-01).
- `chat_abrir_directo(otro uuid) → uuid`: `insert … on conflict do nothing` con el par ordenado y
  devuelve el id existente o el nuevo (AC-03, sin duplicados).
- `chat_abrir_cliente(cliente uuid) → uuid`: igual para el hilo del cliente, comprobando acceso.
- `chat_no_leidos() → (conversacion_id, n)`: mensajes ajenos posteriores a
  `coalesce(ultimo_leido_at, usuarios.created_at)` en las conversaciones visibles (AC-12/13).
- `chat_marcar_leida(conv uuid)`: upsert en `chat_lecturas` con `now()` (AC-14).
- `chat_buscar(q text, lim int) → mensajes`: `websearch_to_tsquery('spanish', unaccent(q))`,
  filtrado por `chat_puede_ver` y `not borrado` (AC-32/34).

RLS:
- `conversaciones`: select `chat_puede_ver(id)`. No hay insert directo: se crean vía funciones.
- `mensajes`: select `chat_puede_ver(conversacion_id)`; insert `autor_id = auth.uid() and
  chat_puede_ver(...)`; update (editar/borrar) autor o `is_staff()` (AC-37).
- `chat_lecturas`: cada uno las suyas.
- **Publicación Realtime**: `alter publication supabase_realtime add table mensajes, comentarios`.
  `postgres_changes` respeta la RLS del usuario conectado, así que AC-11 aplica también al tiempo
  real.

### Tiempo real

| Qué | Mecanismo | Canal |
|-----|-----------|-------|
| Mensajes nuevos, editados o borrados | `postgres_changes` en `mensajes`, filtro `conversacion_id=eq.X` | uno por conversación abierta |
| Badge de no leídos del menú | `postgres_changes` INSERT en `mensajes` sin filtro (la RLS ya limita) → vuelve a llamar a `chat_no_leidos()` con debounce de 300 ms | uno global en el layout |
| "Escribiendo…" | Broadcast, **canal privado** `chat:{id}` | autorización Realtime con política sobre `realtime.messages` que usa `chat_puede_ver` |
| Presencia | Presence en el canal privado `presencia` | un único canal global |
| Comentarios de tarea | `postgres_changes` en `comentarios`, filtro `tarea_id=eq.X` | detalle de tarea |

Envío: **server action** `enviarMensaje` (valida, resuelve menciones y crea notificaciones). La UI
es optimista, con un id generado en cliente: el mensaje aparece al instante, se marca como
"No enviado" si falla y permite reintentar sin perder el texto (AC-10). Al reconectar el canal se
recargan los mensajes posteriores al último recibido.

### Adjuntos (decisión 2026-09-30)

Van a un bucket privado `chat` de Supabase Storage, con `file_size_limit` de 20 MB y
`allowed_mime_types` limitados a PDF, imágenes, Excel y Word. Es el mismo patrón que la subida
directa de facturas de M4 (`createSignedUploadUrl`):
1. La server action `prepararAdjunto(conv, nombre, mime, size)` valida la pertenencia, el tamaño y
   el tipo, y devuelve una URL firmada de subida con ruta `chat/{conv}/{uuid}/{nombre}`.
2. El navegador sube directo a Storage. No pasa por Vercel, así que el límite de 4,5 MB no aplica.
3. `enviarMensaje` guarda la ruta en el mensaje.
4. La descarga pasa por `/api/chat/adjuntos/[mensajeId]`, que lee el mensaje con el cliente del
   usuario (si la RLS no lo devuelve → 403, AC-31) y redirige a una URL firmada de 300 s (AC-29).

### Ajuste necesario en comentarios de tarea (UC-607)

La política actual `comentarios_select` solo deja leer a staff o al autor, así que un asesor
asignado a una tarea **no ve los comentarios de sus compañeros**, y el tiempo real no le mostraría
nada. En la misma migración se amplía a `is_staff() or autor_id = auth.uid() or
fn_es_responsable_tarea(tarea_id) or fn_asignado_en_tarea(tarea_id)`, las mismas funciones que ya
usa `adjuntos`. Es un cambio de visibilidad en M1: se avisa en el PR.

---

## Análisis UI (Fase 0)

### Pantallas
| Pantalla | UC | Tipo | Ruta |
|----------|----|------|------|
| Chat: lista de conversaciones + conversación abierta | 602–605, 608–613 | Dos columnas: lista 320 px y panel de mensajes | `/chat`, `/chat/[id]` |
| Directorio de compañeros | 601, 613 | Panel dentro de `/chat` (botón "Nuevo mensaje") con buscador | `/chat?nuevo=1` |
| Pestaña Conversación en la ficha de cliente | 606 | Sección con el mismo componente de conversación | `/clientes/[id]` |
| Comentarios de tarea en tiempo real | 607 | Sin cambio visual | `/tareas/[id]` |
| Badge "Chat" en el menú | 604 | Contador en `PanelNav` | global |

### Componentes
| Requisito | Componente | Estado | Acción |
|-----------|------------|--------|--------|
| Lista de conversaciones con no leídos y filtro por tipo | `ChatLista` | ❌ | CREAR |
| Conversación: mensajes paginados + scroll inverso + caja | `ChatConversacion` | ❌ | CREAR (reutilizado en la ficha de cliente) |
| Mensaje (autor, hora, texto, menciones, tarjeta de enlace, adjunto, editado/borrado, acciones) | `ChatMensaje` | ❌ | CREAR |
| Caja de texto (Enter envía, Mayús+Enter salto, autocompletado de @, adjuntar) | `ChatComposer` | ❌ | CREAR |
| Autocompletado de menciones | `MencionPicker` | ❌ | CREAR |
| Tarjeta de enlace a tarea o cliente | `EnlaceCard` | ❌ | CREAR |
| Directorio con buscador y punto de conectado | `ChatDirectorio` | ❌ | CREAR |
| Badge de no leídos en el menú | `ChatBadge` | ❌ | CREAR (dentro de `PanelNav`) |
| Búsqueda con resultados | `ChatBusqueda` | ❌ | CREAR |
| Confirmar borrado | `ConfirmModal` | ✅ | Reutilizar |
| Campana de notificaciones | `NotificacionesBell` | ✅ | Reutilizar (tipo nuevo `mencion_chat`) |
| Campos de formulario | `ui/Field` | ✅ | Reutilizar |

Criterios aplicados: lista de 5–40 conversaciones → lista simple con scroll y filtro por segmentos
(4 opciones). Mensajes: 200–500 al día → paginación de 50 en 50 con carga al llegar arriba.
Directorio: unos 20 → lista con buscador. Borrar → confirmación modal; editar → en línea, sin
confirmación.

## Visual Experience Generation

**Modo**: 1 — Uniforme (heredado de `doc/veg/base/veg-laramarcos-asesores.md`). **No se genera VEG
nuevo**: es una herramienta interna, igual que M1–M5. No hay imágenes, así que tampoco hay coste.

Resumen para sub-agentes: arquetipo corporate · densidad compact · whitespace moderado · motion
subtle (solo entrada de mensajes con fade de 150 ms, sin animaciones de scroll) · jerarquía de
panel · CTA subtle. Mensajes en formato lista tipo Slack (avatar con iniciales, nombre en negrita
y hora en gris) y **no burbujas de estilo móvil**. Mención propia con fondo `accent/10`. Tokens:
primary #1F223E, accent #5B6699, Plus Jakarta Sans, radius 8 px, fondo `surface-raised`.

---

## Fases de implementación

Cada fase termina con `npm test`, `tsc --noEmit` y lint en verde, más una prueba manual con dos
sesiones (dos navegadores o una ventana de incógnito) para todo lo que sea tiempo real.

### Fase 1 — Chat básico (UC-601 a UC-604 · 28h)

**1.1 Base de datos** [DBInfra] — 7h
- [ ] `0020_chat.sql`: enum `chat_tipo`, tablas, índices, `unaccent`, las funciones
  `chat_puede_ver`, `chat_directorio`, `chat_abrir_directo`, `chat_no_leidos` y
  `chat_marcar_leida`, RLS, auditoría, publicación Realtime, semilla de General y los 4 canales de
  oficina.
- [ ] Tipos en `src/lib/types.ts` y repositorio `src/lib/repos/chat.ts` (listar conversaciones,
  paginar mensajes, directorio).
- [ ] Script de verificación de RLS con 3 usuarios de prueba (staff, asesor de Badajoz, asesor de
  Castuera) contra la BBDD de desarrollo.

**1.2 Lógica pura y tests** [QA] — 3h
- [ ] `src/lib/chat/core.ts`: normalizar búsqueda del directorio (sin mayúsculas ni tildes, AC-02),
  par ordenado de directos, agrupar mensajes por día, formato de hora/fecha (AC-09).
- [ ] `tests/unit/chat.test.ts`.

**1.3 UI y tiempo real** [ReactSpecialist] — 18h
- [ ] `/chat` y `/chat/[id]`: `ChatLista`, `ChatConversacion`, `ChatMensaje`, `ChatComposer`.
- [ ] Hook `useMensajesRealtime(convId)`: suscripción, orden, sin duplicados (el id optimista
  coincide con el del servidor), reconexión con recarga del hueco.
- [ ] Server actions `enviarMensaje` y `marcarLeida`. UI optimista con estado "No enviado" y
  reintento.
- [ ] `ChatDirectorio` + `chat_abrir_directo`.
- [ ] `ChatBadge` en `PanelNav` (entrada "Chat" arriba, tras Tareas).

### Fase 2 — Integración (UC-605 a UC-609 · 21h)

- [ ] **UC-605** (4h): `MencionPicker` (miembros de la conversación: directorio filtrado por
  `chat_puede_ver`). `enviarMensaje` resuelve `menciones` y llama a
  `crear_notificacion(uid, 'mencion_chat', …, '/chat/{conv}?m={mensaje}')`. El enlace es único por
  mensaje, así que el dedupe diario no se come avisos. Resaltado de la mención (y más fuerte si es
  la propia).
- [ ] **UC-606** (6h): `chat_abrir_cliente`. Sección "Conversación" en `/clientes/[id]` con
  `ChatConversacion`. En la lista del chat, los hilos de cliente solo aparecen si tienen mensajes.
- [ ] **UC-607** (4h): ampliar `comentarios_select` (ver Arquitectura) y suscribirse en
  `TareaDetalleView`. Las @menciones siguen por la vía existente de UC-105.
- [ ] **UC-608** (3h): detectar URLs propias `/tareas/{uuid}` y `/clientes/{uuid}` y resolverlas
  con el cliente del usuario. Si la RLS no devuelve nada, se muestra "Elemento no disponible"
  (AC-24).
- [ ] **UC-609** (4h): los canales de oficina ya existen desde la semilla. Aquí va la
  presentación en la lista (staff ve los 4) y un test de cambio de oficina.

### Fase 3 — Extras (UC-610 a UC-613 · 28h)

- [ ] **UC-610** (14h): bucket `chat` (en la migración, con límite y tipos), `prepararAdjunto`,
  subida directa con barra de progreso, ruta de descarga con URL firmada de 300 s, rechazo con
  motivo y límite (AC-30) validado en cliente y en servidor.
- [ ] **UC-611** (6h): `chat_buscar` + `ChatBusqueda`. Al abrir un resultado, salta al mensaje
  (carga la página que lo contiene y lo resalta).
- [ ] **UC-612** (4h): editar en línea (`editado_at`) y borrar con confirmación (`borrado = true`,
  `texto = ''`, adjunto eliminado de Storage). La auditoría conserva el texto anterior.
- [ ] **UC-613** (4h): Broadcast `escribiendo` con throttle de 2 s y expiración de 5 s. Presence
  global con punto verde en el directorio y en los directos. Política de autorización Realtime
  para los canales privados.

### Fase 4 — QA y cierre — incluida en las horas de cada UC
- [ ] Tests unitarios de la lógica pura (menciones, enlaces, validación de adjuntos, no leídos).
- [ ] Verificación de aislamiento (AC-11, 19, 24, 31, 34) con los 3 usuarios de prueba, con
  evidencia en `.quality/`.
- [ ] Prueba manual con dos sesiones: latencia < 2 s (AC-08, 13, 21, 35), reconexión y "No
  enviado".
- [ ] `validate_ac_quality` + marcar los AC en el tablero.

---

## Alternativas y tradeoffs

| Decisión | Elegida | Descartada | Razón |
|----------|---------|------------|-------|
| Pertenencia | Calculada con `chat_puede_ver` | Tabla de miembros | Sin sincronización al cambiar de oficina o de cliente; una sola regla para RLS, búsqueda, adjuntos y Realtime |
| Envío | Server action + UI optimista | Insert directo desde el navegador | Las menciones y notificaciones necesitan servidor; la UI optimista mantiene la sensación instantánea |
| Tiempo real | Supabase Realtime (`postgres_changes` + Broadcast/Presence) | Polling o servidor WebSocket propio | Incluido en Supabase, respeta la RLS y no pasa por Vercel |
| Adjuntos | Bucket privado + URLs firmadas | Servidor propio con relevo del agente | El servidor no es accesible desde la nube y cada descarga esperaría 10–60 s (decisión del cliente) |
| Chat por tarea | Comentarios existentes en tiempo real | Conversación nueva por tarea | Evita dos canales para lo mismo |
| Búsqueda | FTS de Postgres en español + `unaccent` | Motor externo | Volumen pequeño, coste cero |
| Diseños | Manual con DESIGN.md | Stitch | Coherente con M1–M5; Stitch no está configurado |

## Riesgos

| Riesgo | Prob. | Impacto | Mitigación |
|--------|-------|---------|------------|
| `postgres_changes` con RLS evalúa la política por cada suscriptor: si `chat_puede_ver` es cara, sube la latencia | Media | Medio | Función `stable` con índices; para ~20 usuarios es despreciable. Medir AC-08 |
| Ampliar `comentarios_select` cambia lo que ven los asesores en M1 | Media | Medio | Se limita a responsable o asignado de la tarea (igual que `adjuntos`); se avisa en el PR |
| Autorización de canales privados de Realtime mal configurada filtra "escribiendo…" o presencia | Baja | Bajo | Solo se emiten nombre e id; test con un usuario sin acceso |
| Reconexión tras suspender el portátil pierde mensajes | Media | Medio | Recarga del hueco desde el último `created_at` recibido al volver `SUBSCRIBED` |

---

## Archivos a crear o modificar

```
supabase/migrations/0020_chat.sql                     (nuevo)
src/lib/types.ts                                      (tipos Chat*)
src/lib/chat/core.ts                                  (lógica pura: menciones, enlaces, adjuntos, formato)
src/lib/chat/realtime.ts                              (hooks de suscripción)
src/lib/repos/chat.ts                                 (lecturas servidor)
src/app/(panel)/chat/page.tsx, [id]/page.tsx, actions.ts
src/app/api/chat/adjuntos/[id]/route.ts
src/components/chat/ChatLista.tsx, ChatConversacion.tsx, ChatMensaje.tsx, ChatComposer.tsx,
  MencionPicker.tsx, EnlaceCard.tsx, ChatDirectorio.tsx, ChatBadge.tsx, ChatBusqueda.tsx
src/components/PanelNav.tsx                           (entrada Chat + badge)
src/components/TareaDetalleView.tsx                   (comentarios en tiempo real)
src/app/(panel)/clientes/[id]/page.tsx                (sección Conversación)
tests/unit/chat.test.ts
```

## Comandos finales

```bash
npm test && npx tsc --noEmit && npx eslint src
```

---

## Referencias
- PRD: `doc/prd/m6-chat-interno.md` · Tablero: SpecBox native `laramarcos-asesores` / US-06
- Diseño: `doc/design/DESIGN.md` · VEG: `doc/veg/base/veg-laramarcos-asesores.md`
- Patrones reutilizados: subida firmada (precontabilización), `crear_notificacion` (0004),
  `fn_es_responsable_tarea` / `fn_asignado_en_tarea` (0003), `fn_auditoria` (0001), `mi_oficina` (0013)
