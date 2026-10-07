// Cliente HTTP de la API de Nodaria (api/). Las rutas privadas llevan el ID token de Firebase.

export const API_BASE_URL: string =
  import.meta.env.VITE_API_URL ?? (import.meta.env.DEV ? 'http://127.0.0.1:5003' : 'https://nodaria-api.yosiftware.es');

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
    });
  } catch (error) {
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

export interface MeResponse {
  id: number;
  email: string | null;
  emailVerified: boolean;
  displayName: string | null;
  photoUrl: string | null;
  signInProvider: string;
  createdAt: string;
  lastSeenAt: string;
  /** La cuenta es del propietario: su dispositivo no cuenta en Yosiftadísticas. */
  excludeFromStats: boolean;
  /** Puede usar el panel de administración. */
  isAdmin: boolean;
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

// Peticiones: tablón público de ideas con votos y avisos de error privados.
export type RequestKind = 'idea' | 'error';
export type RequestStatus =
  'revision' | 'rechazada' | 'abierta' | 'planificada' | 'en_curso' | 'hecha' | 'descartada' | 'duplicada';

export interface RequestUpdate {
  id: number;
  status: RequestStatus;
  message: string | null;
  createdAt: string;
}

export interface RequestSummary {
  id: number;
  kind: RequestKind;
  title: string;
  body: string;
  status: RequestStatus;
  duplicateOf: number | null;
  votes: number;
  createdAt: string;
  updatedAt: string;
}

export interface BoardRequest extends RequestSummary {
  voted: boolean;
  mine: boolean;
}

export interface RequestDetail extends BoardRequest {
  updates: RequestUpdate[];
}

export interface OwnRequest extends RequestSummary {
  updates: RequestUpdate[];
  unread: boolean;
}

export interface BoardPage {
  items: BoardRequest[];
  total: number;
  limit: number;
  offset: number;
}

export interface BoardParams {
  sort: 'votes' | 'recent';
  status: RequestStatus | null;
  offset: number;
}

export const fetchBoard = (token: string | null, { sort, status, offset }: BoardParams) => {
  const query = new URLSearchParams({ sort, offset: String(offset), limit: '30' });
  if (status) query.set('status', status);
  return apiRequest<BoardPage>('GET', `/api/requests?${query}`, token);
};
export const fetchRequest = (token: string | null, id: number) =>
  apiRequest<RequestDetail>('GET', `/api/requests/${id}`, token);
export const createRequest = (token: string, input: { kind: RequestKind; title: string; body: string }) =>
  apiRequest<OwnRequest>('POST', '/api/requests', token, input);
export const voteRequest = (token: string, id: number, voted: boolean) =>
  apiRequest<{ id: number; votes: number; voted: boolean }>(
    voted ? 'PUT' : 'DELETE',
    `/api/requests/${id}/vote`,
    token,
  );
export const fetchMyRequests = (token: string) =>
  apiRequest<{ requests: OwnRequest[] }>('GET', '/api/me/requests', token);
export const markRequestRead = (token: string, id: number) =>
  apiRequest<void>('POST', `/api/me/requests/${id}/read`, token);

// Administración: solo cuentas con `isAdmin`.
export interface AdminRequest extends RequestSummary {
  externalId: string;
  author: { displayName: string | null; email: string | null };
  updates: RequestUpdate[];
  updatesTotal: number;
}

export interface AdminListParams {
  scope: 'open' | 'all';
  status: RequestStatus | null;
  kind: RequestKind | null;
  offset: number;
}

export const fetchAdminRequests = (token: string, { scope, status, kind, offset }: AdminListParams) => {
  const query = new URLSearchParams({ scope, offset: String(offset), limit: '50' });
  if (status) query.set('status', status);
  if (kind) query.set('kind', kind);
  return apiRequest<{ items: AdminRequest[]; total: number }>('GET', `/api/admin/requests?${query}`, token);
};

export interface AdminResponse {
  status: RequestStatus;
  message: string | null;
  duplicateOf: number | null;
}

/** La misma `key` con la misma respuesta no se aplica dos veces (reintentos tras un corte). */
export const respondAdminRequest = (token: string, id: number, response: AdminResponse, key: string) =>
  apiRequest<AdminRequest & { replayed: boolean }>('POST', `/api/admin/requests/${id}/responses`, token, response, {
    'Idempotency-Key': key,
  });
