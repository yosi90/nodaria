import { type Database, sql, withTransaction } from '../db/pool.ts';
import {
  type AdminRequest,
  DAILY_REQUEST_LIMIT,
  externalIdOf,
  OPEN_STATUSES,
  type OwnRequest,
  PUBLIC_STATUSES,
  type RequestKind,
  type RequestStatus,
  type RequestStore,
  type RequestSummary,
  type RequestUpdate,
  VOTABLE_STATUSES,
} from './model.ts';

interface RequestRow {
  id: number | string;
  user_id: number | string;
  kind: RequestKind;
  title: string;
  body: string;
  status: RequestStatus;
  duplicate_of: number | string | null;
  created_at: Date;
  updated_at: Date;
  author_read_at: Date | null;
  votes: number;
  voted?: number | boolean;
  display_name?: string | null;
  email?: string | null;
}

interface UpdateRow {
  id: number | string;
  request_id: number | string;
  status: RequestStatus;
  message: string | null;
  created_at: Date;
}

// Los estados son constantes del código, no entrada del usuario: se pueden incrustar.
const inList = (statuses: readonly RequestStatus[]) => statuses.map(status => `'${status}'`).join(', ');

const COLUMNS = `r.id, r.user_id, r.kind, r.title, r.body, r.status, r.duplicate_of, r.created_at, r.updated_at,
  r.author_read_at, (SELECT COUNT(*) FROM dbo.request_votes v WHERE v.request_id = r.id) AS votes`;
const VOTED = `CASE WHEN @viewer IS NOT NULL AND EXISTS (
    SELECT 1 FROM dbo.request_votes v WHERE v.request_id = r.id AND v.user_id = @viewer
  ) THEN 1 ELSE 0 END AS voted`;
const PUBLIC_WHERE = `r.kind = 'idea' AND r.status IN (${inList(PUBLIC_STATUSES)})`;

const toSummary = (row: RequestRow): RequestSummary => ({
  id: Number(row.id),
  kind: row.kind,
  title: row.title,
  body: row.body,
  status: row.status,
  duplicateOf: row.duplicate_of === null ? null : Number(row.duplicate_of),
  votes: row.votes,
  createdAt: row.created_at.toISOString(),
  updatedAt: row.updated_at.toISOString(),
});

const toUpdate = (row: UpdateRow): RequestUpdate => ({
  id: Number(row.id),
  status: row.status,
  message: row.message,
  createdAt: row.created_at.toISOString(),
});

const toOwn = (row: RequestRow, updates: RequestUpdate[]): OwnRequest => {
  const seen = (row.author_read_at ?? row.created_at).getTime();
  return { ...toSummary(row), updates, unread: updates.some(u => Date.parse(u.createdAt) > seen) };
};

const toAdmin = (row: RequestRow, updates: RequestUpdate[]): AdminRequest => ({
  ...toSummary(row),
  externalId: externalIdOf(Number(row.id)),
  author: { displayName: row.display_name ?? null, email: row.email ?? null },
  updates: updates.slice(-20),
  updatesTotal: updates.length,
});

