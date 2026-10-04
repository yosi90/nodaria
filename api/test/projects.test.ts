import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.ts';
import { loadConfig } from '../src/config.ts';
import { readMigrations, runMigrations } from '../src/db/migrations.ts';
import type { Database } from '../src/db/pool.ts';
import { createMemoryProjectStore, createSqlProjectStore, type ProjectStore } from '../src/projects/repository.ts';
import { createSqlUserStore } from '../src/users/repository.ts';
import { fakeAuth, identity, testDependencies } from './helpers/fakes.ts';
import { createTestDatabase, dbTestsEnabled } from './helpers/testDatabase.ts';

const doc = (id: string, patch: Record<string, unknown> = {}) => ({
  id,
  name: 'Crónicas',
  updatedAt: '2026-10-04T10:00:00.000Z',
  schemas: [],
  nodes: [],
  relations: [],
  formatVersion: 4,
  ...patch,
});

// Contrato que deben cumplir el almacén en memoria y el de SQL Server.
function storeContract(name: string, makeStore: () => Promise<{ store: ProjectStore; userId: number }>) {
  describe(`${name} store`, () => {
    it('creates, versions, lists, conflicts and soft-deletes', async () => {
      const { store, userId } = await makeStore();
      const write = { name: 'Crónicas', document: '{"id":"p1"}', updatedAt: '2026-10-04T10:00:00.000Z' };

      expect(await store.put(userId, 'p1', write, 0)).toMatchObject({ status: 'applied', version: 1 });
      // Base equivocada: no escribe y devuelve la versión vigente.
      expect(await store.put(userId, 'p1', write, 0)).toMatchObject({ status: 'conflict', current: { version: 1 } });
      expect(await store.put(userId, 'p1', { ...write, name: 'Crónicas II' }, 1)).toMatchObject({
        status: 'applied',
        version: 2,
      });

      const stored = await store.get(userId, 'p1');
      expect(stored).toMatchObject({
        name: 'Crónicas II',
        version: 2,
        document: '{"id":"p1"}',
        deletedAt: null,
        sizeBytes: 11,
      });
      expect(stored!.updatedAt).toBe('2026-10-04T10:00:00.000Z');
      expect(await store.get(userId, 'nope')).toBeNull();
      expect(await store.get(userId + 1, 'p1')).toBeNull();

      expect(await store.delete(userId, 'nope', null)).toEqual({ status: 'not_found' });
      expect(await store.delete(userId, 'p1', 1)).toMatchObject({ status: 'conflict', current: { version: 2 } });
      expect(await store.delete(userId, 'p1', 2)).toMatchObject({ status: 'applied', version: 3 });
      // Repetir el borrado no cambia nada.
      expect(await store.delete(userId, 'p1', null)).toMatchObject({ status: 'applied', version: 3 });

      const list = await store.list(userId);
      expect(list).toHaveLength(1);
      expect(list[0]).toMatchObject({ id: 'p1', version: 3, sizeBytes: 0 });
      expect(list[0].deletedAt).not.toBeNull();
      expect((await store.get(userId, 'p1'))!.document).toBeNull();

      // Volver a subir sobre un borrado lo resucita con la versión siguiente.
      expect(await store.put(userId, 'p1', write, 3)).toMatchObject({ status: 'applied', version: 4 });
      expect((await store.get(userId, 'p1'))!.deletedAt).toBeNull();
    });
  });
}

storeContract('memory', async () => ({ store: createMemoryProjectStore(), userId: 7 }));

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
    const user = await createSqlUserStore(db).upsert(identity({ uid: `uid-${Math.random()}` }));
    return { store: createSqlProjectStore(db), userId: user.id };
  });
});

describe('project routes', () => {
  async function setup(overrides: Record<string, string> = {}) {
    const auth = fakeAuth({ google: identity(), other: identity({ uid: 'uid-other' }) });
    const app = await buildApp(
      testDependencies({ auth: auth.provider, config: loadConfig({ NODE_ENV: 'test', ...overrides }) }),
    );
    const call = (method: 'GET' | 'PUT' | 'DELETE', url: string, body?: unknown, token = 'google') =>
      app.inject({ method, url, headers: { authorization: `Bearer ${token}` }, payload: body as never });
    return { call };
  }

  it('stores a project and lists and returns it', async () => {
    const { call } = await setup();
    const put = await call('PUT', '/api/projects/p1', { document: doc('p1'), baseVersion: 0 });
    expect(put.statusCode).toBe(200);
    expect(put.json()).toMatchObject({ id: 'p1', version: 1 });

    const list = await call('GET', '/api/projects');
    expect(list.json().projects).toMatchObject([{ id: 'p1', name: 'Crónicas', version: 1, deletedAt: null }]);

    const get = await call('GET', '/api/projects/p1');
    expect(get.statusCode).toBe(200);
    expect(get.json()).toMatchObject({ version: 1, document: doc('p1') });

    // Otro usuario no lo ve.
    expect((await call('GET', '/api/projects/p1', undefined, 'other')).statusCode).toBe(404);
    expect((await call('GET', '/api/projects', undefined, 'other')).json().projects).toEqual([]);
  });

  it('answers 409 with the current version when baseVersion is stale', async () => {
    const { call } = await setup();
    await call('PUT', '/api/projects/p1', { document: doc('p1'), baseVersion: 0 });
    const stale = await call('PUT', '/api/projects/p1', { document: doc('p1'), baseVersion: 0 });
    expect(stale.statusCode).toBe(409);
    expect(stale.json()).toMatchObject({ error: 'version_conflict', current: { id: 'p1', version: 1 } });
  });

  it('rejects invalid documents, mismatched ids and oversized projects', async () => {
    const { call } = await setup({ PROJECT_MAX_BYTES: String(64 * 1024) });
    expect((await call('PUT', '/api/projects/p1', { document: { id: 'p1' }, baseVersion: 0 })).statusCode).toBe(400);
    expect((await call('PUT', '/api/projects/p1', { document: doc('p2'), baseVersion: 0 })).json()).toMatchObject({
      error: 'project_id_mismatch',
    });
    expect((await call('PUT', '/api/projects/bad id!', { document: doc('bad id!'), baseVersion: 0 })).statusCode).toBe(
      400,
    );

    const big = await call('PUT', '/api/projects/p1', {
      document: doc('p1', { notes: 'x'.repeat(70 * 1024) }),
      baseVersion: 0,
    });
    expect(big.statusCode).toBe(413);
    expect(big.json()).toMatchObject({ error: 'project_too_large', maxBytes: 64 * 1024 });
  });

  it('soft-deletes with version control and reports deleted projects', async () => {
    const { call } = await setup();
    await call('PUT', '/api/projects/p1', { document: doc('p1'), baseVersion: 0 });
    expect((await call('DELETE', '/api/projects/p1?baseVersion=5')).statusCode).toBe(409);
    expect((await call('DELETE', '/api/projects/nope')).statusCode).toBe(404);

    const del = await call('DELETE', '/api/projects/p1?baseVersion=1');
    expect(del.statusCode).toBe(200);
    expect(del.json()).toMatchObject({ id: 'p1', version: 2 });

    const get = await call('GET', '/api/projects/p1');
    expect(get.statusCode).toBe(404);
    expect(get.json()).toMatchObject({ error: 'project_deleted', version: 2 });
    expect((await call('GET', '/api/projects')).json().projects[0].deletedAt).not.toBeNull();
  });
});
