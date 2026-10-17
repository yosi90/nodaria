import { type Database, sql, withTransaction } from '../db/pool.ts';
import type { PlatformSpace, SpaceEffect } from './model.ts';

/*
 * Grupos de trabajo y sus proyectos compartidos (migración 0009). La pertenencia es una copia del feed
 * de la plataforma; el proyecto del grupo es del grupo y tiene una sola versión en el servidor.
 */

export type GroupState = 'creando' | 'activo' | 'borrando' | 'borrado';

export interface GroupRecord {
  /** idExterno del espacio: el id del grupo para el frontend. */
  externalId: string;
  /** id del espacio en la plataforma (canal, rutas de la persona); `null` mientras se crea. */
  spaceId: number | null;
  name: string;
  owner: string | null;
  state: GroupState;
  createdBy: string;
  /** Nombres propios de los roles en este grupo (solo etiquetas), o `null`. */
  roleLabels: Record<string, string> | null;
}

export interface MemberRecord {
  globalId: string;
  role: string;
  state: string;
}

export interface SharedProjectSummary {
  id: string;
  name: string;
  version: number;
  updatedAt: string;
  serverUpdatedAt: string;
  sizeBytes: number;
  updatedBy: string | null;
}

export interface StoredSharedProject extends SharedProjectSummary {
  document: string;
}

export interface GroupView extends GroupRecord {
  member: MemberRecord;
  projects: SharedProjectSummary[];
}

export interface SharedWrite {
  name: string;
  document: string;
  updatedAt: string;
  by: string;
}

export type SharedWriteResult =
  | { status: 'applied'; version: number; serverUpdatedAt: string }
  | { status: 'conflict'; current: SharedProjectSummary | null };

export type BeginCreateResult = { status: 'created' | 'existing'; group: GroupRecord } | { status: 'taken' };

export type AttachResult = { status: 'attached'; project: SharedProjectSummary } | { status: 'already_shared' };

export interface GroupStore {
  /** Los grupos activos de los que la cuenta es miembro (en cualquier estado), con sus proyectos. */
  listForMember(globalId: string): Promise<GroupView[]>;
  find(externalId: string): Promise<GroupRecord | null>;
  member(externalId: string, globalId: string): Promise<MemberRecord | null>;
  /** Apunta el grupo antes de crear su espacio. Repetirlo con la misma cuenta devuelve el que hay. */
  beginCreate(group: { externalId: string; name: string; createdBy: string }): Promise<BeginCreateResult>;
  /** El espacio ya existe en la plataforma: el grupo queda activo y quien lo creó, como miembro. */
  completeCreate(externalId: string, space: PlatformSpace, creatorRole: string): Promise<GroupRecord>;
  /**
   * Hace del proyecto el proyecto del grupo y quita la copia personal de quien lo comparte (si la
   * tenía en la cuenta). Un id que ya es de otro grupo no se comparte dos veces.
   */
  attachProject(externalId: string, userId: number, write: SharedWrite & { projectId: string }): Promise<AttachResult>;
  /** El grupo al que pertenece un proyecto compartido, o `null`. */
  projectGroup(projectId: string): Promise<string | null>;
  getProject(externalId: string, projectId: string): Promise<StoredSharedProject | null>;
  /** Escribe si `baseVersion` es la versión vigente; si no, devuelve la vigente sin escribir. */
  putProject(
    externalId: string,
    projectId: string,
    write: SharedWrite,
    baseVersion: number,
  ): Promise<SharedWriteResult>;
  /**
   * Empieza a borrar el grupo: sus proyectos pasan a ser proyectos propios de la cuenta elegida y el
   * grupo queda `borrando` hasta que la plataforma borre el espacio (`finishDelete`).
   */
  beginDelete(externalId: string, recipientUserId: number): Promise<{ status: 'started' | 'not_found' }>;
  finishDelete(externalId: string): Promise<void>;
  /** Grupos a medio borrar (el espacio sigue en la plataforma). */
  pendingDeletes(): Promise<string[]>;
  /** Aplica un cambio del feed de los espacios. */
  applyEffect(effect: SpaceEffect): Promise<void>;
  /** Cambia los nombres propios de los roles del grupo (`null` vuelve a los de Nodaria). */
  setRoleLabels(externalId: string, labels: Record<string, string> | null): Promise<void>;
}

