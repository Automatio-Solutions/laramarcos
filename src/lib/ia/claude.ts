import "server-only";

/**
 * Modelo de Claude usado por M2 (presupuestos), M3 y M4 (OCR).
 *
 * claude-opus-4-8 es el modelo actual recomendado por Anthropic. Importa para
 * el OCR: soporta visión de alta resolución (2576px de lado largo), lo que
 * mejora la lectura de facturas escaneadas frente a modelos anteriores.
 *
 * Se puede forzar otro con ANTHROPIC_MODEL en .env.local (p. ej. claude-sonnet-5
 * si el despacho quiere abaratar el coste por factura).
 */
export const MODELO_CLAUDE = process.env.ANTHROPIC_MODEL ?? "claude-opus-4-8";

/** Hay clave de Claude configurada (si no, los módulos usan su fallback). */
export const hayClaude = (): boolean => Boolean(process.env.ANTHROPIC_API_KEY);
