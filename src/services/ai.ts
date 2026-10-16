import type { AiContextRefs, AiDatabaseContext } from '../domain/aiContext';
import type { AiProposal } from '../domain/aiProposal';
import { apiRequest } from './api';

/*
 * Asistencia de IA de la API (`api/src/routes/ai.ts`). La API llama al proveedor a través de la
 * pasarela de la plataforma con las claves de la propia persona; el navegador nunca ve una clave.
 * Las conversaciones se guardan en la cuenta, por proyecto, y solo las ve su dueño.
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

export interface AiConversationSummary {
  id: number;
  projectId: string;
  title: string;
  createdAt: string;
  updatedAt: string;
}

export interface AiAnswer {
  proposal: AiProposal;
  model: { provider: AiProvider; id: string; label: string };
  usage: { inputTokens: number; outputTokens: number };
  refs: AiContextRefs;
  /** Operaciones que la persona aplicó; `null` si aún no ha aplicado nada. */
  applied: number[] | null;
  appliedAt?: string;
}

export type AiMessage =
  | { id: number; role: 'user'; content: { instruction: string }; createdAt: string }
  | { id: number; role: 'assistant'; content: AiAnswer; createdAt: string }
  | { id: number; role: 'error'; content: { code: string; message: string }; createdAt: string };

export interface AiConversation extends AiConversationSummary {
  messages: AiMessage[];
}

export interface AiProposalResponse {
  conversationId: number;
  userMessageId: number | null;
  messageId: number | null;
  proposal: AiProposal;
  model: AiAnswer['model'];
  usage: AiAnswer['usage'];
}

/** Errores que dependen de las claves de la persona: se explican con el enlace a su gestión. */
export const AI_KEY_ERRORS = new Set(['sin_clave_de_ia', 'tope_sin_fijar', 'tope_de_gasto', 'clave_rechazada']);

export const fetchAiModels = (token: string) => apiRequest<AiModelsResponse>('GET', '/api/ia/modelos', token);

export const listConversations = (token: string, projectId: string) =>
  apiRequest<{ conversations: AiConversationSummary[] }>(
    'GET',
    `/api/ia/conversaciones?proyecto=${encodeURIComponent(projectId)}`,
    token,
  ).then(r => r.conversations);

export const getConversation = (token: string, id: number) =>
  apiRequest<AiConversation>('GET', `/api/ia/conversaciones/${id}`, token);

export const deleteConversation = (token: string, id: number) =>
  apiRequest<{ id: number }>('DELETE', `/api/ia/conversaciones/${id}`, token);

export const markApplied = (token: string, messageId: number, applied: number[]) =>
  apiRequest<{ id: number; applied: number[] }>('PATCH', `/api/ia/mensajes/${messageId}`, token, { applied });

export function requestDatabaseProposal(
  token: string,
  request: {
    provider: AiProvider;
    model: string;
    instruction: string;
    context: AiDatabaseContext;
    refs: AiContextRefs;
    projectId: string;
    conversationId: number | null;
  },
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