interface GroupRow {
  id: number | string;
  external_id: string;
  space_id: number | string | null;
  name: string;
  owner_global_id: string | null;
  state: GroupState;
  created_by: string;
  role_labels: string | null;
}

interface SharedRow {
  project_id: string;
  name: string;
  version: number;
  size_bytes: number;
  updated_at: Date;
  server_updated_at: Date;
  updated_by: string | null;
  document?: string;
}

const guid = (value: string | null) => (value === null ? null : String(value).toLowerCase());

const toGroup = (row: GroupRow): GroupRecord => ({
  externalId: row.external_id,
  spaceId: row.space_id === null ? null : Number(row.space_id),
  name: row.name,
  owner: guid(row.owner_global_id),
  state: row.state,
  createdBy: guid(row.created_by)!,
  roleLabels: row.role_labels ? (JSON.parse(row.role_labels) as Record<string, string>) : null,
});

const toShared = (row: SharedRow): SharedProjectSummary => ({
  id: row.project_id,
  name: row.name,
  version: row.version,
  updatedAt: row.updated_at.toISOString(),
  serverUpdatedAt: row.server_updated_at.toISOString(),
  sizeBytes: row.size_bytes,
  updatedBy: guid(row.updated_by),
});

const GROUP_COLUMNS =
  'g.id, g.external_id, g.space_id, g.name, g.owner_global_id, g.state, g.created_by, g.role_labels';
const SHARED_COLUMNS = 'project_id, name, version, size_bytes, updated_at, server_updated_at, updated_by';

/** Aplica un cambio del feed dentro de una transacción (la del lector del feed, con su cursor). */
export async function applySpaceEffectSql(transaction: sql.Transaction, effect: SpaceEffect) {
  const request = () => new sql.Request(transaction);
  switch (effect.kind) {
    case 'space': {
      const { space } = effect;
      // Un espacio que Nodaria no apuntó (creado y perdido antes de guardarlo) se adopta igualmente.
      await request()
        .input('externalId', sql.VarChar(120), space.idExterno)
        .input('spaceId', sql.BigInt, space.id)
        .input('name', sql.NVarChar(200), space.nombre.slice(0, 200))
        .input('owner', sql.UniqueIdentifier, space.propietario)
        .input('entry', sql.VarChar(20), space.entrada.slice(0, 20))
        .input('twoStep', sql.Bit, space.dosPasos).query(`
          MERGE dbo.groups WITH (HOLDLOCK) AS target
          USING (SELECT @externalId AS external_id) AS source ON target.external_id = source.external_id
          WHEN MATCHED THEN UPDATE SET
            space_id = @spaceId, name = @name, owner_global_id = @owner, entry = @entry, two_step = @twoStep,
            state = CASE WHEN target.state = 'creando' THEN 'activo' ELSE target.state END,
            updated_at = SYSUTCDATETIME()
          WHEN NOT MATCHED THEN INSERT (external_id, space_id, name, owner_global_id, entry, two_step, state, created_by)
            VALUES (@externalId, @spaceId, @name, @owner, @entry, @twoStep, 'activo',
                    COALESCE(@owner, CAST('00000000-0000-0000-0000-000000000000' AS uniqueidentifier)));`);
      return;
    }
    case 'space-deleted': {
      // Si lo borró Nodaria, sus proyectos ya se entregaron. Si lo borró la plataforma (no quedaba nadie
      // al borrarse la última cuenta), no hay a quién dárselos.
      const found = await request()
        .input('externalId', sql.VarChar(120), effect.externalId)
        .query<{ id: number | string }>('SELECT id FROM dbo.groups WITH (UPDLOCK) WHERE external_id = @externalId');
      const id = found.recordset[0]?.id;
      if (id === undefined) return;
      await request().input('id', sql.BigInt, Number(id)).query(`
          DELETE FROM dbo.group_projects WHERE group_id = @id;
          DELETE FROM dbo.group_members WHERE group_id = @id;
          UPDATE dbo.groups SET state = 'borrado', deleted_at = COALESCE(deleted_at, SYSUTCDATETIME()),
            updated_at = SYSUTCDATETIME() WHERE id = @id;`);
      return;
    }
    case 'member':
      await request()
        .input('externalId', sql.VarChar(120), effect.externalId)
        .input('globalId', sql.UniqueIdentifier, effect.globalId)
        .input('role', sql.VarChar(40), effect.role.slice(0, 40))
        .input('state', sql.VarChar(20), effect.state.slice(0, 20)).query(`
          DECLARE @group bigint = (SELECT id FROM dbo.groups WHERE external_id = @externalId AND state <> 'borrado');
          IF @group IS NOT NULL
            MERGE dbo.group_members WITH (HOLDLOCK) AS target
            USING (SELECT @group AS group_id, @globalId AS global_id) AS source
              ON target.group_id = source.group_id AND target.global_id = source.global_id
            WHEN MATCHED THEN UPDATE SET role = @role, state = @state, updated_at = SYSUTCDATETIME()
            WHEN NOT MATCHED THEN INSERT (group_id, global_id, role, state) VALUES (@group, @globalId, @role, @state);`);
      return;
    case 'member-left':
      await request()
        .input('externalId', sql.VarChar(120), effect.externalId)
        .input('globalId', sql.UniqueIdentifier, effect.globalId).query(`
          DELETE m FROM dbo.group_members m JOIN dbo.groups g ON g.id = m.group_id
          WHERE g.external_id = @externalId AND m.global_id = @globalId;`);
      return;
  }
}

