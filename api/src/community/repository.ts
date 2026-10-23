import { randomBytes } from 'node:crypto';
import { type Database, sql, withTransaction } from '../db/pool.ts';
import type { ReportReason } from './model.ts';

/** Un proyecto público tal como lo cuenta la API (sin el documento). */
export interface Publication {
  /** El id público, el del enlace. */
  id: string;
  projectId: string;
  /** El id global de la cuenta que lo publicó. */
  author: string;
  name: string;
  description: string;
  allowCopy: boolean;
  /** Qué dejó fuera quien lo publicó (lo interpreta el frontend). */
  options: Record<string, unknown>;
  state: 'publico' | 'retirado';
  retiredReason: string | null;
  nodeCount: number;
  relationCount: number;
  sizeBytes: number;
  version: number;
  publishedAt: string;
  updatedAt: string;
  /** Tiene imagen del mapa (para la novedad y la vista previa del enlace). */
  hasImage: boolean;
  /** Si es una copia de otro público: el original y quién lo publicó. */
  origin: Record<string, unknown> | null;
  /** El grupo del proyecto, si es de un grupo (lo publica su propiedad). */
  groupId: string | null;
}

export interface StoredPublication extends Publication {
  document: string;
  /** La cuenta sigue activa (no está cerrada ni desactivada en Nodaria). */
  authorActive: boolean;
}

export interface PublicationWrite {
  name: string;
  description: string;
  document: string;
  nodeCount: number;
  relationCount: number;
  options: Record<string, unknown>;
  allowCopy: boolean;
  /** La imagen nueva; sin ella se conserva la que hubiera. */
  image?: Buffer;
  origin?: Record<string, unknown> | null;
  groupId?: string | null;
}

export type OutboxChannel = 'novedades' | 'notificapp';

/** Lo que hay que mandar fuera después de confirmar la transacción. */
export interface OutboxMessage {
  channel: OutboxChannel;
  operation: 'publicar' | 'retirar';
  externalId: string;
  payload: Record<string, unknown>;
}

export interface OutboxItem extends OutboxMessage {
  id: number;
  attempts: number;
}

export interface Report {
  id: number;
  publicId: string;
  reason: ReportReason;
  body: string;
  state: 'pendiente' | 'retirado' | 'desestimado';
  note: string | null;
  createdAt: string;
  resolvedAt: string | null;
}

export interface ReportView extends Report {
  publication: Pick<Publication, 'name' | 'author' | 'state' | 'nodeCount' | 'relationCount' | 'updatedAt'>;
  /** Denuncias pendientes del mismo proyecto, esta incluida. */
  pendingOnPublication: number;
}

export type PublishResult =
  { status: 'applied'; publication: Publication; created: boolean } | { status: 'retired'; publication: Publication };

export type ReportResult = { status: 'created'; report: Report } | { status: 'repeated' | 'not_found' | 'own' };

export type Decision = 'retirar' | 'desestimar';

export interface CommunityStore {
  forProject(userId: number, projectId: string): Promise<Publication | null>;
  mine(userId: number): Promise<Publication[]>;
  get(publicId: string): Promise<StoredPublication | null>;
  /** La imagen de un público visible (no retirado, de una cuenta activa), o `null`. */
  image(publicId: string): Promise<Buffer | null>;
  /** Los públicos visibles (no retirados, de cuentas activas), los más recientes primero. */
  listPublic(filter: { author?: string; limit: number }): Promise<Publication[]>;
  /**
   * Publica o actualiza la copia pública del proyecto. `news` dice qué novedad mandar; se encola en la
   * misma transacción. Uno retirado por moderación no se actualiza.
   */
  publish(
    user: { id: number; globalId: string },
    projectId: string,
    write: PublicationWrite,
    news: (publication: Publication, created: boolean) => OutboxMessage,
  ): Promise<PublishResult>;
  /** Deja de publicar (también al borrar el proyecto) y encola la retirada de sus novedades. */
  unpublish(userId: number, projectId: string): Promise<Publication | null>;
  report(
    publicId: string,
    reporter: string,
    reason: ReportReason,
    body: string,
    event: (report: Report, publication: Publication) => OutboxMessage,
  ): Promise<ReportResult>;
  /** Las pendientes primero (las más antiguas antes) y después las resueltas más recientes. */
  listReports(limit: number): Promise<ReportView[]>;
  getReport(id: number): Promise<ReportView | null>;
  /**
   * Resuelve una denuncia. Retirar oculta el proyecto, resuelve con él las demás pendientes y encola la
   * retirada de sus novedades. Una ya resuelta no cambia (`changed: false`).
   */
  resolveReport(
    id: number,
    decision: Decision,
    note: string | null,
  ): Promise<{ changed: boolean; report: ReportView } | null>;
  due(limit: number, now?: Date): Promise<OutboxItem[]>;
  complete(id: number): Promise<void>;
  retry(id: number, nextAttemptAt: Date, error: string): Promise<void>;
}

