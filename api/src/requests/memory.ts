import {
  type AdminRequest,
  type BoardRequest,
  DAILY_REQUEST_LIMIT,
  externalIdOf,
  isPublic,
  OPEN_STATUSES,
  type OutboxEvent,
  type OwnRequest,
  type RequestStore,
  type RequestSummary,
  type RequestUpdate,
  type NewRequest,
  type RequestStatus,
  VOTABLE_STATUSES,
} from './model.ts';

interface Row extends NewRequest {
  id: number;
  userId: number;
  status: RequestStatus;
  duplicateOf: number | null;
  createdAt: string;
  updatedAt: string;
  authorReadAt: string | null;
}

interface UpdateRow extends RequestUpdate {
  requestId: number;
  key: string | null;
  hash: string | null;
}

type Author = { displayName: string | null; email: string | null };

/** Almacén en memoria con el mismo contrato que el de SQL; lo usan las pruebas. */
export function createMemoryRequestStore(options: { clock?: () => Date; authorOf?: (userId: number) => Author } = {}) {
  const clock = options.clock ?? (() => new Date());
  const authorOf = options.authorOf ?? (() => ({ displayName: null, email: null }));
  const rows = new Map<number, Row>();
  const updates: UpdateRow[] = [];
  const votes = new Set<string>();
  const outbox: OutboxEvent[] = [];
  let nextId = 1;
  let nextUpdateId = 1;
  // Fechas estrictamente crecientes aunque el reloj no avance entre dos llamadas.
  let last = 0;
  const now = () => {
    last = Math.max(clock().getTime(), last + 1);
    return new Date(last).toISOString();
  };

  const voteKey = (requestId: number, userId: number) => `${requestId}:${userId}`;
  const voteCount = (requestId: number) => [...votes].filter(v => v.startsWith(`${requestId}:`)).length;
  const updatesOf = (requestId: number) => updates.filter(u => u.requestId === requestId);
  const publicUpdate = ({ id, status, message, createdAt }: UpdateRow): RequestUpdate => ({
    id,
    status,
    message,
    createdAt,
  });

  const summary = (row: Row): RequestSummary => ({
    id: row.id,
    kind: row.kind,
    title: row.title,
    body: row.body,
    status: row.status,
    duplicateOf: row.duplicateOf,
    votes: voteCount(row.id),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  });
  const board = (row: Row, viewerId: number | null): BoardRequest => ({
    ...summary(row),
    voted: viewerId !== null && votes.has(voteKey(row.id, viewerId)),
    mine: row.userId === viewerId,
  });
  const own = (row: Row): OwnRequest => {
    const list = updatesOf(row.id).map(publicUpdate);
    const seen = row.authorReadAt ?? row.createdAt;
    return { ...summary(row), updates: list, unread: list.some(u => u.createdAt > seen) };
  };
  const admin = (row: Row): AdminRequest => {
    const list = updatesOf(row.id).map(publicUpdate);
    return {
      ...summary(row),
      externalId: externalIdOf(row.id),
      author: authorOf(row.userId),
      updates: list.slice(-20),
      updatesTotal: list.length,
    };
  };

  const store: RequestStore = {
    async board({ sort, status, limit, offset, viewerId }) {
      const visible = [...rows.values()]
        .filter(row => isPublic(row.kind, row.status) && (status === null || row.status === status))
        .map(row => board(row, viewerId))
        .sort((a, b) =>
          sort === 'votes' && a.votes !== b.votes ? b.votes - a.votes : b.createdAt.localeCompare(a.createdAt),
        );
      return { items: visible.slice(offset, offset + limit), total: visible.length };
    },

    async detail(id, viewerId) {
      const row = rows.get(id);
      if (!row) return null;
      const mine = row.userId === viewerId;
      if (!mine && !isPublic(row.kind, row.status)) return null;
      return { ...board(row, viewerId), updates: updatesOf(id).map(publicUpdate) };
    },

    async create(userId, input, toEvent) {
      const since = new Date(clock().getTime() - 24 * 3600 * 1000).toISOString();
      const recent = [...rows.values()].filter(row => row.userId === userId && row.createdAt > since).length;
      if (recent >= DAILY_REQUEST_LIMIT) return { status: 'rate_limited' };

      const at = now();
      const row: Row = {
        ...input,
        id: nextId++,
        userId,
        status: 'revision',
        duplicateOf: null,
        createdAt: at,
        updatedAt: at,
        authorReadAt: null,
      };
      rows.set(row.id, row);
      if (row.kind === 'idea') votes.add(voteKey(row.id, userId));
      const event = toEvent({ request: own(row), author: authorOf(userId) });
      if (event) outbox.push(event);
      return { status: 'created', request: own(row) };
    },

    async vote(userId, id, voted) {
      const row = rows.get(id);
      if (!row || !isPublic(row.kind, row.status)) return { status: 'not_found' };
      if (!VOTABLE_STATUSES.includes(row.status)) return { status: 'closed' };
      if (voted) votes.add(voteKey(id, userId));
      else votes.delete(voteKey(id, userId));
      return { status: 'ok', votes: voteCount(id), voted };
    },

    async mine(userId) {
      return [...rows.values()]
        .filter(row => row.userId === userId)
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
        .map(own);
    },

    async markRead(userId, id) {
      const row = rows.get(id);
      if (!row || row.userId !== userId) return false;
      row.authorReadAt = now();
      return true;
    },

    async listOpen(limit) {
      const open = [...rows.values()]
        .filter(row => OPEN_STATUSES.includes(row.status))
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
      return { items: open.slice(0, limit).map(admin), hasMore: open.length > limit };
    },

    async adminDetail(id) {
      const row = rows.get(id);
      return row ? admin(row) : null;
    },

    async respond(id, response, { key, hash }) {
      const previous = updates.find(u => u.key === key);
      if (previous) {
        if (previous.requestId !== id || previous.hash !== hash) return { status: 'conflict' };
        return { status: 'replayed', request: admin(rows.get(id)!) };
      }
      const row = rows.get(id);
      if (!row) return { status: 'not_found' };
      if (response.status === 'duplicada') {
        const target = response.duplicateOf === null ? undefined : rows.get(response.duplicateOf);
        if (!target || target.id === id) return { status: 'invalid_duplicate' };
      }
      const at = now();
      row.status = response.status;
      row.duplicateOf = response.status === 'duplicada' ? response.duplicateOf : null;
      row.updatedAt = at;
      updates.push({
        id: nextUpdateId++,
        requestId: id,
        status: response.status,
        message: response.message,
        createdAt: at,
        key,
        hash,
      });
      return { status: 'applied', request: admin(row) };
    },
  };

  return { store, outbox };
}