export function createSqlGroupStore(db: Database): GroupStore {
  async function groupId(transaction: sql.Transaction, externalId: string) {
    const result = await new sql.Request(transaction)
      .input('externalId', sql.VarChar(120), externalId)
      .query<{ id: number | string }>(
        "SELECT id FROM dbo.groups WITH (UPDLOCK, HOLDLOCK) WHERE external_id = @externalId AND state = 'activo'",
      );
    const id = result.recordset[0]?.id;
    return id === undefined ? null : Number(id);
  }

  return {
    async listForMember(globalId) {
      const groups = await db.request().input('globalId', sql.UniqueIdentifier, globalId).query<
        GroupRow & { role: string; member_state: string }
      >(`
        SELECT ${GROUP_COLUMNS}, m.role, m.state AS member_state
        FROM dbo.groups g JOIN dbo.group_members m ON m.group_id = g.id
        WHERE m.global_id = @globalId AND g.state = 'activo'
        ORDER BY g.name, g.id`);
      if (!groups.recordset.length) return [];
      const projects = await db.request().input('globalId', sql.UniqueIdentifier, globalId).query<
        SharedRow & { group_id: number | string }
      >(`
        SELECT p.group_id, ${SHARED_COLUMNS.split(', ')
          .map(column => `p.${column}`)
          .join(', ')}
        FROM dbo.group_projects p JOIN dbo.group_members m ON m.group_id = p.group_id
        WHERE m.global_id = @globalId`);
      return groups.recordset.map(row => ({
        ...toGroup(row),
        member: { globalId: globalId.toLowerCase(), role: row.role, state: row.member_state },
        projects: projects.recordset.filter(p => Number(p.group_id) === Number(row.id)).map(toShared),
      }));
    },

    async find(externalId) {
      const result = await db
        .request()
        .input('externalId', sql.VarChar(120), externalId)
        .query<GroupRow>(`SELECT ${GROUP_COLUMNS} FROM dbo.groups g WHERE g.external_id = @externalId`);
      return result.recordset[0] ? toGroup(result.recordset[0]) : null;
    },

    async member(externalId, globalId) {
      const result = await db
        .request()
        .input('externalId', sql.VarChar(120), externalId)
        .input('globalId', sql.UniqueIdentifier, globalId).query<{ role: string; state: string }>(`
          SELECT m.role, m.state FROM dbo.group_members m JOIN dbo.groups g ON g.id = m.group_id
          WHERE g.external_id = @externalId AND m.global_id = @globalId`);
      const row = result.recordset[0];
      return row ? { globalId: globalId.toLowerCase(), role: row.role, state: row.state } : null;
    },

    beginCreate({ externalId, name, createdBy }) {
      return withTransaction(db, async transaction => {
        const existing = await new sql.Request(transaction)
          .input('externalId', sql.VarChar(120), externalId)
          .query<GroupRow>(
            `SELECT ${GROUP_COLUMNS} FROM dbo.groups g WITH (UPDLOCK, HOLDLOCK) WHERE g.external_id = @externalId`,
          );
        const row = existing.recordset[0];
        if (row) {
          const group = toGroup(row);
          return group.createdBy === createdBy.toLowerCase() && group.state !== 'borrado' && group.state !== 'borrando'
            ? { status: 'existing', group }
            : { status: 'taken' };
        }
        const inserted = await new sql.Request(transaction)
          .input('externalId', sql.VarChar(120), externalId)
          .input('name', sql.NVarChar(200), name)
          .input('createdBy', sql.UniqueIdentifier, createdBy).query<GroupRow>(`
            INSERT INTO dbo.groups (external_id, name, created_by)
            OUTPUT inserted.id, inserted.external_id, inserted.space_id, inserted.name, inserted.owner_global_id,
                   inserted.state, inserted.created_by, inserted.role_labels
            VALUES (@externalId, @name, @createdBy)`);
        return { status: 'created', group: toGroup(inserted.recordset[0]) };
      });
    },

    completeCreate(externalId, space, creatorRole) {
      return withTransaction(db, async transaction => {
        await applySpaceEffectSql(transaction, { kind: 'space', space });
        await applySpaceEffectSql(transaction, {
          kind: 'member',
          externalId,
          globalId: space.propietario!,
          role: creatorRole,
          state: 'activo',
        });
        const result = await new sql.Request(transaction)
          .input('externalId', sql.VarChar(120), externalId)
          .query<GroupRow>(`SELECT ${GROUP_COLUMNS} FROM dbo.groups g WHERE g.external_id = @externalId`);
        return toGroup(result.recordset[0]);
      });
    },

    attachProject(externalId, userId, write) {
      return withTransaction(db, async transaction => {
        const id = await groupId(transaction, externalId);
        if (id === null) throw new Error(`El grupo ${externalId} no está activo.`);
        const taken = await new sql.Request(transaction)
          .input('projectId', sql.VarChar(100), write.projectId)
          .query<{ group_id: number | string }>(
            'SELECT group_id FROM dbo.group_projects WITH (UPDLOCK, HOLDLOCK) WHERE project_id = @projectId',
          );
        if (taken.recordset.length) {
          if (Number(taken.recordset[0].group_id) !== id) return { status: 'already_shared' };
          const current = await new sql.Request(transaction)
            .input('projectId', sql.VarChar(100), write.projectId)
            .query<SharedRow>(`SELECT ${SHARED_COLUMNS} FROM dbo.group_projects WHERE project_id = @projectId`);
          return { status: 'attached', project: toShared(current.recordset[0]) };
        }
        const inserted = await new sql.Request(transaction)
          .input('projectId', sql.VarChar(100), write.projectId)
          .input('groupId', sql.BigInt, id)
          .input('name', sql.NVarChar(200), write.name)
          .input('document', sql.NVarChar(sql.MAX), write.document)
          .input('size', sql.Int, Buffer.byteLength(write.document, 'utf8'))
          .input('updatedAt', sql.DateTime2(3), new Date(write.updatedAt))
          .input('by', sql.UniqueIdentifier, write.by).query<SharedRow>(`
            INSERT INTO dbo.group_projects (project_id, group_id, name, document, size_bytes, updated_at, updated_by)
            OUTPUT inserted.project_id, inserted.name, inserted.version, inserted.size_bytes, inserted.updated_at,
                   inserted.server_updated_at, inserted.updated_by
            VALUES (@projectId, @groupId, @name, @document, @size, @updatedAt, @by)`);
        // La copia personal queda borrada (sus otros dispositivos se enteran por la sincronización): el
        // proyecto ya es del grupo.
        await new sql.Request(transaction)
          .input('userId', sql.BigInt, userId)
          .input('projectId', sql.VarChar(100), write.projectId).query(`
            UPDATE dbo.projects
            SET document = NULL, size_bytes = 0, deleted_at = SYSUTCDATETIME(),
                server_updated_at = SYSUTCDATETIME(), version = version + 1
            WHERE user_id = @userId AND project_id = @projectId AND deleted_at IS NULL`);
        return { status: 'attached', project: toShared(inserted.recordset[0]) };
      });
    },

    async projectGroup(projectId) {
      const result = await db.request().input('projectId', sql.VarChar(100), projectId).query<{ external_id: string }>(`
        SELECT g.external_id FROM dbo.group_projects p JOIN dbo.groups g ON g.id = p.group_id
        WHERE p.project_id = @projectId`);
      return result.recordset[0]?.external_id ?? null;
    },

    async getProject(externalId, projectId) {
      const result = await db
        .request()
        .input('externalId', sql.VarChar(120), externalId)
        .input('projectId', sql.VarChar(100), projectId).query<SharedRow>(`
          SELECT ${SHARED_COLUMNS.split(', ')
            .map(column => `p.${column}`)
            .join(', ')}, p.document
          FROM dbo.group_projects p JOIN dbo.groups g ON g.id = p.group_id
          WHERE g.external_id = @externalId AND g.state = 'activo' AND p.project_id = @projectId`);
      const row = result.recordset[0];
      return row ? { ...toShared(row), document: row.document! } : null;
    },

    putProject(externalId, projectId, write, baseVersion) {
      return withTransaction(db, async transaction => {
        const id = await groupId(transaction, externalId);
        if (id === null) return { status: 'conflict', current: null };
        const keyed = () =>
          new sql.Request(transaction).input('groupId', sql.BigInt, id).input('projectId', sql.VarChar(100), projectId);
        const existing = await keyed().query<SharedRow>(
          `SELECT ${SHARED_COLUMNS} FROM dbo.group_projects WITH (UPDLOCK, HOLDLOCK)
           WHERE group_id = @groupId AND project_id = @projectId`,
        );
        const current = existing.recordset[0] ? toShared(existing.recordset[0]) : null;
        // Un proyecto del grupo solo entra al compartirlo (attachProject): aquí solo se actualiza.
        if (!current || current.version !== baseVersion) return { status: 'conflict', current };
        const written = await keyed()
          .input('name', sql.NVarChar(200), write.name)
          .input('document', sql.NVarChar(sql.MAX), write.document)
          .input('size', sql.Int, Buffer.byteLength(write.document, 'utf8'))
          .input('updatedAt', sql.DateTime2(3), new Date(write.updatedAt))
          .input('by', sql.UniqueIdentifier, write.by).query<{ version: number; server_updated_at: Date }>(`
            UPDATE dbo.group_projects
            SET name = @name, document = @document, size_bytes = @size, updated_at = @updatedAt, updated_by = @by,
                server_updated_at = SYSUTCDATETIME(), version = version + 1
            OUTPUT inserted.version, inserted.server_updated_at
            WHERE group_id = @groupId AND project_id = @projectId`);
        const row = written.recordset[0];
        return { status: 'applied', version: row.version, serverUpdatedAt: row.server_updated_at.toISOString() };
      });
    },

    beginDelete(externalId, recipientUserId) {
      return withTransaction(db, async transaction => {
        const id = await groupId(transaction, externalId);
        if (id === null) return { status: 'not_found' };
        // Cada proyecto pasa a la cuenta elegida como proyecto propio, con su mismo id. Si esa cuenta
        // tenía un proyecto propio con ese id (borrado o no), lo sustituye y sube su versión.
        await new sql.Request(transaction).input('groupId', sql.BigInt, id).input('userId', sql.BigInt, recipientUserId)
          .query(`
            MERGE dbo.projects WITH (HOLDLOCK) AS target
            USING (SELECT project_id, name, document, size_bytes, updated_at FROM dbo.group_projects
                   WHERE group_id = @groupId) AS source
              ON target.user_id = @userId AND target.project_id = source.project_id
            WHEN MATCHED THEN UPDATE SET name = source.name, document = source.document,
              size_bytes = source.size_bytes, updated_at = source.updated_at, deleted_at = NULL,
              server_updated_at = SYSUTCDATETIME(), version = target.version + 1
            WHEN NOT MATCHED THEN INSERT (user_id, project_id, name, document, size_bytes, updated_at)
              VALUES (@userId, source.project_id, source.name, source.document, source.size_bytes, source.updated_at);
            DELETE FROM dbo.group_projects WHERE group_id = @groupId;
            UPDATE dbo.groups SET state = 'borrando', deleted_at = SYSUTCDATETIME(), updated_at = SYSUTCDATETIME()
            WHERE id = @groupId;`);
        return { status: 'started' };
      });
    },

    async finishDelete(externalId) {
      await db.request().input('externalId', sql.VarChar(120), externalId).query(`
        DECLARE @id bigint = (SELECT id FROM dbo.groups WHERE external_id = @externalId);
        DELETE FROM dbo.group_members WHERE group_id = @id;
        UPDATE dbo.groups SET state = 'borrado', updated_at = SYSUTCDATETIME() WHERE id = @id;`);
    },

    async pendingDeletes() {
      const result = await db
        .request()
        .query<{ external_id: string }>("SELECT external_id FROM dbo.groups WHERE state = 'borrando'");
      return result.recordset.map(row => row.external_id);
    },

    async applyEffect(effect) {
      await withTransaction(db, transaction => applySpaceEffectSql(transaction, effect));
    },

    async setRoleLabels(externalId, labels) {
      await db
        .request()
        .input('externalId', sql.VarChar(120), externalId)
        .input('labels', sql.NVarChar(2000), labels ? JSON.stringify(labels) : null)
        .query(
          'UPDATE dbo.groups SET role_labels = @labels, updated_at = SYSUTCDATETIME() WHERE external_id = @externalId',
        );
    },
  };
}

