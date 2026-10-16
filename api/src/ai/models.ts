/*
 * Modelos que ofrece Nodaria. Solo de la tabla de precios de la pasarela de la plataforma (con tope,
 * un modelo que no está en ella da `400 modelo_sin_tarifa`). Tres niveles por proveedor, por
 * decisión del propietario (2026-10-16); el equilibrado es el de por defecto.
 */

export const AI_PROVIDERS = ['anthropic', 'openai'] as const;
export type AiProvider = (typeof AI_PROVIDERS)[number];

export type AiTier = 'equilibrado' | 'barato' | 'calidad';

export interface AiModel {
  provider: AiProvider;
  id: string;
  label: string;
  tier: AiTier;
  /** Esfuerzo de razonamiento que se pide (Anthropic: `output_config.effort`; OpenAI: `reasoning.effort`). */
  effort: 'low' | 'medium' | 'high';
}

export const AI_MODELS: readonly AiModel[] = [
  { provider: 'anthropic', id: 'claude-sonnet-5-5', label: 'Claude Sonnet 5.5', tier: 'equilibrado', effort: 'high' },
  { provider: 'anthropic', id: 'claude-haiku-5-5', label: 'Claude Haiku 5.5', tier: 'barato', effort: 'medium' },
  { provider: 'anthropic', id: 'claude-opus-5-5', label: 'Claude Opus 5.5', tier: 'calidad', effort: 'high' },
  { provider: 'openai', id: 'gpt-5.6-terra', label: 'GPT-5.6 Terra', tier: 'equilibrado', effort: 'medium' },
  { provider: 'openai', id: 'gpt-5.6-luna', label: 'GPT-5.6 Luna', tier: 'barato', effort: 'medium' },
  { provider: 'openai', id: 'gpt-5.6-sol', label: 'GPT-5.6 Sol', tier: 'calidad', effort: 'high' },
];

export const findModel = (provider: string, id: string) => AI_MODELS.find(m => m.provider === provider && m.id === id);
