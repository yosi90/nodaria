import { type Database, sql, withTransaction } from '../db/pool.ts';

/*
 * Historial del asistente de IA: conversaciones de cada cuenta por proyecto (`0008_ai_conversations`).
 * Solo las ve su dueño. Cada mensaje guarda su contenido como JSON: la petición, la propuesta con su
 * modelo, uso y lo aplicado, o el error que se le explicó a la persona.
 */

export type AiMessageRole = 'user' | 'assistant' | 'error';

export interface AiStoredMessage {
  id: number;
  role: AiMessageRole;
  content: Record<string, unknown>;
  createdAt: string;
}

export interface AiConversationSummary {
  id: number;
  projectId: string;
  title: string;
  createdAt: string;
  updatedAt: string;
}

export interface AiConversation extends AiConversationSummary {
  messages: AiStoredMessage[];
}

export interface ConversationStore {
  list(userId: number, projectId: string): Promise<AiConversationSummary[]>;
  get(userId: number, conversationId: number): Promise<AiConversation | null>;
  create(userId: number, projectId: string, title: string): Promise<AiConversationSummary>;
  /** Añade un mensaje y actualiza la fecha de la conversación. `null` si no es de la cuenta. */
  addMessage(
    userId: number,
    conversationId: number,
    role: AiMessageRole,
    content: Record<string, unknown>,
  ): Promise<AiStoredMessage | null>;
  /** Mezcla campos en el contenido de un mensaje de la propuesta (lo aplicado). `false` si no es suyo. */
  updateAssistantMessage(userId: number, messageId: number, patch: Record<string, unknown>): Promise<boolean>;
  delete(userId: number, conversationId: number): Promise<boolean>;
  deleteForProject(userId: number, projectId: string): Promise<void>;
}

/** Conversaciones que se listan por proyecto (las más recientes) y mensajes por conversación. */
export const MAX_CONVERSATIONS_LISTED = 50;
export const MAX_MESSAGES = 200;

interface ConversationRow {
  id: number | string;
  project_id: string;
  title: string;
  created_at: Date;
  updated_at: Date;
}
interface MessageRow {
  id: number | string;
  role: AiMessageRole;
  content: string;
  created_at: Date;
}

const toSummary = (row: ConversationRow): AiConversationSummary => ({
  id: Number(row.id),
  projectId: row.project_id,
  title: row.title,
  createdAt: row.created_at.toISOString(),
  updatedAt: row.updated_at.toISOString(),
});
const toMessage = (row: MessageRow): AiStoredMessage => ({
  id: Number(row.id),
  role: row.role,
  content: JSON.parse(row.content) as Record<string, unknown>,
  createdAt: row.created_at.toISOString(),
});

export function createSqlConversationStore(db: Database): ConversationStore {
  return {
    async list(userId, projectId) {
      const result = await db
        .request()
        .input('userId', sql.BigInt, userId)
        .input('projectId', sql.VarChar(100), projectId)
        .input('limit', sql.Int, MAX_CONVERSATIONS_LISTED)
        .query<ConversationRow>(
          `SELECT TOP (@limit) id, project_id, title, created_at, updated_at FROM dbo.ai_conversations
           WHERE user_id = @userId AND project_id = @projectId ORDER BY updated_at DESC, id DESC`,
        );
      return result.recordset.map(toSummary);
    },

    async get(userId, conversationId) {
      const head = await db
        .request()
        .input('userId', sql.BigInt, userId)
        .input('id', sql.BigInt, conversationId)
        .query<ConversationRow>(
          `SELECT id, project_id, title, created_at, updated_at FROM dbo.ai_conversations
           WHERE id = @id AND user_id = @userId`,
        );
      const row = head.recordset[0];
      if (!row) return null;
      const messages = await db
        .request()
        .input('id', sql.BigInt, conversationId)
        .input('limit', sql.Int, MAX_MESSAGES)
        .query<MessageRow>(
          `SELECT id, role, content, created_at FROM (
             SELECT TOP (@limit) id, role, content, created_at FROM dbo.ai_messages
             WHERE conversation_id = @id ORDER BY id DESC
           ) AS last ORDER BY id`,
        );
      return { ...toSummary(row), messages: messages.recordset.map(toMessage) };
    },

    async create(userId, projectId, title) {
      const result = await db
        .request()
        .input('userId', sql.BigInt, userId)
        .input('projectId', sql.VarChar(100), projectId)
        .input('title', sql.NVarChar(200), title)
        .query<ConversationRow>(
          `INSERT INTO dbo.ai_conversations (user_id, project_id, title)
           OUTPUT inserted.id, inserted.project_id, inserted.title, inserted.created_at, inserted.updated_at
           VALUES (@userId, @projectId, @title)`,
        );
      return toSummary(result.recordset[0]);
    },

    addMessage(userId, conversationId, role, content) {
      return withTransaction(db, async transaction => {
        const touched = await new sql.Request(transaction)
          .input('userId', sql.BigInt, userId)
          .input('id', sql.BigInt, conversationId)
          .query(`UPDATE dbo.ai_conversations SET updated_at = SYSUTCDATETIME() WHERE id = @id AND user_id = @userId`);
        if (!touched.rowsAffected[0]) return null;
        const inserted = await new sql.Request(transaction)
          .input('id', sql.BigInt, conversationId)
          .input('role', sql.VarChar(16), role)
          .input('content', sql.NVarChar(sql.MAX), JSON.stringify(content))
          .query<MessageRow>(
            `INSERT INTO dbo.ai_messages (conversation_id, role, content)
             OUTPUT inserted.id, inserted.role, inserted.content, inserted.created_at
             VALUES (@id, @role, @content)`,
          );
        return toMessage(inserted.recordset[0]);
      });
    },

    updateAssistantMessage(userId, messageId, patch) {
      return withTransaction(db, async transaction => {
        const found = await new sql.Request(transaction)
          .input('userId', sql.BigInt, userId)
          .input('id', sql.BigInt, messageId)
          .query<{ content: string }>(
            `SELECT m.content FROM dbo.ai_messages m WITH (UPDLOCK)
             JOIN dbo.ai_conversations c ON c.id = m.conversation_id
             WHERE m.id = @id AND c.user_id = @userId AND m.role = 'assistant'`,
          );
        const row = found.recordset[0];
        if (!row) return false;
        const content = { ...(JSON.parse(row.content) as Record<string, unknown>), ...patch };
        await new sql.Request(transaction)
          .input('id', sql.BigInt, messageId)
          .input('content', sql.NVarChar(sql.MAX), JSON.stringify(content))
          .query('UPDATE dbo.ai_messages SET content = @content WHERE id = @id');
        return true;
      });
    },

    async delete(userId, conversationId) {
      const result = await db
        .request()
        .input('userId', sql.BigInt, userId)
        .input('id', sql.BigInt, conversationId)
        .query('DELETE FROM dbo.ai_conversations WHERE id = @id AND user_id = @userId');
      return result.rowsAffected[0] > 0;
    },

    async deleteForProject(userId, projectId) {
      await db
        .request()
        .input('userId', sql.BigInt, userId)
        .input('projectId', sql.VarChar(100), projectId)
        .query('DELETE FROM dbo.ai_conversations WHERE user_id = @userId AND project_id = @projectId');
    },
  };
}