/** Almacén en memoria con el mismo contrato; lo usan las pruebas de las rutas. */
export function createMemoryGroupStore(
  personal: {
    /** Borra la copia personal (lógico, como el almacén de proyectos). */
    remove(userId: number, projectId: string): Promise<void>;
    /** Da el proyecto a la cuenta como proyecto propio. */
    give(userId: number, project: StoredSharedProject): Promise<void>;
  },
  clock: () => Date = () => new Date(),
): GroupStore {
  interface MemoryGroup extends GroupRecord {
    members: Map<string, MemberRecord>;
  }
  const groups = new Map<string, MemoryGroup>();
  /** Proyectos compartidos por id, con el grupo al que pertenecen. */
  const projects = new Map<string, { group: string; stored: StoredSharedProject }>();

  const summary = (stored: StoredSharedProject): SharedProjectSummary => ({
    id: stored.id,
    name: stored.name,
    version: stored.version,
    updatedAt: stored.updatedAt,
    serverUpdatedAt: stored.serverUpdatedAt,
    sizeBytes: stored.sizeBytes,
    updatedBy: stored.updatedBy,
  });
  const record = (group: MemoryGroup): GroupRecord => ({
    externalId: group.externalId,
    spaceId: group.spaceId,
    name: group.name,
    owner: group.owner,
    state: group.state,
    createdBy: group.createdBy,
    roleLabels: group.roleLabels ? { ...group.roleLabels } : null,
  });
  const active = (externalId: string) => {
    const group = groups.get(externalId);
    return group?.state === 'activo' ? group : null;
  };

  const store: GroupStore = {
    async listForMember(globalId) {
      const id = globalId.toLowerCase();
      return [...groups.values()]
        .filter(group => group.state === 'activo' && group.members.has(id))
        .map(group => ({
          ...record(group),
          member: { ...group.members.get(id)! },
          projects: [...projects.values()].filter(p => p.group === group.externalId).map(p => summary(p.stored)),
        }));
    },
    async find(externalId) {
      const group = groups.get(externalId);
      return group ? record(group) : null;
    },
    async member(externalId, globalId) {
      const found = groups.get(externalId)?.members.get(globalId.toLowerCase());
      return found ? { ...found } : null;
    },
    async beginCreate({ externalId, name, createdBy }) {
      const existing = groups.get(externalId);
      if (existing) {
        return existing.createdBy === createdBy.toLowerCase() &&
          (existing.state === 'creando' || existing.state === 'activo')
          ? { status: 'existing', group: record(existing) }
          : { status: 'taken' };
      }
      const group: MemoryGroup = {
        externalId,
        spaceId: null,
        name,
        owner: null,
        state: 'creando',
        createdBy: createdBy.toLowerCase(),
        roleLabels: null,
        members: new Map(),
      };
      groups.set(externalId, group);
      return { status: 'created', group: record(group) };
    },
    async completeCreate(externalId, space, creatorRole) {
      await store.applyEffect({ kind: 'space', space });
      await store.applyEffect({
        kind: 'member',
        externalId,
        globalId: space.propietario!,
        role: creatorRole,
        state: 'activo',
      });
      return record(groups.get(externalId)!);
    },
    async attachProject(externalId, userId, write) {
      if (!active(externalId)) throw new Error(`El grupo ${externalId} no está activo.`);
      const taken = projects.get(write.projectId);
      if (taken)
        return taken.group === externalId
          ? { status: 'attached', project: summary(taken.stored) }
          : { status: 'already_shared' };
      const stored: StoredSharedProject = {
        id: write.projectId,
        name: write.name,
        version: 1,
        updatedAt: new Date(write.updatedAt).toISOString(),
        serverUpdatedAt: clock().toISOString(),
        sizeBytes: Buffer.byteLength(write.document, 'utf8'),
        updatedBy: write.by.toLowerCase(),
        document: write.document,
      };
      projects.set(write.projectId, { group: externalId, stored });
      await personal.remove(userId, write.projectId);
      return { status: 'attached', project: summary(stored) };
    },
    async projectGroup(projectId) {
      return projects.get(projectId)?.group ?? null;
    },
    async getProject(externalId, projectId) {
      const found = projects.get(projectId);
      if (!found || found.group !== externalId || !active(externalId)) return null;
      return { ...found.stored };
    },
    async putProject(externalId, projectId, write, baseVersion) {
      const found = projects.get(projectId);
      if (!active(externalId) || !found || found.group !== externalId) return { status: 'conflict', current: null };
      if (found.stored.version !== baseVersion) return { status: 'conflict', current: summary(found.stored) };
      const next: StoredSharedProject = {
        ...found.stored,
        name: write.name,
        document: write.document,
        sizeBytes: Buffer.byteLength(write.document, 'utf8'),
        updatedAt: new Date(write.updatedAt).toISOString(),
        updatedBy: write.by.toLowerCase(),
        serverUpdatedAt: clock().toISOString(),
        version: found.stored.version + 1,
      };
      projects.set(projectId, { group: externalId, stored: next });
      return { status: 'applied', version: next.version, serverUpdatedAt: next.serverUpdatedAt };
    },
    async beginDelete(externalId, recipientUserId) {
      const group = active(externalId);
      if (!group) return { status: 'not_found' };
      for (const [id, project] of projects) {
        if (project.group !== externalId) continue;
        await personal.give(recipientUserId, project.stored);
        projects.delete(id);
      }
      group.state = 'borrando';
      return { status: 'started' };
    },
    async finishDelete(externalId) {
      const group = groups.get(externalId);
      if (!group) return;
      group.members.clear();
      group.state = 'borrado';
    },
    async pendingDeletes() {
      return [...groups.values()].filter(group => group.state === 'borrando').map(group => group.externalId);
    },
    async setRoleLabels(externalId, labels) {
      const group = groups.get(externalId);
      if (group) group.roleLabels = labels ? { ...labels } : null;
    },
    async applyEffect(effect) {
      switch (effect.kind) {
        case 'space': {
          const { space } = effect;
          const group = groups.get(space.idExterno) ?? {
            externalId: space.idExterno,
            spaceId: null,
            name: space.nombre,
            owner: null,
            state: 'activo' as GroupState,
            createdBy: space.propietario ?? '',
            roleLabels: null,
            members: new Map<string, MemberRecord>(),
          };
          group.spaceId = space.id;
          group.name = space.nombre;
          group.owner = space.propietario;
          if (group.state === 'creando') group.state = 'activo';
          groups.set(space.idExterno, group);
          return;
        }
        case 'space-deleted': {
          const group = groups.get(effect.externalId);
          if (!group) return;
          for (const [id, project] of projects) if (project.group === effect.externalId) projects.delete(id);
          group.members.clear();
          group.state = 'borrado';
          return;
        }
        case 'member': {
          const group = groups.get(effect.externalId);
          if (!group || group.state === 'borrado') return;
          const id = effect.globalId.toLowerCase();
          group.members.set(id, { globalId: id, role: effect.role, state: effect.state });
          return;
        }
        case 'member-left':
          groups.get(effect.externalId)?.members.delete(effect.globalId.toLowerCase());
          return;
      }
    },
  };
  return store;
}