/** Copia sin las claves dadas. */
function omit<T extends object, K extends keyof T>(value: T, keys: K[]): Omit<T, K> {
  const copy = { ...value };
  for (const key of keys) delete copy[key];
  return copy;
}

/** Id público: 12 caracteres aleatorios, válidos en una URL. */
export const newPublicId = () => randomBytes(9).toString('base64url');
export const PUBLIC_ID = /^[A-Za-z0-9_-]{12}$/;

/** La retirada sustituye a lo que quedase por mandar de esas novedades. */
const retirements = (externalIds: string[]): OutboxMessage[] =>
  externalIds.map(externalId => ({ channel: 'novedades', operation: 'retirar', externalId, payload: {} }));

interface PublicationRow {
  id: string;
  project_id: string;
  author: string;
  name: string;
  description: string;
  allow_copy: boolean;
  options: string;
  state: Publication['state'];
  retired_reason: string | null;
  node_count: number;
  relation_count: number;
  size_bytes: number;
  version: number;
  published_at: Date;
  updated_at: Date;
  has_image?: number | boolean;
  origin?: string | null;
  group_id?: string | null;
  document?: string;
  author_active?: number | boolean;
}

const toPublication = (row: PublicationRow): Publication => ({
  id: row.id,
  projectId: row.project_id,
  author: row.author.toLowerCase(),
  name: row.name,
  description: row.description,
  allowCopy: Boolean(row.allow_copy),
  options: JSON.parse(row.options) as Record<string, unknown>,
  state: row.state,
  retiredReason: row.retired_reason,
  nodeCount: row.node_count,
  relationCount: row.relation_count,
  sizeBytes: row.size_bytes,
  version: row.version,
  publishedAt: row.published_at.toISOString(),
  updatedAt: row.updated_at.toISOString(),
  hasImage: Boolean(row.has_image),
  origin: row.origin ? (JSON.parse(row.origin) as Record<string, unknown>) : null,
  groupId: row.group_id ?? null,
});

const COLUMNS = `p.id, p.project_id, u.id_global AS author, p.name, p.description, p.allow_copy, p.options, p.state,
  p.retired_reason, p.node_count, p.relation_count, p.size_bytes, p.version, p.published_at, p.updated_at,
  CASE WHEN p.image IS NULL THEN 0 ELSE 1 END AS has_image, p.origin, p.group_id`;
const ACTIVE = 'u.closed_at IS NULL AND u.disabled_at IS NULL';

interface ReportRow {
  id: number | string;
  public_id: string;
  reason: ReportReason;
  body: string;
  state: Report['state'];
  note: string | null;
  created_at: Date;
  resolved_at: Date | null;
  name: string;
  author: string;
  publication_state: Publication['state'];
  node_count: number;
  relation_count: number;
  updated_at: Date;
  pending: number;
}

const toReportView = (row: ReportRow): ReportView => ({
  id: Number(row.id),
  publicId: row.public_id,
  reason: row.reason,
  body: row.body,
  state: row.state,
  note: row.note,
  createdAt: row.created_at.toISOString(),
  resolvedAt: row.resolved_at?.toISOString() ?? null,
  publication: {
    name: row.name,
    author: row.author.toLowerCase(),
    state: row.publication_state,
    nodeCount: row.node_count,
    relationCount: row.relation_count,
    updatedAt: row.updated_at.toISOString(),
  },
  pendingOnPublication: row.pending,
});