/** Mismo contrato en memoria, para las pruebas. */
export function createMemoryConversationStore(clock: () => Date = () => new Date()): ConversationStore {
  const conversations = new Map<number, AiConversationSummary & { userId: number }>();
  const messages = new Map<number, AiStoredMessage & { conversationId: number }>();
  let nextConversation = 1;
  let nextMessage = 1;
  const strip = (c: AiConversationSummary): AiConversationSummary => ({
    id: c.id,
    projectId: c.projectId,
    title: c.title,
    createdAt: c.createdAt,
    updatedAt: c.updatedAt,
  });
  const plain = (m: AiStoredMessage): AiStoredMessage =>
    structuredClone({ id: m.id, role: m.role, content: m.content, createdAt: m.createdAt });
  const own = (userId: number, id: number) => {
    const found = conversations.get(id);
    return found && found.userId === userId ? found : undefined;
  };

  return {
    async list(userId, projectId) {
      return [...conversations.values()]
        .filter(c => c.userId === userId && c.projectId === projectId)
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt) || b.id - a.id)
        .slice(0, MAX_CONVERSATIONS_LISTED)
        .map(strip);
    },
    async get(userId, id) {
      const found = own(userId, id);
      if (!found) return null;
      const list = [...messages.values()]
        .filter(m => m.conversationId === id)
        .sort((a, b) => a.id - b.id)
        .slice(-MAX_MESSAGES)
        .map(plain);
      return { ...strip(found), messages: list };
    },
    async create(userId, projectId, title) {
      const now = clock().toISOString();
      const created = { id: nextConversation++, userId, projectId, title, createdAt: now, updatedAt: now };
      conversations.set(created.id, created);
      return strip(created);
    },
    async addMessage(userId, conversationId, role, content) {
      const found = own(userId, conversationId);
      if (!found) return null;
      const now = clock().toISOString();
      found.updatedAt = now;
      const message = { id: nextMessage++, conversationId, role, content: structuredClone(content), createdAt: now };
      messages.set(message.id, message);
      return plain(message);
    },
    async updateAssistantMessage(userId, messageId, patch) {
      const message = messages.get(messageId);
      if (!message || message.role !== 'assistant' || !own(userId, message.conversationId)) return false;
      message.content = { ...message.content, ...structuredClone(patch) };
      return true;
    },
    async delete(userId, id) {
      if (!own(userId, id)) return false;
      conversations.delete(id);
      for (const [key, m] of messages) if (m.conversationId === id) messages.delete(key);
      return true;
    },
    async deleteForProject(userId, projectId) {
      for (const c of [...conversations.values()])
        if (c.userId === userId && c.projectId === projectId) await this.delete(userId, c.id);
    },
  };
}
