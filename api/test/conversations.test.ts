import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  createMemoryConversationStore,
  createSqlConversationStore,
  MAX_CONVERSATIONS_PER_PROJECT,
  type ConversationStore,
} from '../src/ai/conversations.ts';
import { readMigrations, runMigrations } from '../src/db/migrations.ts';
import type { Database } from '../src/db/pool.ts';
import { createSqlUserStore } from '../src/users/repository.ts';
import { createTestDatabase, dbTestsEnabled } from './helpers/testDatabase.ts';

// Contrato que deben cumplir el historial en memoria y el de SQL Server.
function storeContract(
  name: string,
  make: () => Promise<{ store: ConversationStore; userId: number; otherId: number }>,
) {
  describe(`${name} conversation store`, () => {
    it('guarda como mucho MAX_CONVERSATIONS_PER_PROJECT por proyecto: se va la más antigua', async () => {
      const { store, userId } = await make();
      const first = await store.create(userId, 'tope', 'Primera');
      await store.addMessage(userId, first.id, 'user', { instruction: 'Hola' });
      const second = await store.create(userId, 'tope', 'Segunda');
      // Usar la primera la pone por delante: la más antigua pasa a ser la segunda.
      await store.addMessage(userId, first.id, 'user', { instruction: 'Sigo' });
      const other = await store.create(userId, 'otro-tope', 'De otro proyecto');
      for (let i = 0; i < MAX_CONVERSATIONS_PER_PROJECT - 1; i++) await store.create(userId, 'tope', `N${i}`);
      expect(await store.get(userId, second.id)).toBeNull();
      expect(await store.get(userId, first.id)).not.toBeNull();
      expect(await store.get(userId, other.id)).not.toBeNull();
      await store.deleteForProject(userId, 'tope');
      await store.deleteForProject(userId, 'otro-tope');
    });

    it('crea, lista, guarda mensajes, marca lo aplicado y borra', async () => {
      const { store, userId, otherId } = await make();
      const a = await store.create(userId, 'p1', 'Primera');
      const b = await store.create(userId, 'p1', 'Segunda');
      await store.create(userId, 'p2', 'Otro proyecto');
      expect((await store.list(userId, 'p1')).map(c => c.title).sort()).toEqual(['Primera', 'Segunda']);
      expect(await store.list(otherId, 'p1')).toEqual([]);

      const asked = await store.addMessage(userId, a.id, 'user', { instruction: 'Hola' });
      const answer = await store.addMessage(userId, a.id, 'assistant', { proposal: { summary: 'x' }, applied: null });
      expect(asked).toMatchObject({ role: 'user', content: { instruction: 'Hola' } });
      expect(await store.addMessage(otherId, a.id, 'user', { instruction: 'Intruso' })).toBeNull();
      // Escribir en una conversación la sube al principio de la lista.
      expect((await store.list(userId, 'p1'))[0].id).toBe(a.id);

      expect(await store.updateAssistantMessage(userId, answer!.id, { applied: [0] })).toBe(true);
      expect(await store.updateAssistantMessage(userId, asked!.id, { applied: [0] })).toBe(false);
      expect(await store.updateAssistantMessage(otherId, answer!.id, { applied: [] })).toBe(false);
      const full = await store.get(userId, a.id);
      expect(full?.messages.map(m => [m.role, m.content])).toEqual([
        ['user', { instruction: 'Hola' }],
        ['assistant', { proposal: { summary: 'x' }, applied: [0] }],
      ]);
      expect(await store.get(otherId, a.id)).toBeNull();

      expect(await store.delete(otherId, b.id)).toBe(false);
      expect(await store.delete(userId, b.id)).toBe(true);
      await store.deleteForProject(userId, 'p1');
      expect(await store.list(userId, 'p1')).toEqual([]);
      expect(await store.get(userId, a.id)).toBeNull();
      expect(await store.list(userId, 'p2')).toHaveLength(1);
    });
  });
}

storeContract('memory', async () => ({ store: createMemoryConversationStore(), userId: 7, otherId: 8 }));

describe.runIf(dbTestsEnabled)('SQL Server', () => {
  let db: Database;
  let drop: () => Promise<void>;
  beforeAll(async () => {
    ({ db, drop } = await createTestDatabase());
    await runMigrations(db, await readMigrations());
  });
  afterAll(async () => {
    await drop();
  });

  storeContract('sql', async () => {
    const users = createSqlUserStore(db);
    const user = await users.findOrCreate(crypto.randomUUID());
    const other = await users.findOrCreate(crypto.randomUUID());
    return { store: createSqlConversationStore(db), userId: user.id, otherId: other.id };
  });

  it('borrar la cuenta borra sus conversaciones', async () => {
    const users = createSqlUserStore(db);
    const user = await users.findOrCreate(crypto.randomUUID());
    const store = createSqlConversationStore(db);
    const c = await store.create(user.id, 'p1', 'x');
    await store.addMessage(user.id, c.id, 'user', { instruction: 'Hola' });
    await users.delete(user.id);
    const left = await db.request().query('SELECT COUNT(*) AS n FROM dbo.ai_messages');
    expect(await store.get(user.id, c.id)).toBeNull();
    expect(left.recordset[0].n).toBe(0);
  });
});
