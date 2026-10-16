import type { AiDatabaseContext } from '../domain/aiContext';
import type { AiProposal } from '../domain/aiProposal';
import { apiRequest } from './api';

/*
 * Asistencia de IA de la API (`api/src/routes/ai.ts`). La API llama al proveedor a través de la
 * pasarela de la plataforma con las claves de la propia persona; el navegador nunca ve una clave.
 */

export type AiProvider = 'anthropic' | 'openai';

export interface AiModelInfo {
  provider: AiProvider;
  id: string;
  label: string;
  tier: 'equilibrado' | 'barato' | 'calidad';
}

export interface AiModelsResponse {
  /** Gestión de las claves de IA en la web social de la plataforma. */
  manageUrl: string;
  models: AiModelInfo[];
}

export interface AiProposalResponse {
  proposal: AiProposal;
  model: { provider: AiProvider; id: string; label: string };
  usage: { inputTokens: number; outputTokens: number };
}

/** Errores que dependen de las claves de la persona: se explican con el enlace a su gestión. */
export const AI_KEY_ERRORS = new Set(['sin_clave_de_ia', 'tope_sin_fijar', 'tope_de_gasto']);

export const fetchAiModels = (token: string) => apiRequest<AiModelsResponse>('GET', '/api/ia/modelos', token);

export function requestDatabaseProposal(
  token: string,
  request: { provider: AiProvider; model: string; instruction: string; context: AiDatabaseContext },
  signal?: AbortSignal,
) {
  return apiRequest<AiProposalResponse>(
    'POST',
    '/api/ia/propuestas',
    token,
    { ...request, scope: 'base-de-datos' },
    {},
    signal,
  );
}
