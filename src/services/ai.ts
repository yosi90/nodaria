import type { AiContextRefs, AiDatabaseContext } from '../domain/aiContext';
import type { AiWorldContext, AiWorldRefs } from '../domain/aiWorld';
import type { AiProposal } from '../domain/aiProposal';
import { apiRequest } from './api';
import { PLATFORM_API_URL, sdk, type PlatformAiState, type PlatformModels } from './yosiftware';

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

/** Respuesta a una pregunta sobre el mundo: texto con menciones [[n12]] y los nodos que cita. */
export interface AiWorldReply {
  answer: { answer: string; cited: string[] };
  model: AiAnswer['model'];
  usage: AiAnswer['usage'];
  /** Solo los nodos citados: n12 → id del nodo. */
  refs: AiWorldRefs;
}

export const isWorldReply = (content: AiAnswer | AiWorldReply): content is AiWorldReply => 'answer' in content;

export type AiMessage =
  | { id: number; role: 'user'; content: { instruction: string; kind?: 'pregunta' }; createdAt: string }
  | { id: number; role: 'assistant'; content: AiAnswer | AiWorldReply; createdAt: string }
  | { id: number; role: 'error'; content: { code: string; message: string }; createdAt: string };

export interface AiConversation extends AiConversationSummary {
  messages: AiMessage[];
}

export interface AiProposalResponse {
  /** Con qué clave se pidió: la del grupo del proyecto o la de la persona. */
  keySource?: 'grupo' | 'personal';
  conversationId: number;
  userMessageId: number | null;
  messageId: number | null;
  proposal: AiProposal;
  model: AiAnswer['model'];
  usage: AiAnswer['usage'];
}

/** Errores de la clave del grupo con los que se puede ofrecer la de la persona. */
export const AI_GROUP_KEY_ERRORS = new Set(['sin_clave_del_grupo', 'tope_del_grupo']);

/** Errores que dependen de las claves de la persona: se explican con el enlace a su gestión. */
export const AI_KEY_ERRORS = new Set(['sin_clave_de_ia', 'tope_sin_fijar', 'tope_de_gasto', 'clave_rechazada']);

export const fetchAiModels = (token: string) => apiRequest<AiModelsResponse>('GET', '/api/ia/modelos', token);

/**
 * Los modelos que alcanza la clave de la persona (o, con `space`, los que permite la organización), de la
 * plataforma: `GET /v1/ia/modelos` con su token (`ecosistema-kit/CLAVES_DE_IA.md`, «Elegir el modelo»).
 * `null` si no se puede preguntar (sin SDK o sin conexión con la plataforma), como `fetchAiState`.
 */
export const fetchPlatformModels = (space: number | null) => platformGet<PlatformModels>('/v1/ia/modelos', space);

/**
 * Si cada proveedor está `lista` para la clave que se va a usar y el proveedor preferido de la persona
 * para el texto (kit 1.54; con `space`, sus claves, pero la preferencia sigue siendo de la persona).
 */
export const fetchAiState = (space: number | null) => platformGet<PlatformAiState>('/v1/ia/estado', space);

async function platformGet<T>(path: string, space: number | null): Promise<T | null> {
  const token = await sdk()?.tokenPlataforma?.();
  if (!token) return null;
  const query = space === null ? '' : `?espacio=${space}`;
  try {
    const response = await fetch(`${PLATFORM_API_URL}${path}${query}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    return response.ok ? ((await response.json()) as T) : null;
  } catch {
    return null;
  }
}

/**
 * El modelo que sale elegido por defecto: el equilibrado del proveedor preferido de la persona para el
 * texto, si está `lista` (`ecosistema-kit/CLAVES_DE_IA.md`, «El proveedor preferido de la persona»). Sin
 * preferencia, o si su proveedor no está listo, `undefined` (decide Nodaria). La persona puede escoger otro.
 */
export function preferredModel(models: AiModelInfo[], state: PlatformAiState | null): AiModelInfo | undefined {
  const provider = state?.preferidos?.texto;
  if (!provider || !state.proveedores.some(p => p.proveedor === provider && p.estado === 'lista')) return undefined;
  const own = models.filter(m => m.provider === provider);
  return own.find(m => m.tier === 'equilibrado') ?? own[0];
}

/** Por qué un proveedor no tiene modelos (el `error` de `GET /v1/ia/modelos`), para la persona. */
export const PLATFORM_MODEL_ERRORS: Record<string, string> = {
  sin_clave_de_ia: 'sin clave de IA',
  clave_de_ia_rechazada: 'el proveedor rechaza la clave',
  proveedor_sin_respuesta: 'el proveedor no responde ahora',
  claves_ia_no_configuradas: 'las claves de IA no están disponibles',
};

/**
 * Los modelos de Nodaria que la plataforma dice que alcanza la clave. Nunca se escribe un modelo a mano:
 * solo se elige de esta lista. Sin respuesta de la plataforma, los de Nodaria (que la pasarela comprueba
 * igualmente al pedir). Solo los de texto y nunca uno sin precio en la tabla de la plataforma: con tope,
 * la llamada daría `400 modelo_sin_tarifa` (kit 1.48).
 */
export function reachableModels(own: AiModelInfo[], platform: PlatformModels | null): AiModelInfo[] {
  if (!platform) return own;
  const reachable = new Set(
    platform.proveedores.flatMap(p =>
      p.modelos
        .filter(m => (m.usos === undefined || m.usos.includes('texto')) && m.precio !== null)
        .map(m => `${p.proveedor}:${m.id}`),
    ),
  );
  return own.filter(m => reachable.has(`${m.provider}:${m.id}`));
}

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
    /** En un proyecto de un grupo: su clave (por defecto) o la de la persona, si ella lo elige. */
    keySource?: 'grupo' | 'personal';
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

export interface AiQuestionResponse extends AiWorldReply {
  keySource?: 'grupo' | 'personal';
  conversationId: number;
  userMessageId: number | null;
  messageId: number | null;
}

/** Pregunta sobre el mundo del proyecto: la IA responde con texto y no cambia nada. */
export function requestWorldAnswer(
  token: string,
  request: {
    provider: AiProvider;
    model: string;
    question: string;
    context: AiWorldContext;
    refs: AiWorldRefs;
    projectId: string;
    conversationId: number | null;
    keySource?: 'grupo' | 'personal';
  },
  signal?: AbortSignal,
) {
  return apiRequest<AiQuestionResponse>('POST', '/api/ia/preguntas', token, request, {}, signal);
}
