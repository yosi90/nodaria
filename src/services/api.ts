// Cliente HTTP de la API de Nodaria (api/). Las rutas privadas llevan el token de la plataforma Yosiftware.

// En desarrollo contra QA la API va por el proxy de Vite (mismo origen): VITE_API_URL vacío.
export const API_BASE_URL: string = import.meta.env.VITE_API_URL ?? 'https://nodaria-api.yosiftware.es';

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  /** Resto de la respuesta de error (por ejemplo `current` en un 409). */
  readonly details: Record<string, unknown>;

  constructor(status: number, code: string, message: string, details: Record<string, unknown> = {}) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

/** La petición no llegó a la API (sin conexión, DNS, CORS…). */
export class OfflineError extends Error {}

export type Method = 'GET' | 'POST' | 'PUT' | 'DELETE';

export async function apiRequest<TResponse>(
  method: Method,
  path: string,
  token: string | null,
  body?: unknown,
  extraHeaders: Record<string, string> = {},
  signal?: AbortSignal,
): Promise<TResponse> {
  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      method,
      headers: {
        ...(token ? { authorization: `Bearer ${token}` } : {}),
        ...(body === undefined ? {} : { 'content-type': 'application/json' }),
        ...extraHeaders,
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal,
    });
  } catch (error) {
    // Cancelar no es estar sin conexión: el llamante lo distingue por `signal.aborted`.
    if (signal?.aborted) throw error;
    throw new OfflineError(error instanceof Error ? error.message : String(error));
  }

  if (response.status === 204) return undefined as TResponse;
  const payload = (await response.json().catch(() => null)) as Record<string, unknown> | null;
  if (!response.ok) {
    const { error, message, ...details } = payload ?? {};
    throw new ApiError(
      response.status,
      typeof error === 'string' ? error : 'request_error',
      typeof message === 'string' ? message : `Error ${response.status} del servidor.`,
      details,
    );
  }
  return payload as TResponse;
}

/** El usuario de Nodaria de la cuenta de Yosiftware con la que se llama. */
export interface MeResponse {
  id: number;
  /** Identificador global de la cuenta. */
  globalId: string;
  /** UID de Firebase con el que esta cuenta sincronizaba antes de migrar (para adoptar su recuerdo). */
  legacyAccount: string | null;
  createdAt: string;
  restrictions: string[];
  restrictionsUntil: string | null;
  rulesPending: boolean;
}

export const fetchMe = (token: string) => apiRequest<MeResponse>('GET', '/api/me', token);
export const deleteMe = (token: string) => apiRequest<void>('DELETE', '/api/me', token);

export interface RemoteProjectSummary {
  id: string;
  name: string;
  version: number;
  updatedAt: string;
  serverUpdatedAt: string;
  deletedAt: string | null;
  sizeBytes: number;
}

export interface RemoteProject extends RemoteProjectSummary {
  document: unknown;
}

export interface WriteResult {
  id: string;
  version: number;
  serverUpdatedAt: string;
}

export const listRemoteProjects = (token: string) =>
  apiRequest<{ projects: RemoteProjectSummary[] }>('GET', '/api/projects', token).then(r => r.projects);
export const getRemoteProject = (token: string, id: string) =>
  apiRequest<RemoteProject>('GET', `/api/projects/${encodeURIComponent(id)}`, token);
export const putRemoteProject = (token: string, id: string, document: unknown, baseVersion: number) =>
  apiRequest<WriteResult>('PUT', `/api/projects/${encodeURIComponent(id)}`, token, { document, baseVersion });
export const deleteRemoteProject = (token: string, id: string, baseVersion: number) =>
  apiRequest<WriteResult>('DELETE', `/api/projects/${encodeURIComponent(id)}?baseVersion=${baseVersion}`, token);
