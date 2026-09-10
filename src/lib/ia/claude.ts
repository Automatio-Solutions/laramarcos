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

/**
 * Modelo rápido para tareas de clasificación por lotes (M3 DOE/BOE).
 *
 * Haiku 4.5 responde en una fracción del tiempo de Opus, y clasificar un
 * titular por sector no necesita más. Importa porque el cron diario tiene
 * 60 segundos en el plan gratuito de Vercel.
 */
export const MODELO_RAPIDO = process.env.ANTHROPIC_MODEL_RAPIDO ?? "claude-haiku-4-5-20251001";
