# VEG: LaraMarcos Asesores — Base

> Feature: Global (base para todas las features)
> Modo: uniforme
> Generado: 2026-06-19

## Contexto del Target

- **Quién**: empleados de una gestoría (responsable, asesores fiscal/contable/laboral, administrativos).
- **Referentes visuales**: Stripe Dashboard, Wise, Linear (sobrio, denso pero ordenado).
- **Tolerancia visual**: balanced-minimal (herramienta de trabajo, no producto de consumo).
- **Plataforma primaria**: desktop-first (panel de gestión); responsive a tablet/móvil.

## Pilar 1: Imágenes

### Estrategia de imagen
| Campo | Valor |
|-------|-------|
| Tipo | UI ilustrativa mínima; iconografía lineal; sin fotografía de stock genérica |
| Mood | Profesional, ordenado, confiable |
| Paleta | Navy #1F223E + grises + blanco |
| Sujetos | Documentos, datos, flujos; evitar personas genéricas sonrientes |

### Prompts de imagen por sección
| Sección | Tipo | Prompt |
|---------|------|--------|
| Hero/login | Abstracto | "Composición geométrica sobria en navy y gris, sensación de orden y confianza, sin texto" |
| Empty states | Ilustración lineal | "Ilustración lineal minimalista de carpeta/tarea vacía en navy sobre blanco" |
| Onboarding | Iconografía | "Set de iconos lineales: cliente, factura, tarea, calendario; trazo fino navy" |

## Pilar 2: Motion

### Estrategia de motion
| Campo | Valor |
|-------|-------|
| Nivel | subtle (herramienta de trabajo; nada distrae del dato) |
| Personalidad | sobria, precisa, sin rebotes |

### Catálogo de animaciones
| Tipo | Animación | Duración | Easing |
|------|-----------|----------|--------|
| page_enter | fade + slide-up 8px | 200ms | ease-out |
| loading | skeleton shimmer | — | — |
| hover_buttons | bg/elevación leve | 120ms | ease-out |
| transitions_pages | fade | 150ms | ease-in-out |
| transitions_modals | fade + scale 0.98→1 | 160ms | ease-out |
| feedback_success | check sutil | 200ms | — |

**Regla de nivel (subtle)**: solo page_enter, loading, transitions y feedback mínimo. Sin scroll-reveal
ni stagger llamativos.

## Pilar 3: Diseño

### Estrategia de diseño
| Campo | Valor |
|-------|-------|
| Densidad | compact (tablas, Kanban, paneles de datos) |
| Whitespace | moderate |
| Separación de secciones | líneas finas + fondos neutral-50/100 |

### Tipografía
| Campo | Valor |
|-------|-------|
| Heading weight | semibold |
| Body spacing | line-height 1.5 |
| Hero scale | contenido, sin titulares gigantes (es panel interno) |

### Jerarquía visual
| Campo | Valor |
|-------|-------|
| Estilo | dashboard / data-first |
| CTA prominence | medium (acciones claras pero no agresivas) |
| Data presentation | tablas densas legibles, semáforos de color, badges de estado |

## Form Factor Adaptations

### Desktop (>= 1024px)
- Layout: sidebar navegación (280px) + área principal; topbar con búsqueda y perfil.
- Grid: 12 columnas, gap 24px, max-width 1280px centrado.
- Navegación: sidebar fija con módulos M1-M5 + Clientes.

### Tablet (768px - 1023px)
- Layout: sidebar colapsable; paneles secundarios apilados.
- Grid: 8 columnas, gap 16px.
- Navegación: sidebar colapsable / hamburger.

### Mobile (< 768px)
- Layout: una columna; detalle de tarea/cliente en bottom sheet.
- Grid: 4 columnas, gap 12px.
- Navegación: bottom tabs (Tareas, Clientes, Presupuestos, Más). Touch targets ≥44px.

## Resumen para inyección en sub-agentes (~400 tokens)

VEG [uniforme] Base: LaraMarcos Asesores
Images: UI mínima/iconografía lineal, mood profesional-ordenado, palette navy+grey+white
Motion: level subtle, personalidad sobria
  - page_enter: fade+slide-up 8px 200ms ease-out
  - loading: skeleton shimmer
  - transitions: fade 150ms; modals fade+scale 160ms
Design: density compact, whitespace moderate
  - hierarchy: dashboard/data-first, CTA medium
  - typography: heading semibold, body lh1.5
  - data: tablas densas legibles, semáforos, badges de estado
Form factors: desktop-first, breakpoints 640/768/1024/1280
Brand: primary #1F223E + secondary #828999, accent #5B6699, font Plus Jakarta Sans, radius 8px, surface white
