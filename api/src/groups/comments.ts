import { type Database, sql } from '../db/pool.ts';

/*
 * Comentarios y sugerencias de los proyectos de grupo (migración 0010, hito 5). Van aparte del
 * documento, así que quien solo revisa puede comentar sin cambiar el proyecto. Una sugerencia propone
 * el valor de un atributo de un nodo; aceptarla la aplica quien puede editar, en su navegador, como
 * cualquier otro cambio del proyecto, y aquí solo queda su estado.
 */

export type CommentState = 'abierto' | 'resuelto' | 'aceptado' | 'rechazado';

export interface Suggestion {
  fieldId: string;
  value: unknown;
}

export interface GroupComment {
  id: number;
  projectId: string;
  nodeId: string | null;
  author: string;
  body: string;
  suggestion: Suggestion | null;
  state: CommentState;
  resolvedBy: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface NewComment {
  nodeId: string | null;
  author: string;
  body: string;
  suggestion: Suggestion | null;
}

export interface CommentStore {
  list(projectId: string): Promise<GroupComment[]>;
  get(projectId: string, id: number): Promise<GroupComment | null>;
  create(projectId: string, comment: NewComment): Promise<GroupComment>;
  setState(projectId: string, id: number, state: CommentState, by: string): Promise<GroupComment | null>;
  delete(projectId: string, id: number): Promise<void>;
}

/** Como mucho, comentarios por proyecto (abiertos y cerrados). */
export const MAX_COMMENTS = 2000;

interface CommentRow {
  id: number | string;
  project_id: string;
  node_id: string | null;
  author: string;
  body: string;
  suggestion: string | null;
  state: CommentState;
  resolved_by: string | null;
  created_at: Date;
  updated_at: Date;
}

const guid = (value: string | null) => (value === null ? null : String(value).toLowerCase());

const toComment = (row: CommentRow): GroupComment => ({
  id: Number(row.id),
  projectId: row.project_id,
  nodeId: row.node_id,
  author: guid(row.author)!,
  body: row.body,
  suggestion: row.suggestion ? (JSON.parse(row.suggestion) as Suggestion) : null,
  state: row.state,
  resolvedBy: guid(row.resolved_by),
  createdAt: row.created_at.toISOString(),
  updatedAt: row.updated_at.toISOString(),
});

const COLUMNS = 'id, project_id, node_id, author, body, suggestion, state, resolved_by, created_at, updated_at';

export function createSqlCommentStore(db: Database): CommentStore {
  return {
    async list(projectId) {
      const result = await db
        .request()
        .input('projectId', sql.VarChar(100), projectId)
        .query<CommentRow>(
          `SELECT TOP (${MAX_COMMENTS}) ${COLUMNS} FROM dbo.group_comments WHERE project_id = @projectId ORDER BY created_at, id`,
        );
      return result.recordset.map(toComment);
    },
    async get(projectId, id) {
      const result = await db
        .request()
        .input('projectId', sql.VarChar(100), projectId)
        .input('id', sql.BigInt, id)
        .query<CommentRow>(`SELECT ${COLUMNS} FROM dbo.group_comments WHERE project_id = @projectId AND id = @id`);
      return result.recordset[0] ? toComment(result.recordset[0]) : null;
    },
    async create(projectId, comment) {
      const result = await db
        .request()
        .input('projectId', sql.VarChar(100), projectId)
        .input('nodeId', sql.VarChar(100), comment.nodeId)
        .input('author', sql.UniqueIdentifier, comment.author)
        .input('body', sql.NVarChar(4000), comment.body)
        .input('suggestion', sql.NVarChar(sql.MAX), comment.suggestion ? JSON.stringify(comment.suggestion) : null)
        .query<CommentRow>(`
          INSERT INTO dbo.group_comments (project_id, node_id, author, body, suggestion)
          OUTPUT ${COLUMNS.split(', ')
            .map(column => `inserted.${column}`)
            .join(', ')}
          VALUES (@projectId, @nodeId, @author, @body, @suggestion)`);
      return toComment(result.recordset[0]);
    },
    async setState(projectId, id, state, by) {
      const result = await db
        .request()
        .input('projectId', sql.VarChar(100), projectId)
        .input('id', sql.BigInt, id)
        .input('state', sql.VarChar(20), state)
        .input('by', sql.UniqueIdentifier, state === 'abierto' ? null : by).query<CommentRow>(`
          UPDATE dbo.group_comments SET state = @state, resolved_by = @by, updated_at = SYSUTCDATETIME()
          OUTPUT ${COLUMNS.split(', ')
            .map(column => `inserted.${column}`)
            .join(', ')}
          WHERE project_id = @projectId AND id = @id`);
      return result.recordset[0] ? toComment(result.recordset[0]) : null;
    },
    async delete(projectId, id) {
      await db
        .request()
        .input('projectId', sql.VarChar(100), projectId)
        .input('id', sql.BigInt, id)
        .query('DELETE FROM dbo.group_comments WHERE project_id = @projectId AND id = @id');
    },
  };
}

/** Almacén en memoria con el mismo contrato; lo usan las pruebas de las rutas. */
export function createMemoryCommentStore(clock: () => Date = () => new Date()): CommentStore {
  const rows: GroupComment[] = [];
  let nextId = 1;
  return {
    async list(projectId) {
      return rows.filter(c => c.projectId === projectId).map(c => ({ ...c }));
    },
    async get(projectId, id) {
      const found = rows.find(c => c.projectId === projectId && c.id === id);
      return found ? { ...found } : null;
    },
    async create(projectId, comment) {
      const at = clock().toISOString();
      const created: GroupComment = {
        id: nextId++,
        projectId,
        nodeId: comment.nodeId,
        author: comment.author.toLowerCase(),
        body: comment.body,
        suggestion: comment.suggestion,
        state: 'abierto',
        resolvedBy: null,
        createdAt: at,
        updatedAt: at,
      };
      rows.push(created);
      return { ...created };
    },
    async setState(projectId, id, state, by) {
      const found = rows.find(c => c.projectId === projectId && c.id === id);
      if (!found) return null;
      found.state = state;
      found.resolvedBy = state === 'abierto' ? null : by.toLowerCase();
      found.updatedAt = clock().toISOString();
      return { ...found };
    },
    async delete(projectId, id) {
      const index = rows.findIndex(c => c.projectId === projectId && c.id === id);
      if (index >= 0) rows.splice(index, 1);
    },
  };
}