const REPORT_SELECT = `SELECT r.id, r.public_id, r.reason, r.body, r.state, r.note, r.created_at, r.resolved_at,
    p.name, u.id_global AS author, p.state AS publication_state, p.node_count, p.relation_count, p.updated_at,
    (SELECT COUNT(*) FROM dbo.public_reports o WHERE o.public_id = r.public_id AND o.state = 'pendiente') AS pending
  FROM dbo.public_reports r
  JOIN dbo.public_projects p ON p.id = r.public_id
  JOIN dbo.users u ON u.id = p.user_id`;

export function createSqlCommunityStore(db: Database): CommunityStore {
  async function enqueue(transaction: sql.Transaction, messages: OutboxMessage[]) {
    for (const message of messages) {
      const request = new sql.Request(transaction)
        .input('channel', sql.VarChar(20), message.channel)
        .input('operation', sql.VarChar(20), message.operation)
        .input('externalId', sql.VarChar(120), message.externalId)
        .input('payload', sql.NVarChar(sql.MAX), JSON.stringify(message.payload));
      // Lo que quedase por mandar de esa misma cosa ya no vale: va lo último.
      await request.query(`
        DELETE FROM dbo.outbox WHERE channel = @channel AND external_id = @externalId;
        INSERT INTO dbo.outbox (channel, operation, external_id, payload)
        VALUES (@channel, @operation, @externalId, @payload);`);
    }
  }

  async function retireNews(transaction: sql.Transaction, publicId: string) {
    const found = await new sql.Request(transaction)
      .input('publicId', sql.VarChar(20), publicId)
      .query<{ external_id: string }>(
        'DELETE FROM dbo.public_news OUTPUT deleted.external_id WHERE public_id = @publicId',
      );
    await enqueue(transaction, retirements(found.recordset.map(r => r.external_id)));
  }

  async function reportById(request: sql.Request, id: number) {
    const result = await request
      .input('reportId', sql.BigInt, id)
      .query<ReportRow>(`${REPORT_SELECT} WHERE r.id = @reportId`);
    return result.recordset[0] ? toReportView(result.recordset[0]) : null;
  }

  return {
    async forProject(userId, projectId) {
      const result = await db
        .request()
        .input('userId', sql.BigInt, userId)
        .input('projectId', sql.VarChar(100), projectId)
        .query<PublicationRow>(
          `SELECT ${COLUMNS} FROM dbo.public_projects p JOIN dbo.users u ON u.id = p.user_id
           WHERE p.user_id = @userId AND p.project_id = @projectId`,
        );
      return result.recordset[0] ? toPublication(result.recordset[0]) : null;
    },

    async mine(userId) {
      const result = await db
        .request()
        .input('userId', sql.BigInt, userId)
        .query<PublicationRow>(
          `SELECT ${COLUMNS} FROM dbo.public_projects p JOIN dbo.users u ON u.id = p.user_id
           WHERE p.user_id = @userId ORDER BY p.updated_at DESC`,
        );
      return result.recordset.map(toPublication);
    },

    async get(publicId) {
      const result = await db
        .request()
        .input('publicId', sql.VarChar(20), publicId)
        .query<PublicationRow>(
          `SELECT ${COLUMNS}, p.document, CASE WHEN ${ACTIVE} THEN 1 ELSE 0 END AS author_active
           FROM dbo.public_projects p JOIN dbo.users u ON u.id = p.user_id WHERE p.id = @publicId`,
        );
      const row = result.recordset[0];
      return row
        ? { ...toPublication(row), document: row.document ?? '{}', authorActive: Boolean(row.author_active) }
        : null;
    },

    async image(publicId) {
      const result = await db
        .request()
        .input('publicId', sql.VarChar(20), publicId)
        .query<{ image: Buffer | null }>(
          `SELECT p.image FROM dbo.public_projects p JOIN dbo.users u ON u.id = p.user_id
           WHERE p.id = @publicId AND p.state = 'publico' AND ${ACTIVE}`,
        );
      return result.recordset[0]?.image ?? null;
    },

    async listPublic({ author, limit }) {
      const request = db.request().input('limit', sql.Int, limit);
      if (author) request.input('author', sql.UniqueIdentifier, author);
      const result = await request.query<PublicationRow>(
        `SELECT TOP (@limit) ${COLUMNS} FROM dbo.public_projects p JOIN dbo.users u ON u.id = p.user_id
         WHERE p.state = 'publico' AND ${ACTIVE} ${author ? 'AND u.id_global = @author' : ''}
         ORDER BY p.updated_at DESC`,
      );
      return result.recordset.map(toPublication);
    },

    publish(user, projectId, write, news) {
      return withTransaction(db, async transaction => {
        const keyed = () =>
          new sql.Request(transaction)
            .input('userId', sql.BigInt, user.id)
            .input('projectId', sql.VarChar(100), projectId);
        const existing = await keyed().query<PublicationRow>(
          `SELECT ${COLUMNS} FROM dbo.public_projects p WITH (UPDLOCK, HOLDLOCK) JOIN dbo.users u ON u.id = p.user_id
           WHERE p.user_id = @userId AND p.project_id = @projectId`,
        );
        const before = existing.recordset[0] ? toPublication(existing.recordset[0]) : null;
        if (before?.state === 'retirado') return { status: 'retired', publication: before };

        const id = before?.id ?? newPublicId();
        await keyed()
          .input('id', sql.VarChar(20), id)
          .input('name', sql.NVarChar(200), write.name)
          .input('description', sql.NVarChar(1000), write.description)
          .input('document', sql.NVarChar(sql.MAX), write.document)
          .input('size', sql.Int, Buffer.byteLength(write.document, 'utf8'))
          .input('nodes', sql.Int, write.nodeCount)
          .input('relations', sql.Int, write.relationCount)
          .input('options', sql.NVarChar(2000), JSON.stringify(write.options))
          .input('allowCopy', sql.Bit, write.allowCopy)
          .input('setImage', sql.Bit, write.image !== undefined)
          .input('image', sql.VarBinary(sql.MAX), write.image ?? null)
          .input('origin', sql.NVarChar(1000), write.origin ? JSON.stringify(write.origin) : null)
          .input('groupId', sql.VarChar(120), write.groupId ?? null)
          .query(
            before
              ? `UPDATE dbo.public_projects SET name = @name, description = @description, document = @document,
                   size_bytes = @size, node_count = @nodes, relation_count = @relations, options = @options,
                   allow_copy = @allowCopy, version = version + 1, updated_at = SYSUTCDATETIME(),
                   image = CASE WHEN @setImage = 1 THEN @image ELSE image END, origin = @origin, group_id = @groupId
                 WHERE id = @id`
              : `INSERT INTO dbo.public_projects (id, user_id, project_id, name, description, document, size_bytes,
                   node_count, relation_count, options, allow_copy, image, origin, group_id)
                 VALUES (@id, @userId, @projectId, @name, @description, @document, @size, @nodes, @relations,
                   @options, @allowCopy, @image, @origin, @groupId)`,
          );
        const written = await keyed().query<PublicationRow>(
          `SELECT ${COLUMNS} FROM dbo.public_projects p JOIN dbo.users u ON u.id = p.user_id
           WHERE p.user_id = @userId AND p.project_id = @projectId`,
        );
        const publication = toPublication(written.recordset[0]);
        const message = news(publication, !before);
        await enqueue(transaction, [message]);
        await new sql.Request(transaction)
          .input('externalId', sql.VarChar(120), message.externalId)
          .input('publicId', sql.VarChar(20), id)
          .input('userId', sql.BigInt, user.id).query(`
            IF NOT EXISTS (SELECT 1 FROM dbo.public_news WHERE external_id = @externalId)
              INSERT INTO dbo.public_news (external_id, public_id, user_id) VALUES (@externalId, @publicId, @userId)`);
        return { status: 'applied', publication, created: !before };
      });
    },

    unpublish(userId, projectId) {
      return withTransaction(db, async transaction => {
        const found = await new sql.Request(transaction)
          .input('userId', sql.BigInt, userId)
          .input('projectId', sql.VarChar(100), projectId)
          .query<PublicationRow>(
            `SELECT ${COLUMNS} FROM dbo.public_projects p WITH (UPDLOCK, HOLDLOCK) JOIN dbo.users u ON u.id = p.user_id
             WHERE p.user_id = @userId AND p.project_id = @projectId`,
          );
        const row = found.recordset[0];
        if (!row) return null;
        await retireNews(transaction, row.id);
        await new sql.Request(transaction)
          .input('id', sql.VarChar(20), row.id)
          .query('DELETE FROM dbo.public_projects WHERE id = @id');
        return toPublication(row);
      });
    },

    report(publicId, reporter, reason, body, event) {
      return withTransaction(db, async transaction => {
        const found = await new sql.Request(transaction)
          .input('publicId', sql.VarChar(20), publicId)
          .query<PublicationRow>(
            `SELECT ${COLUMNS} FROM dbo.public_projects p JOIN dbo.users u ON u.id = p.user_id
             WHERE p.id = @publicId AND p.state = 'publico' AND ${ACTIVE}`,
          );
        const row = found.recordset[0];
        if (!row) return { status: 'not_found' };
        const publication = toPublication(row);
        if (publication.author === reporter.toLowerCase()) return { status: 'own' };
        const inserted = await new sql.Request(transaction)
          .input('publicId', sql.VarChar(20), publicId)
          .input('reporter', sql.UniqueIdentifier, reporter)
          .input('reason', sql.VarChar(30), reason)
          .input('body', sql.NVarChar(500), body).query<{ id: number | string; created_at: Date }>(`
            IF EXISTS (SELECT 1 FROM dbo.public_reports WHERE public_id = @publicId AND reporter = @reporter)
              SELECT TOP 0 CAST(0 AS bigint) AS id, SYSUTCDATETIME() AS created_at;
            ELSE
              INSERT INTO dbo.public_reports (public_id, reporter, reason, body)
              OUTPUT inserted.id, inserted.created_at
              VALUES (@publicId, @reporter, @reason, @body);`);
        const created = inserted.recordset[0];
        if (!created) return { status: 'repeated' };
        const report: Report = {
          id: Number(created.id),
          publicId,
          reason,
          body,
          state: 'pendiente',
          note: null,
          createdAt: created.created_at.toISOString(),
          resolvedAt: null,
        };
        await enqueue(transaction, [event(report, publication)]);
        return { status: 'created', report };
      });
    },

    async listReports(limit) {
      const result = await db
        .request()
        .input('limit', sql.Int, limit)
        .query<ReportRow>(
          `SELECT TOP (@limit) * FROM (${REPORT_SELECT}) AS x
           ORDER BY CASE WHEN x.state = 'pendiente' THEN 0 ELSE 1 END,
             CASE WHEN x.state = 'pendiente' THEN x.created_at END ASC, x.resolved_at DESC`,
        );
      return result.recordset.map(toReportView);
    },

    getReport(id) {
      return reportById(db.request(), id);
    },

    resolveReport(id, decision, note) {
      return withTransaction(db, async transaction => {
        const current = await reportById(new sql.Request(transaction), id);
        if (!current) return null;
        if (current.state !== 'pendiente') return { changed: false, report: current };
        const request = () =>
          new sql.Request(transaction)
            .input('reportId', sql.BigInt, id)
            .input('publicId', sql.VarChar(20), current.publicId)
            .input('note', sql.NVarChar(500), note);
        if (decision === 'desestimar') {
          await request().query(
            `UPDATE dbo.public_reports SET state = 'desestimado', note = @note, resolved_at = SYSUTCDATETIME()
             WHERE id = @reportId`,
          );
        } else {
          await request().query(`
            UPDATE dbo.public_projects SET state = 'retirado', retired_reason = @note WHERE id = @publicId;
            UPDATE dbo.public_reports SET state = 'retirado', note = @note, resolved_at = SYSUTCDATETIME()
            WHERE public_id = @publicId AND state = 'pendiente';`);
          await retireNews(transaction, current.publicId);
        }
        const report = await reportById(new sql.Request(transaction), id);
        return { changed: true, report: report! };
      });
    },

    async due(limit, now = new Date()) {
      const result = await db
        .request()
        .input('limit', sql.Int, limit)
        .input('now', sql.DateTime2(3), now)
        .query<{
          id: number | string;
          channel: OutboxChannel;
          operation: OutboxItem['operation'];
          external_id: string;
          payload: string;
          attempts: number;
        }>(
          `SELECT TOP (@limit) id, channel, operation, external_id, payload, attempts FROM dbo.outbox
           WHERE next_attempt_at <= @now ORDER BY id`,
        );
      return result.recordset.map(row => ({
        id: Number(row.id),
        channel: row.channel,
        operation: row.operation,
        externalId: row.external_id,
        payload: JSON.parse(row.payload) as Record<string, unknown>,
        attempts: row.attempts,
      }));
    },

    async complete(id) {
      await db.request().input('id', sql.BigInt, id).query('DELETE FROM dbo.outbox WHERE id = @id');
    },

    async retry(id, nextAttemptAt, error) {
      await db
        .request()
        .input('id', sql.BigInt, id)
        .input('next', sql.DateTime2(3), nextAttemptAt)
        .input('error', sql.NVarChar(500), error.slice(0, 500))
        .query(
          'UPDATE dbo.outbox SET attempts = attempts + 1, next_attempt_at = @next, last_error = @error WHERE id = @id',
        );
    },
  };
}

