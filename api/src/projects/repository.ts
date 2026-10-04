import { type Database, sql, withTransaction } from '../db/pool.ts';

/** Resumen de un proyecto tal como lo lista la API (borrados incluidos). */
export interface ProjectSummary {
  id: string;
  name: string;
  version: number;
  /** `Project.updatedAt` según el cliente que hizo la última escritura. */
  updatedAt: string;
  serverUpdatedAt: string;
  deletedAt: string | null;
  sizeBytes: number;
}

export interface StoredProject extends ProjectSummary {
  /** JSON del `Project` del front; `null` cuando está borrado. */
  document: string | null;
}

export interface ProjectWrite {
  name: string;
  document: string;
  updatedAt: string;
}

export type WriteResult =
  | { status: 'applied'; version: number; serverUpdatedAt: string }
  | { status: 'conflict'; current: ProjectSummary | null };

export interface ProjectStore {
  list(userId: number): Promise<ProjectSummary[]>;
  get(userId: number, projectId: string): Promise<StoredProject | null>;
  /**
   * Crea o actualiza. `baseVersion` es la versión de la que partió el cliente (0 si es nuevo).
   * Si no coincide con la almacenada, no escribe y devuelve la versión vigente.
   */
  put(userId: number, projectId: string, write: ProjectWrite, baseVersion: number): Promise<WriteResult>;
  /** Borrado lógico. Con `baseVersion` nulo no comprueba la versión. Borrar lo ya borrado es idempotente. */
  delete(userId: number, projectId: string, baseVersion: number | null): Promise<WriteResult | { status: 'not_found' }>;
}

interface ProjectRow {
  project_id: string;
  name: string;
  version: number;
  size_bytes: number;
  updated_at: Date;
  server_updated_at: Date;
  deleted_at: Date | null;
  document?: string | null;
}

const toSummary = (row: ProjectRow): ProjectSummary => ({
  id: row.project_id,
  name: row.name,
  version: row.version,
  updatedAt: row.updated_at.toISOString(),
  serverUpdatedAt: row.server_updated_at.toISOString(),
  deletedAt: row.deleted_at?.toISOString() ?? null,
  sizeBytes: row.size_bytes,
});

const SUMMARY_COLUMNS = 'project_id, name, version, size_bytes, updated_at, server_updated_at, deleted_at';

export function createSqlProjectStore(db: Database): ProjectStore {
  const keyed = (transaction: sql.Transaction, userId: number, projectId: string) =>
    new sql.Request(transaction).input('userId', sql.BigInt, userId).input('id', sql.VarChar(100), projectId);

  async function current(transaction: sql.Transaction, userId: number, projectId: string) {
    const result = await keyed(transaction, userId, projectId).query<ProjectRow>(
      `SELECT ${SUMMARY_COLUMNS} FROM dbo.projects WITH (UPDLOCK, HOLDLOCK)
       WHERE user_id = @userId AND project_id = @id`,
    );
    return result.recordset[0] ? toSummary(result.recordset[0]) : null;
  }

  return {
    async list(userId) {
      const result = await db
        .request()
        .input('userId', sql.BigInt, userId)
        .query<ProjectRow>(
          `SELECT ${SUMMARY_COLUMNS} FROM dbo.projects WHERE user_id = @userId ORDER BY server_updated_at DESC`,
        );
      return result.recordset.map(toSummary);
    },

    async get(userId, projectId) {
      const result = await db
        .request()
        .input('userId', sql.BigInt, userId)
        .input('id', sql.VarChar(100), projectId)
        .query<ProjectRow>(
          `SELECT ${SUMMARY_COLUMNS}, document FROM dbo.projects WHERE user_id = @userId AND project_id = @id`,
        );
      const row = result.recordset[0];
      return row ? { ...toSummary(row), document: row.document ?? null } : null;
    },

    put(userId, projectId, write, baseVersion) {
      return withTransaction(db, async transaction => {
        const existing = await current(transaction, userId, projectId);
        if ((existing?.version ?? 0) !== baseVersion) return { status: 'conflict', current: existing };

        const request = keyed(transaction, userId, projectId)
          .input('name', sql.NVarChar(200), write.name)
          .input('document', sql.NVarChar(sql.MAX), write.document)
          .input('size', sql.Int, Buffer.byteLength(write.document, 'utf8'))
          .input('updatedAt', sql.DateTime2(3), new Date(write.updatedAt));
        const written = await request.query<{ version: number; server_updated_at: Date }>(
          existing
            ? `UPDATE dbo.projects
               SET name = @name, document = @document, size_bytes = @size, updated_at = @updatedAt,
                   server_updated_at = SYSUTCDATETIME(), deleted_at = NULL, version = version + 1
               OUTPUT inserted.version, inserted.server_updated_at
               WHERE user_id = @userId AND project_id = @id`
            : `INSERT INTO dbo.projects (user_id, project_id, name, document, size_bytes, updated_at)
               OUTPUT inserted.version, inserted.server_updated_at
               VALUES (@userId, @id, @name, @document, @size, @updatedAt)`,
        );
        const row = written.recordset[0];
        return { status: 'applied', version: row.version, serverUpdatedAt: row.server_updated_at.toISOString() };
      });
    },

    delete(userId, projectId, baseVersion) {
      return withTransaction(db, async transaction => {
        const existing = await current(transaction, userId, projectId);
        if (!existing) return { status: 'not_found' };
        if (existing.deletedAt)
          return { status: 'applied', version: existing.version, serverUpdatedAt: existing.serverUpdatedAt };
        if (baseVersion !== null && existing.version !== baseVersion) return { status: 'conflict', current: existing };

        const written = await keyed(transaction, userId, projectId).query<{ version: number; server_updated_at: Date }>(
          `UPDATE dbo.projects
           SET document = NULL, size_bytes = 0, deleted_at = SYSUTCDATETIME(),
               server_updated_at = SYSUTCDATETIME(), version = version + 1
           OUTPUT inserted.version, inserted.server_updated_at
           WHERE user_id = @userId AND project_id = @id`,
        );
        const row = written.recordset[0];
        return { status: 'applied', version: row.version, serverUpdatedAt: row.server_updated_at.toISOString() };
      });
    },
  };
}

