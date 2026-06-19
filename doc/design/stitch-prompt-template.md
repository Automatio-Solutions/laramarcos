# Stitch Prompt Template — LaraMarcos Asesores

> Generado por /visual-setup — base para TODAS las generaciones de pantalla.
> Design System Asset: PENDIENTE (configurar tras stitch_set_api_key)
> Stitch Project: PENDIENTE

## Estructura del Prompt

```
[SCREEN NAME]
{UC-XXX}: {nombre del use case}

[PURPOSE]
{qué hace el usuario aquí}

[VISUAL DIRECTION]
{Pegar el bloque "Resumen para inyección" de doc/veg/base/veg-laramarcos-asesores.md}

[LAYOUT]
- Device: {DESKTOP|TABLET|MOBILE}
- Structure: sidebar 280px (navy) + main content; topbar con búsqueda
- Sections: {enumerar de arriba a abajo}

[CONTENT]
- Header: {qué muestra}
- Main: {contenido principal}
- Sidebar/Secondary: {si aplica}
- Footer/Actions: {botones, acciones}

[COMPONENTS]
- {componente}: {especificación}

[INTERACTIONS]
- {interacción}: {comportamiento}

[RULES]
- ALWAYS LIGHT MODE (dark mode se maneja en código con CSS vars)
- Brand: primary #1F223E (navy), secondary #828999 (grey), accent #5B6699, surface white
- Font: Plus Jakarta Sans
- Radius: Medium 8px (cards 12px)
- Estética sobria de gestoría: sin gradientes, sin saturación, data-first
- Touch target mínimo 44px en móvil; contraste 4.5:1
```

## Multi-Form-Factor Protocol

| # | Form Factor | Stitch deviceType | Archivo |
|---|------------|-------------------|---------|
| 1 | Desktop | DESKTOP | `{uc-id}_{screen}_desktop.html` |
| 2 | Tablet | TABLET | `{uc-id}_{screen}_tablet.html` |
| 3 | Mobile | MOBILE | `{uc-id}_{screen}_mobile.html` |

Generar desktop primero (referencia). Tablet: colapsar sidebar, reducir columnas. Mobile: una columna,
bottom sheet para detalles, bottom tabs. Guardar en `doc/design/{feature}/{uc-id}/`.

## Selección de Modelo
| Complejidad | Modelo | Cuándo |
|-------------|--------|--------|
| Simple | GEMINI_3_FLASH | Formularios simples, confirmaciones |
| Compleja | GEMINI_3_PRO | Kanban, dashboards, tablas, multi-panel (la mayoría de M1-M4) |

## Referencia Rápida
| Parámetro | Valor |
|-----------|-------|
| Stitch Project ID | 12029126277063254652 |
| Design System Asset | PENDIENTE (endpoint requiere OAuth) — usar DESIGN.md como contexto |
| Primary | #1F223E |
| Secondary | #828999 |
| Accent | #5B6699 |
| Font | Plus Jakarta Sans |
| Roundness | Medium (8px) / ROUND_EIGHT |
| Color Variant | FIDELITY (fiel a los colores de marca) |
| Color Mode | LIGHT |
| Brand Context | doc/brand/brand_kit/SKILL.md |
| VEG Base | doc/veg/base/veg-laramarcos-asesores.md |