/** Almacén en memoria con el mismo contrato; lo usan las pruebas y sirve de referencia del comportamiento. */
export function createMemoryCommunityStore(
  accounts: (userId: number) => { globalId: string; active: boolean } | null,
  clock: () => Date = () => new Date(),
) {
  const rows = new Map<string, StoredPublication & { userId: number }>();
  const images = new Map<string, Buffer>();
  const news = new Map<string, { publicId: string; userId: number }>();
  const reports = new Map<number, Report & { reporter: string }>();
  const outbox: (OutboxItem & { nextAttemptAt: Date })[] = [];
  let nextReport = 1;
  let nextOutbox = 1;

  const strip = (row: StoredPublication & { userId: number }): Publication =>
    omit(row, ['document', 'authorActive', 'userId']);
  const active = (row: { userId: number }) => accounts(row.userId)?.active ?? false;
  const enqueue = (messages: OutboxMessage[]) => {
    for (const message of messages) {
      for (let i = outbox.length - 1; i >= 0; i--)
        if (outbox[i].channel === message.channel && outbox[i].externalId === message.externalId) outbox.splice(i, 1);
      outbox.push({ ...message, id: nextOutbox++, attempts: 0, nextAttemptAt: clock() });
    }
  };
  const retireNews = (publicId: string) => {
    const ids = [...news].filter(([, n]) => n.publicId === publicId).map(([id]) => id);
    for (const id of ids) news.delete(id);
    enqueue(retirements(ids));
  };
  const view = (report: Report): ReportView => {
    const row = rows.get(report.publicId)!;
    return {
      ...report,
      publication: {
        name: row.name,
        author: row.author,
        state: row.state,
        nodeCount: row.nodeCount,
        relationCount: row.relationCount,
        updatedAt: row.updatedAt,
      },
      pendingOnPublication: [...reports.values()].filter(r => r.publicId === report.publicId && r.state === 'pendiente')
        .length,
    };
  };
  const plain = (report: Report & { reporter: string }): Report => omit(report, ['reporter']);
  const find = (userId: number, projectId: string) =>
    [...rows.values()].find(r => r.userId === userId && r.projectId === projectId);

  const store: CommunityStore = {
    async forProject(userId, projectId) {
      const row = find(userId, projectId);
      return row ? strip(row) : null;
    },
    async mine(userId) {
      return [...rows.values()]
        .filter(r => r.userId === userId)
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
        .map(strip);
    },
    async get(publicId) {
      const row = rows.get(publicId);
      if (!row) return null;
      return { ...omit(row, ['userId']), authorActive: active(row) };
    },
    async image(publicId) {
      const row = rows.get(publicId);
      return row && row.state === 'publico' && active(row) ? (images.get(publicId) ?? null) : null;
    },
    async listPublic({ author, limit }) {
      return [...rows.values()]
        .filter(r => r.state === 'publico' && active(r) && (!author || r.author === author.toLowerCase()))
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
        .slice(0, limit)
        .map(strip);
    },
    async publish(user, projectId, write, makeNews) {
      const before = find(user.id, projectId);
      if (before?.state === 'retirado') return { status: 'retired', publication: strip(before) };
      const now = clock().toISOString();
      const row: StoredPublication & { userId: number } = {
        id: before?.id ?? newPublicId(),
        userId: user.id,
        projectId,
        author: user.globalId.toLowerCase(),
        name: write.name,
        description: write.description,
        allowCopy: write.allowCopy,
        options: write.options,
        state: 'publico',
        retiredReason: null,
        nodeCount: write.nodeCount,
        relationCount: write.relationCount,
        sizeBytes: Buffer.byteLength(write.document, 'utf8'),
        version: (before?.version ?? 0) + 1,
        publishedAt: before?.publishedAt ?? now,
        updatedAt: now,
        document: write.document,
        authorActive: true,
        hasImage: write.image !== undefined ? true : (before?.hasImage ?? false),
        origin: write.origin ?? null,
        groupId: write.groupId ?? null,
      };
      if (write.image !== undefined) images.set(row.id, write.image);
      rows.set(row.id, row);
      const publication = strip(row);
      const message = makeNews(publication, !before);
      enqueue([message]);
      if (!news.has(message.externalId)) news.set(message.externalId, { publicId: row.id, userId: user.id });
      return { status: 'applied', publication, created: !before };
    },
    async unpublish(userId, projectId) {
      const row = find(userId, projectId);
      if (!row) return null;
      retireNews(row.id);
      rows.delete(row.id);
      images.delete(row.id);
      for (const [id, report] of reports) if (report.publicId === row.id) reports.delete(id);
      return strip(row);
    },
    async report(publicId, reporter, reason, body, event) {
      const row = rows.get(publicId);
      if (!row || row.state !== 'publico' || !active(row)) return { status: 'not_found' };
      if (row.author === reporter.toLowerCase()) return { status: 'own' };
      if ([...reports.values()].some(r => r.publicId === publicId && r.reporter === reporter.toLowerCase()))
        return { status: 'repeated' };
      const report: Report & { reporter: string } = {
        id: nextReport++,
        publicId,
        reason,
        body,
        state: 'pendiente',
        note: null,
        createdAt: clock().toISOString(),
        resolvedAt: null,
        reporter: reporter.toLowerCase(),
      };
      reports.set(report.id, report);
      enqueue([event(plain(report), strip(row))]);
      return { status: 'created', report: plain(report) };
    },
    async listReports(limit) {
      const all = [...reports.values()].map(plain);
      const pending = all.filter(r => r.state === 'pendiente').sort((a, b) => a.createdAt.localeCompare(b.createdAt));
      const done = all
        .filter(r => r.state !== 'pendiente')
        .sort((a, b) => (b.resolvedAt ?? '').localeCompare(a.resolvedAt ?? ''));
      return [...pending, ...done].slice(0, limit).map(view);
    },
    async getReport(id) {
      const report = reports.get(id);
      return report ? view(plain(report)) : null;
    },
    async resolveReport(id, decision, note) {
      const report = reports.get(id);
      if (!report) return null;
      if (report.state !== 'pendiente') return { changed: false, report: view(plain(report)) };
      const now = clock().toISOString();
      if (decision === 'desestimar') Object.assign(report, { state: 'desestimado', note, resolvedAt: now });
      else {
        const row = rows.get(report.publicId)!;
        Object.assign(row, { state: 'retirado', retiredReason: note });
        for (const other of reports.values())
          if (other.publicId === report.publicId && other.state === 'pendiente')
            Object.assign(other, { state: 'retirado', note, resolvedAt: now });
        retireNews(report.publicId);
      }
      return { changed: true, report: view(plain(report)) };
    },
    async due(limit, now = clock()) {
      return outbox
        .filter(item => item.nextAttemptAt <= now)
        .slice(0, limit)
        .map(item => omit(item, ['nextAttemptAt']));
    },
    async complete(id) {
      const index = outbox.findIndex(item => item.id === id);
      if (index >= 0) outbox.splice(index, 1);
    },
    async retry(id, nextAttemptAt) {
      const item = outbox.find(i => i.id === id);
      if (item) Object.assign(item, { attempts: item.attempts + 1, nextAttemptAt });
    },
  };
  return { store, outbox };
}
