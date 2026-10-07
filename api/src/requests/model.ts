// Peticiones de los usuarios: tipos y reglas compartidas por los almacenes y las rutas.

export const REQUEST_KINDS = ['idea', 'error'] as const;
export type RequestKind = (typeof REQUEST_KINDS)[number];

export const REQUEST_STATUSES = [
  'revision',
  'rechazada',
  'abierta',
  'planificada',
  'en_curso',
  'hecha',
  'descartada',
  'duplicada',
] as const;
export type RequestStatus = (typeof REQUEST_STATUSES)[number];

/** Estados en los que una idea aparece en el tablón (los errores nunca son públicos). */
export const PUBLIC_STATUSES: readonly RequestStatus[] = [
  'abierta',
  'planificada',
  'en_curso',
  'hecha',
  'descartada',
  'duplicada',
];
/** Estados en los que una idea admite votos. */
export const VOTABLE_STATUSES: readonly RequestStatus[] = ['abierta', 'planificada', 'en_curso'];
/** Estados que el propietario aún tiene que atender: los que lista el panel de Notificapp. */
export const OPEN_STATUSES: readonly RequestStatus[] = ['revision', 'abierta', 'planificada', 'en_curso'];

/** Peticiones nuevas por usuario en 24 horas. */
export const DAILY_REQUEST_LIMIT = 5;

export const isPublic = (kind: RequestKind, status: RequestStatus) =>
  kind === 'idea' && PUBLIC_STATUSES.includes(status);

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

/** Lo que ve cualquiera en el tablón, más las marcas del visitante si tiene sesión. */
export interface BoardRequest extends RequestSummary {
  voted: boolean;
  mine: boolean;
}

export interface RequestDetail extends BoardRequest {
  updates: RequestUpdate[];
}

/** Petición propia del autor: incluye el historial y si tiene respuestas sin leer. */
export interface OwnRequest extends RequestSummary {
  updates: RequestUpdate[];
  unread: boolean;
}

/** Vista del propietario en el panel de Notificapp. */
export interface AdminRequest extends RequestSummary {
  externalId: string;
  author: { displayName: string | null; email: string | null };
  updates: RequestUpdate[];
  updatesTotal: number;
}

export interface NewRequest {
  kind: RequestKind;
  title: string;
  body: string;
}

export interface RequestResponse {
  status: RequestStatus;
  message: string | null;
  duplicateOf: number | null;
}

export type BoardSort = 'votes' | 'recent';

/** Filtro del panel de administración: `open` limita a las que aún hay que atender. */
export interface AdminQuery {
  scope: 'open' | 'all';
  status: RequestStatus | null;
  kind: RequestKind | null;
  limit: number;
  offset: number;
}

export interface BoardQuery {
  sort: BoardSort;
  status: RequestStatus | null;
  limit: number;
  offset: number;
  viewerId: number | null;
}

/** Aviso que se guarda en la cola de Notificapp en la misma transacción que la petición. */
export interface OutboxEvent {
  externalId: string;
  payload: Record<string, unknown>;
}

export interface CreatedRequest {
  request: OwnRequest;
  author: { displayName: string | null; email: string | null };
}

export const externalIdOf = (id: number) => `request-${id}`;

export interface RequestStore {
  board(query: BoardQuery): Promise<{ items: BoardRequest[]; total: number }>;
  /** Detalle si es público o del visitante; `null` si no existe o no puede verlo. */
  detail(id: number, viewerId: number | null): Promise<RequestDetail | null>;
  /** Crea la petición (y el voto del autor si es una idea) y encola el aviso, todo en una transacción. */
  create(
    userId: number,
    input: NewRequest,
    toEvent: (created: CreatedRequest) => OutboxEvent | null,
  ): Promise<{ status: 'created'; request: OwnRequest } | { status: 'rate_limited' }>;
  vote(
    userId: number,
    id: number,
    voted: boolean,
  ): Promise<{ status: 'ok'; votes: number; voted: boolean } | { status: 'not_found' } | { status: 'closed' }>;
  mine(userId: number): Promise<OwnRequest[]>;
  /** Marca como leídas las respuestas de una petición propia. */
  markRead(userId: number, id: number): Promise<boolean>;
  // Propietario (panel de Notificapp).
  listOpen(limit: number): Promise<{ items: AdminRequest[]; hasMore: boolean }>;
  /** Panel de administración de la web: todas las peticiones, con filtros y paginación. */
  adminList(query: AdminQuery): Promise<{ items: AdminRequest[]; total: number }>;
  adminDetail(id: number): Promise<AdminRequest | null>;
  respond(
    id: number,
    response: RequestResponse,
    idempotency: { key: string; hash: string },
  ): Promise<
    | { status: 'applied' | 'replayed'; request: AdminRequest }
    | { status: 'not_found' }
    | { status: 'conflict' }
    | { status: 'invalid_duplicate' }
  >;
}