/** Almacén en memoria con el mismo contrato; lo usan las pruebas y sirve de referencia del comportamiento. */
export function createMemoryProjectStore(clock: () => Date = () => new Date()): ProjectStore {
  const rows = new Map<string, StoredProject>();
  const key = (userId: number, projectId: string) => `${userId}:${projectId}`;
  const summary = (row: StoredProject): ProjectSummary => ({
    id: row.id,
    name: row.name,
    version: row.version,
    updatedAt: row.updatedAt,
    serverUpdatedAt: row.serverUpdatedAt,
    deletedAt: row.deletedAt,
    sizeBytes: row.sizeBytes,
  });

  return {
    async list(userId) {
      return [...rows.entries()]
        .filter(([k]) => k.startsWith(`${userId}:`))
        .map(([, row]) => summary(row))
        .sort((a, b) => b.serverUpdatedAt.localeCompare(a.serverUpdatedAt));
    },
    async get(userId, projectId) {
      return rows.get(key(userId, projectId)) ?? null;
    },
    async put(userId, projectId, write, baseVersion) {
      const existing = rows.get(key(userId, projectId));
      if ((existing?.version ?? 0) !== baseVersion)
        return { status: 'conflict', current: existing ? summary(existing) : null };
      const serverUpdatedAt = clock().toISOString();
      const version = (existing?.version ?? 0) + 1;
      rows.set(key(userId, projectId), {
        id: projectId,
        name: write.name,
        document: write.document,
        version,
        updatedAt: new Date(write.updatedAt).toISOString(),
        serverUpdatedAt,
        deletedAt: null,
        sizeBytes: Buffer.byteLength(write.document, 'utf8'),
      });
      return { status: 'applied', version, serverUpdatedAt };
    },
    async delete(userId, projectId, baseVersion) {
      const existing = rows.get(key(userId, projectId));
      if (!existing) return { status: 'not_found' };
      if (existing.deletedAt)
        return { status: 'applied', version: existing.version, serverUpdatedAt: existing.serverUpdatedAt };
      if (baseVersion !== null && existing.version !== baseVersion)
        return { status: 'conflict', current: summary(existing) };
      const serverUpdatedAt = clock().toISOString();
      const version = existing.version + 1;
      rows.set(key(userId, projectId), {
        ...existing,
        document: null,
        sizeBytes: 0,
        version,
        serverUpdatedAt,
        deletedAt: serverUpdatedAt,
      });
      return { status: 'applied', version, serverUpdatedAt };
    },
  };
}
