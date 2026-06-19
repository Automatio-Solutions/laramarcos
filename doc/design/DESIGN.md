---
name: LaraMarcos Asesores Design System
archetype: corporate
colorMode: LIGHT
colors:
  primary: "#1F223E"
  onPrimary: "#FFFFFF"
  secondary: "#828999"
  onSecondary: "#FFFFFF"
  tertiary: "#5B6699"
  onTertiary: "#FFFFFF"
  neutral: "#6E7585"
  background: "#FFFFFF"
  surface: "#F8F9FA"
  outline: "#E2E4E9"
  success: "#10B981"
  warning: "#F59E0B"
  error: "#EF4444"
  info: "#3B82F6"
typography:
  headlineFont: PLUS_JAKARTA_SANS
  bodyFont: PLUS_JAKARTA_SANS
  labelFont: PLUS_JAKARTA_SANS
  baseSize: 16
rounded: ROUND_EIGHT
colorVariant: FIDELITY
spacing:
  base: 4
  cardPadding: 24
  sectionGap: 48
components:
  button:
    radius: 8
    paddingX: 24
    paddingY: 12
  card:
    radius: 12
    padding: 24
    shadow: sm
  input:
    radius: 8
    border: "1px solid #CBCED6"
---

# LaraMarcos Asesores — Design Guidelines

## Overview
Plataforma de gestión interna para una gestoría/asesoría (LaraMarcos Asesores). Audiencia: 20 empleados
(responsable, asesores fiscal/contable/laboral, administrativos). Tono visual: **sobrio, profesional,
fiable** — herramienta de trabajo data-first, no producto de consumo. Referentes: Stripe Dashboard,
Wise, Linear. Desktop-first, responsive a tablet y móvil.

## Colors
- **Primary #1F223E** (navy del logo): CTAs principales, header/sidebar, estados activos, focus rings.
- **Secondary #828999** (slate grey): botones secundarios, tags, badges, texto de apoyo. Nunca para body.
- **Tertiary #5B6699**: highlights, notificaciones, indicadores de progreso.
- **Surface blanco / neutral-50 #F8F9FA** para cards; neutral-100 #F1F2F4 para fondos de sección.
- Semánticos: success #10B981, warning #F59E0B, error #EF4444, info #3B82F6.
- Semáforo OCR (M4): verde >90%, naranja revisión, rojo manual.
- RULE: botones primary = navy sólido con texto blanco; secondary = contorno con borde neutral.
- RULE: sin gradientes ni colores saturados; paleta restringida que transmite orden y confianza.

## Typography
- Headings: Plus Jakarta Sans, semibold, 36/30/24/20px (h1/h2/h3/h4).
- Body: Plus Jakarta Sans, regular, 16px, line-height 1.5.
- Labels: Plus Jakarta Sans, medium, 14px.
- Importes/CIF/datos numéricos: tabular, alineados a la derecha cuando son cantidades.
- RULE: máximo 2 pesos por pantalla.

## Layout
- Max content width 1280px centrado; grid 12 col, gap 24px.
- Desktop: sidebar 280px (navy) + main; topbar con búsqueda y perfil.
- Tablet: sidebar colapsable, grid 8 col.
- Mobile: una columna, bottom sheet para detalle, bottom tabs. Touch target ≥44px.
- Breakpoints: 640 / 768 / 1024 / 1280.

## Elevation & Depth
- shadow-sm por defecto en cards; shadow-md solo para cards elevadas/menús.
- Sin sombras pesadas. Separación de secciones con líneas finas neutral-200 y fondos neutral-50/100.

## Shapes
- Roundness Medium 8px: botones 8px, inputs 8px, cards 12px.
- No mezclar esquinas marcadas y redondeadas en la misma vista.

## Components
- **Cards**: bg blanco/neutral-50, radius 12px, shadow-sm, 1px border neutral-200, padding 24px.
- **Buttons**: radius 8px, 14px, weight 500, padding 12/24.
- **Inputs**: radius 8px, 1px border neutral-300, focus ring 2px primary/20%.
- **Tables**: header bg neutral-50, filas alternas blanco/neutral-50, border-b neutral-200; densas pero legibles.
- **Badges de estado**: pill, color por estado (pendiente/en curso/bloqueada/completada).
- **Kanban**: columnas por estado, tarjetas con cliente, responsable y vencimiento.
- **Navigation**: sidebar fija navy con módulos M1-M5 + Clientes; topbar 64px.

## Do's and Don'ts
- DO: priorizar legibilidad del dato, densidad ordenada, jerarquía clara.
- DO: usar navy solo para lo primario; grises para estructura.
- DON'T: gradientes, colores saturados, más de 2 tamaños de fuente por card, sombras fuertes.
- DON'T: animaciones llamativas — motion sutil (fades, slide-up 8px, skeletons).

## VEG Notes
Motion level subtle; density compact; whitespace moderate; hierarchy dashboard/data-first; CTA medium.
Imágenes: UI mínima/iconografía lineal navy; evitar fotografía de stock genérica.