export function createSqlRequestStore(db: Database): RequestStore {
  /** Historial de varias peticiones, en orden cronológico, agrupado por id. */
  async function updatesFor(ids: number[]) {
    const grouped = new Map<number, RequestUpdate[]>();
    if (ids.length === 0) return grouped;
    const result = await db
      .request()
      .input('ids', sql.NVarChar(sql.MAX), JSON.stringify(ids))
      .query<UpdateRow>(
        `SELECT id, request_id, status, message, created_at FROM dbo.request_updates
         WHERE request_id IN (SELECT CAST(value AS bigint) FROM OPENJSON(@ids))
         ORDER BY created_at, id`,
      );
    for (const row of result.recordset) {
      const id = Number(row.request_id);
      grouped.set(id, [...(grouped.get(id) ?? []), toUpdate(row)]);
    }
    return grouped;
  }

  async function adminRows(where: string, top: number | null, bind: (request: sql.Request) => sql.Request) {
    const result = await bind(db.request()).query<RequestRow>(
      `SELECT ${top === null ? '' : `TOP (${top})`} ${COLUMNS}, u.display_name, u.email
       FROM dbo.requests r JOIN dbo.users u ON u.id = r.user_id
       WHERE ${where} ORDER BY r.created_at DESC, r.id DESC`,
    );
    const updates = await updatesFor(result.recordset.map(row => Number(row.id)));
    return result.recordset.map(row => toAdmin(row, updates.get(Number(row.id)) ?? []));
  }

  const adminDetail = async (id: number) =>
    (await adminRows('r.id = @id', null, request => request.input('id', sql.BigInt, id)))[0] ?? null;

  return {
    async board({ sort, status, limit, offset, viewerId }) {
      const bind = () =>
        db
          .request()
          .input('viewer', sql.BigInt, viewerId)
          .input('status', sql.VarChar(20), status)
          .input('limit', sql.Int, limit)
          .input('offset', sql.Int, offset);
      const where = `${PUBLIC_WHERE} AND (@status IS NULL OR r.status = @status)`;
      const [page, count] = await Promise.all([
        bind().query<RequestRow>(
          `SELECT ${COLUMNS}, ${VOTED} FROM dbo.requests r WHERE ${where}
           ORDER BY ${sort === 'votes' ? 'votes DESC, ' : ''}r.created_at DESC, r.id DESC
           OFFSET @offset ROWS FETCH NEXT @limit ROWS ONLY`,
        ),
        bind().query<{ total: number }>(`SELECT COUNT(*) AS total FROM dbo.requests r WHERE ${where}`),
      ]);
      return {
        items: page.recordset.map(row => ({
          ...toSummary(row),
          voted: Boolean(row.voted),
          mine: viewerId !== null && Number(row.user_id) === viewerId,
        })),
        total: count.recordset[0].total,
      };
    },

    async detail(id, viewerId) {
      const result = await db
        .request()
        .input('id', sql.BigInt, id)
        .input('viewer', sql.BigInt, viewerId)
        .query<RequestRow>(
          `SELECT ${COLUMNS}, ${VOTED} FROM dbo.requests r
           WHERE r.id = @id AND ((${PUBLIC_WHERE}) OR r.user_id = @viewer)`,
        );
      const row = result.recordset[0];
      if (!row) return null;
      const updates = await updatesFor([id]);
      return {
        ...toSummary(row),
        voted: Boolean(row.voted),
        mine: viewerId !== null && Number(row.user_id) === viewerId,
        updates: updates.get(id) ?? [],
      };
    },

    create(userId, input, toEvent) {
      return withTransaction(db, async transaction => {
        const request = () => new sql.Request(transaction).input('userId', sql.BigInt, userId);
        // El bloqueo serializa dos envíos simultáneos del mismo usuario para respetar el límite.
        const recent = await request().query<{ n: number }>(
          `SELECT COUNT(*) AS n FROM dbo.requests WITH (UPDLOCK, HOLDLOCK)
           WHERE user_id = @userId AND created_at > DATEADD(hour, -24, SYSUTCDATETIME())`,
        );
        if (recent.recordset[0].n >= DAILY_REQUEST_LIMIT) return { status: 'rate_limited' as const };

        const inserted = await request()
          .input('kind', sql.VarChar(10), input.kind)
          .input('title', sql.NVarChar(120), input.title)
          .input('body', sql.NVarChar(4000), input.body)
          .query<RequestRow>(
            `INSERT INTO dbo.requests (user_id, kind, title, body)
             OUTPUT inserted.id, inserted.user_id, inserted.kind, inserted.title, inserted.body, inserted.status,
                    inserted.duplicate_of, inserted.created_at, inserted.updated_at, inserted.author_read_at,
                    0 AS votes
             VALUES (@userId, @kind, @title, @body)`,
          );
        const row = inserted.recordset[0];
        if (input.kind === 'idea') {
          await request()
            .input('id', sql.BigInt, row.id)
            .query('INSERT INTO dbo.request_votes (request_id, user_id) VALUES (@id, @userId)');
          row.votes = 1;
        }
        const created = toOwn(row, []);

        const author = await request().query<{ display_name: string | null; email: string | null }>(
          'SELECT display_name, email FROM dbo.users WHERE id = @userId',
        );
        const event = toEvent({
          request: created,
          author: { displayName: author.recordset[0]?.display_name ?? null, email: author.recordset[0]?.email ?? null },
        });
        if (event) {
          await new sql.Request(transaction)
            .input('externalId', sql.VarChar(128), event.externalId)
            .input('payload', sql.NVarChar(sql.MAX), JSON.stringify(event.payload))
            .query('INSERT INTO dbo.notificapp_outbox (external_id, payload) VALUES (@externalId, @payload)');
        }
        return { status: 'created' as const, request: created };
      });
    },

    vote(userId, id, voted) {
      return withTransaction(db, async transaction => {
        const request = () =>
          new sql.Request(transaction).input('id', sql.BigInt, id).input('userId', sql.BigInt, userId);
        const found = await request().query<{ kind: RequestKind; status: RequestStatus }>(
          'SELECT kind, status FROM dbo.requests WITH (UPDLOCK) WHERE id = @id',
        );
        const row = found.recordset[0];
        if (!row || row.kind !== 'idea' || !PUBLIC_STATUSES.includes(row.status))
          return { status: 'not_found' as const };
        if (!VOTABLE_STATUSES.includes(row.status)) return { status: 'closed' as const };
        await request().query(
          voted
            ? `IF NOT EXISTS (SELECT 1 FROM dbo.request_votes WHERE request_id = @id AND user_id = @userId)
                 INSERT INTO dbo.request_votes (request_id, user_id) VALUES (@id, @userId)`
            : 'DELETE FROM dbo.request_votes WHERE request_id = @id AND user_id = @userId',
        );
        const count = await request().query<{ n: number }>(
          'SELECT COUNT(*) AS n FROM dbo.request_votes WHERE request_id = @id',
        );
        return { status: 'ok' as const, votes: count.recordset[0].n, voted };
      });
    },

    async mine(userId) {
      const result = await db
        .request()
        .input('userId', sql.BigInt, userId)
        .query<RequestRow>(
          `SELECT ${COLUMNS} FROM dbo.requests r WHERE r.user_id = @userId ORDER BY r.created_at DESC, r.id DESC`,
        );
      const updates = await updatesFor(result.recordset.map(row => Number(row.id)));
      return result.recordset.map(row => toOwn(row, updates.get(Number(row.id)) ?? []));
    },

    async markRead(userId, id) {
      const result = await db
        .request()
        .input('id', sql.BigInt, id)
        .input('userId', sql.BigInt, userId)
        .query('UPDATE dbo.requests SET author_read_at = SYSUTCDATETIME() WHERE id = @id AND user_id = @userId');
      return result.rowsAffected[0] > 0;
    },

    async listOpen(limit) {
      const rows = await adminRows(`r.status IN (${inList(OPEN_STATUSES)})`, limit + 1, request => request);
      return { items: rows.slice(0, limit), hasMore: rows.length > limit };
    },

    adminDetail,

    async respond(id, response, { key, hash }) {
      const outcome = await withTransaction(db, async transaction => {
        const request = () => new sql.Request(transaction).input('id', sql.BigInt, id);
        const previous = await request()
          .input('key', sql.VarChar(128), key)
          .query<{ request_id: number | string; request_hash: string }>(
            `SELECT request_id, request_hash FROM dbo.request_updates WITH (UPDLOCK, HOLDLOCK)
             WHERE idempotency_key = @key`,
          );
        const replay = previous.recordset[0];
        if (replay) {
          return Number(replay.request_id) === id && replay.request_hash.trim() === hash ? 'replayed' : 'conflict';
        }

        const found = await request().query('SELECT id FROM dbo.requests WITH (UPDLOCK) WHERE id = @id');
        if (found.recordset.length === 0) return 'not_found';
        if (response.status === 'duplicada') {
          const target = await request()
            .input('target', sql.BigInt, response.duplicateOf)
            .query('SELECT id FROM dbo.requests WHERE id = @target AND id <> @id');
          if (response.duplicateOf === null || target.recordset.length === 0) return 'invalid_duplicate';
        }

        await request()
          .input('status', sql.VarChar(20), response.status)
          .input('duplicateOf', sql.BigInt, response.status === 'duplicada' ? response.duplicateOf : null)
          .input('message', sql.NVarChar(2000), response.message)
          .input('key', sql.VarChar(128), key)
          .input('hash', sql.Char(64), hash).query(`
            UPDATE dbo.requests SET status = @status, duplicate_of = @duplicateOf, updated_at = SYSUTCDATETIME()
            WHERE id = @id;
            INSERT INTO dbo.request_updates (request_id, status, message, idempotency_key, request_hash)
            VALUES (@id, @status, @message, @key, @hash);`);
        return 'applied';
      });

      if (outcome === 'applied' || outcome === 'replayed') {
        return { status: outcome, request: (await adminDetail(id))! };
      }
      return { status: outcome };
    },
  };
}
