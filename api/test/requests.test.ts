import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.ts';
import { readMigrations, runMigrations } from '../src/db/migrations.ts';
import type { Database } from '../src/db/pool.ts';
import { requestEvent } from '../src/notificapp/events.ts';
import { createOutboxDrainer, type OutboxStore, type PendingEvent } from '../src/notificapp/outbox.ts';
import { createMemoryRequestStore } from '../src/requests/memory.ts';
import { DAILY_REQUEST_LIMIT, type RequestStore } from '../src/requests/model.ts';
import { createSqlRequestStore } from '../src/requests/repository.ts';
import { createSqlUserStore } from '../src/users/repository.ts';
import { fakeAuth, fakeUsers, identity, testConfig, testDependencies } from './helpers/fakes.ts';
import { createTestDatabase, dbTestsEnabled } from './helpers/testDatabase.ts';

const idea = { kind: 'idea' as const, title: 'Exportar a PDF', body: 'Poder exportar el mapa entero a PDF.' };
const bug = { kind: 'error' as const, title: 'No guarda', body: 'Al cerrar la pestaña se pierde el último cambio.' };
const noEvent = () => null;
const respond = (status: string, extra: Record<string, unknown> = {}) =>
  ({
    status,
    message: null,
    duplicateOf: null,
    ...extra,
  }) as Parameters<RequestStore['respond']>[1];

// Contrato que deben cumplir el almacén en memoria y el de SQL Server.
function storeContract(name: string, makeStore: () => Promise<{ store: RequestStore; users: [number, number] }>) {
  describe(`${name} request store`, () => {
    it('keeps ideas private until reviewed, then lists and sorts them by votes', async () => {
      const { store, users } = await makeStore();
      const [ana, bea] = users;
      const created = await store.create(ana, idea, noEvent);
      if (created.status !== 'created') throw new Error('expected created');
      expect(created.request).toMatchObject({ status: 'revision', votes: 1, unread: false });
      const id = created.request.id;

      expect((await store.board({ sort: 'votes', status: null, limit: 10, offset: 0, viewerId: bea })).total).toBe(0);
      expect(await store.detail(id, bea)).toBeNull();
      expect(await store.detail(id, ana)).toMatchObject({ mine: true, voted: true });
      expect(await store.vote(bea, id, true)).toEqual({ status: 'not_found' });

      const second = await store.create(bea, { ...idea, title: 'Modo presentación' }, noEvent);
      if (second.status !== 'created') throw new Error('expected created');
      await store.respond(id, respond('abierta', { message: 'Buena idea' }), { key: 'k1', hash: 'h1' });
      await store.respond(second.request.id, respond('planificada'), { key: 'k2', hash: 'h2' });
      expect(await store.vote(bea, id, true)).toEqual({ status: 'ok', votes: 2, voted: true });

      const board = await store.board({ sort: 'votes', status: null, limit: 10, offset: 0, viewerId: bea });
      expect(board.total).toBe(2);
      expect(board.items.map(item => [item.id, item.votes, item.voted, item.mine])).toEqual([
        [id, 2, true, false],
        [second.request.id, 1, true, true],
      ]);
      const recent = await store.board({ sort: 'recent', status: 'planificada', limit: 10, offset: 0, viewerId: null });
      expect(recent.items.map(item => item.id)).toEqual([second.request.id]);

      expect(await store.vote(bea, id, false)).toEqual({ status: 'ok', votes: 1, voted: false });
      await store.respond(id, respond('hecha'), { key: 'k3', hash: 'h3' });
      expect(await store.vote(bea, id, true)).toEqual({ status: 'closed' });
      expect((await store.detail(id, null))?.updates.map(u => u.status)).toEqual(['abierta', 'hecha']);
    });

    it('never publishes errors or rejected ideas and tracks unread answers', async () => {
      const { store, users } = await makeStore();
      const [ana, bea] = users;
      const error = await store.create(ana, bug, noEvent);
      const spam = await store.create(ana, idea, noEvent);
      if (error.status !== 'created' || spam.status !== 'created') throw new Error('expected created');
      await store.respond(error.request.id, respond('abierta', { message: 'Reproducido' }), { key: 'e1', hash: 'x' });
      await store.respond(spam.request.id, respond('rechazada'), { key: 'e2', hash: 'y' });

      const board = await store.board({ sort: 'votes', status: null, limit: 100, offset: 0, viewerId: null });
      expect(board.items.map(item => item.id)).not.toContain(error.request.id);
      expect(board.items.map(item => item.id)).not.toContain(spam.request.id);
      expect(await store.detail(error.request.id, bea)).toBeNull();
      expect(error.request.votes).toBe(0);

      const mine = await store.mine(ana);
      expect(mine.map(r => [r.id, r.unread])).toEqual([
        [spam.request.id, true],
        [error.request.id, true],
      ]);
      expect(mine[1].updates[0]).toMatchObject({ status: 'abierta', message: 'Reproducido' });
      expect(await store.markRead(bea, error.request.id)).toBe(false);
      expect(await store.markRead(ana, error.request.id)).toBe(true);
      expect((await store.mine(ana)).find(r => r.id === error.request.id)?.unread).toBe(false);
    });

    it('replays identical responses, rejects reused keys and invalid duplicates', async () => {
      const { store, users } = await makeStore();
      const a = await store.create(users[0], idea, noEvent);
      const b = await store.create(users[1], idea, noEvent);
      if (a.status !== 'created' || b.status !== 'created') throw new Error('expected created');

      const first = await store.respond(a.request.id, respond('abierta'), { key: 'same', hash: 'h' });
      expect(first).toMatchObject({ status: 'applied', request: { status: 'abierta', updatesTotal: 1 } });
      const again = await store.respond(a.request.id, respond('abierta'), { key: 'same', hash: 'h' });
      expect(again).toMatchObject({ status: 'replayed', request: { updatesTotal: 1 } });
      expect(await store.respond(a.request.id, respond('hecha'), { key: 'same', hash: 'other' })).toEqual({
        status: 'conflict',
      });
      expect(await store.respond(b.request.id, respond('abierta'), { key: 'same', hash: 'h' })).toEqual({
        status: 'conflict',
      });
      expect(await store.respond(999_999, respond('abierta'), { key: 'new', hash: 'h' })).toEqual({
        status: 'not_found',
      });
      expect(
        await store.respond(b.request.id, respond('duplicada', { duplicateOf: b.request.id }), {
          key: 'd1',
          hash: 'h',
        }),
      ).toEqual({ status: 'invalid_duplicate' });
      expect(
        await store.respond(b.request.id, respond('duplicada', { duplicateOf: a.request.id }), {
          key: 'd2',
          hash: 'h',
        }),
      ).toMatchObject({ status: 'applied', request: { status: 'duplicada', duplicateOf: a.request.id } });

      const open = await store.listOpen(100);
      expect(open.items.map(r => r.id)).not.toContain(b.request.id);
      expect(open.items.find(r => r.id === a.request.id)).toMatchObject({ externalId: `request-${a.request.id}` });
    });

    it('limits new requests per day and queues the event with the request', async () => {
      const { store, users } = await makeStore();
      const events: string[] = [];
      for (let i = 0; i < DAILY_REQUEST_LIMIT; i++) {
        const result = await store.create(users[0], idea, created => {
          events.push(created.request.title);
          return requestEvent(created);
        });
        expect(result.status).toBe('created');
      }
      expect(await store.create(users[0], idea, noEvent)).toEqual({ status: 'rate_limited' });
      expect(events).toHaveLength(DAILY_REQUEST_LIMIT);
      expect((await store.create(users[1], idea, noEvent)).status).toBe('created');
    });
  });
}

storeContract('memory', async () => ({ store: createMemoryRequestStore().store, users: [1, 2] }));

describe.runIf(dbTestsEnabled)('SQL Server requests', () => {
  let db: Database;
  let drop: () => Promise<void>;
  let counter = 0;

  beforeAll(async () => {
    ({ db, drop } = await createTestDatabase());
    await runMigrations(db, await readMigrations());
  });
  afterAll(async () => {
    await drop();
  });

  const makeUsers = async (): Promise<[number, number]> => {
    const users = createSqlUserStore(db);
    counter++;
    const a = await users.upsert(identity({ uid: `ana-${counter}` }));
    const b = await users.upsert(identity({ uid: `bea-${counter}` }));
    return [a.id, b.id];
  };

  storeContract('sql', async () => ({ store: createSqlRequestStore(db), users: await makeUsers() }));

  it('writes the outbox row in the same transaction and cascades the account delete', async () => {
    const store = createSqlRequestStore(db);
    const [ana, bea] = await makeUsers();
    const original = await store.create(ana, idea, requestEvent);
    const copy = await store.create(bea, idea, noEvent);
    if (original.status !== 'created' || copy.status !== 'created') throw new Error('expected created');
    await store.respond(original.request.id, respond('abierta'), { key: 'c1', hash: 'h' });
    await store.vote(bea, original.request.id, true);
    await store.respond(copy.request.id, respond('duplicada', { duplicateOf: original.request.id }), {
      key: 'c2',
      hash: 'h',
    });

    const outbox = await db
      .request()
      .query(`SELECT payload FROM dbo.notificapp_outbox WHERE external_id = 'request-${original.request.id}'`);
    expect(JSON.parse(outbox.recordset[0].payload)).toMatchObject({ kind: 'nodaria_request' });

    await createSqlUserStore(db).delete(ana, async () => undefined);
    expect(await store.detail(original.request.id, null)).toBeNull();
    expect((await store.detail(copy.request.id, bea))?.status).toBe('abierta');
    const votes = await db.request().query(`SELECT COUNT(*) AS n FROM dbo.request_votes WHERE user_id = ${ana}`);
    expect(votes.recordset[0].n).toBe(0);
  });
});

describe('request routes', () => {
  async function setup(options: { notificapp?: boolean; token?: string | null } = {}) {
    const auth = fakeAuth({ ana: identity({ uid: 'ana' }), bea: identity({ uid: 'bea' }) });
    const { store, outbox } = createMemoryRequestStore();
    let queued = 0;
    const config = { ...testConfig, notificapp: { ...testConfig.notificapp, enabled: options.notificapp ?? false } };
    const app = await buildApp(
      testDependencies({
        config,
        auth: auth.provider,
        users: fakeUsers().store,
        requests: store,
        onRequestQueued: () => queued++,
        readUpstreamToken: async () => (options.token === undefined ? 'secreto' : options.token),
      }),
    );
    const as = (token?: string) => (token ? { authorization: `Bearer ${token}` } : {});
    return { app, outbox, as, queued: () => queued };
  }

  it('requires a session to send, validates and queues the Notificapp event', async () => {
    const { app, outbox, as, queued } = await setup({ notificapp: true });
    expect((await app.inject({ method: 'POST', url: '/api/requests', payload: idea })).statusCode).toBe(401);
    const invalid = await app.inject({
      method: 'POST',
      url: '/api/requests',
      headers: as('ana'),
      payload: { kind: 'idea', title: 'x', body: 'y' },
    });
    expect(invalid.statusCode).toBe(400);

    const created = await app.inject({ method: 'POST', url: '/api/requests', headers: as('ana'), payload: idea });
    expect(created.statusCode).toBe(201);
    expect(created.json()).toMatchObject({ status: 'revision', votes: 1 });
    expect(outbox).toHaveLength(1);
    expect(outbox[0].payload).toMatchObject({ kind: 'nodaria_request', title: 'Nueva idea en Nodaria' });
    expect(String(outbox[0].payload.body)).toContain(idea.body);
    expect(queued()).toBe(1);
  });

  it('does not queue events outside production', async () => {
    const { app, outbox, as } = await setup();
    await app.inject({ method: 'POST', url: '/api/requests', headers: as('ana'), payload: idea });
    expect(outbox).toHaveLength(0);
  });

  it('serves the board anonymously and with session flags, and lets others vote once published', async () => {
    const { app, as } = await setup();
    const id = (await app.inject({ method: 'POST', url: '/api/requests', headers: as('ana'), payload: idea })).json()
      .id;
    expect((await app.inject({ method: 'GET', url: '/api/requests' })).json()).toMatchObject({ total: 0, items: [] });
    expect((await app.inject({ method: 'PUT', url: `/api/requests/${id}/vote`, headers: as('bea') })).statusCode).toBe(
      404,
    );

    const panel = { authorization: 'Bearer secreto', 'idempotency-key': 'pub-1' };
    await app.inject({
      method: 'POST',
      url: `/notificapp/v1/requests/${id}/responses`,
      headers: panel,
      payload: { status: 'abierta' },
    });

    const vote = await app.inject({ method: 'PUT', url: `/api/requests/${id}/vote`, headers: as('bea') });
    expect(vote.json()).toEqual({ id, votes: 2, voted: true });
    const board = await app.inject({ method: 'GET', url: '/api/requests?sort=recent', headers: as('bea') });
    expect(board.json().items[0]).toMatchObject({ id, voted: true, mine: false, votes: 2 });
    const anonymous = await app.inject({ method: 'GET', url: `/api/requests/${id}` });
    expect(anonymous.json()).toMatchObject({ voted: false, mine: false });
    expect(anonymous.json()).not.toHaveProperty('author');

    const mine = await app.inject({ method: 'GET', url: '/api/me/requests', headers: as('ana') });
    expect(mine.json().requests[0]).toMatchObject({ id, unread: true });
    expect(
      (await app.inject({ method: 'POST', url: `/api/me/requests/${id}/read`, headers: as('bea') })).statusCode,
    ).toBe(404);
    expect(
      (await app.inject({ method: 'POST', url: `/api/me/requests/${id}/read`, headers: as('ana') })).statusCode,
    ).toBe(204);
  });

  it('rejects more than the daily limit', async () => {
    const { app, as } = await setup();
    for (let i = 0; i < DAILY_REQUEST_LIMIT; i++) {
      await app.inject({ method: 'POST', url: '/api/requests', headers: as('ana'), payload: idea });
    }
    const response = await app.inject({ method: 'POST', url: '/api/requests', headers: as('ana'), payload: idea });
    expect(response.statusCode).toBe(429);
    expect(response.json().error).toBe('request_limit');
  });
});

describe('Notificapp panel routes', () => {
  async function setup(token: string | null = 'secreto') {
    const auth = fakeAuth({ ana: identity({ uid: 'ana', displayName: 'Ana', email: 'ana@example.com' }) });
    const users = fakeUsers();
    const { store } = createMemoryRequestStore({ authorOf: () => ({ displayName: 'Ana', email: 'ana@example.com' }) });
    const app = await buildApp(
      testDependencies({
        auth: auth.provider,
        users: users.store,
        requests: store,
        readUpstreamToken: async () => token,
      }),
    );
    const id = (
      await app.inject({ method: 'POST', url: '/api/requests', headers: { authorization: 'Bearer ana' }, payload: bug })
    ).json().id as number;
    return { app, id };
  }

  it('is unavailable without the private credential and rejects Firebase tokens', async () => {
    const off = await setup(null);
    expect((await off.app.inject({ method: 'GET', url: '/notificapp/v1/requests' })).statusCode).toBe(503);
    const { app } = await setup();
    expect(
      (await app.inject({ method: 'GET', url: '/notificapp/v1/requests', headers: { authorization: 'Bearer ana' } }))
        .statusCode,
    ).toBe(401);
  });

  it('lists, details and answers idempotently', async () => {
    const { app, id } = await setup();
    const auth = { authorization: 'Bearer secreto' };
    const list = await app.inject({ method: 'GET', url: '/notificapp/v1/requests', headers: auth });
    expect(list.json()).toMatchObject({
      hasMore: false,
      items: [{ id, kind: 'error', author: { displayName: 'Ana' } }],
    });
    expect(
      (await app.inject({ method: 'GET', url: `/notificapp/v1/requests/${id}`, headers: auth })).json(),
    ).toMatchObject({
      externalId: `request-${id}`,
      author: { email: 'ana@example.com' },
    });

    const url = `/notificapp/v1/requests/${id}/responses`;
    const payload = { status: 'en_curso', message: 'Lo estoy mirando.' };
    expect((await app.inject({ method: 'POST', url, headers: auth, payload })).statusCode).toBe(400);
    const headers = { ...auth, 'idempotency-key': 'resp-1' };
    const first = await app.inject({ method: 'POST', url, headers, payload });
    expect(first.json()).toMatchObject({ status: 'en_curso', replayed: false, updatesTotal: 1 });
    const replay = await app.inject({ method: 'POST', url, headers, payload });
    expect(replay.json()).toMatchObject({ replayed: true, updatesTotal: 1 });
    const conflict = await app.inject({ method: 'POST', url, headers, payload: { status: 'hecha' } });
    expect(conflict.statusCode).toBe(409);
    const unknown = await app.inject({
      method: 'POST',
      url: '/notificapp/v1/requests/999/responses',
      headers: { ...auth, 'idempotency-key': 'resp-2' },
      payload,
    });
    expect(unknown.statusCode).toBe(404);
  });
});

describe('Notificapp outbox drainer', () => {
  function memoryOutbox(events: PendingEvent[]) {
    const sent: string[] = [];
    const failed: { id: string; error: string; next: Date }[] = [];
    const store: OutboxStore = {
      async pending() {
        return events.filter(e => !sent.includes(e.externalId) && !failed.some(f => f.id === e.externalId));
      },
      async markSent(id) {
        sent.push(id);
      },
      async markFailed(id, error, next) {
        failed.push({ id, error, next });
      },
    };
    return { store, sent, failed };
  }
  const silent = { warn() {}, error() {} } as unknown as Parameters<typeof createOutboxDrainer>[0]['log'];
  const event = (id: string) => ({ externalId: id, payload: JSON.stringify({ externalId: id }), attempts: 0 });

  it('publishes with the sender token and retries failures later', async () => {
    const { store, sent, failed } = memoryOutbox([event('request-1'), event('request-2')]);
    const calls: { url: string; auth: string | null }[] = [];
    const drainer = createOutboxDrainer({
      outbox: store,
      config: testConfig.notificapp,
      log: silent,
      readToken: async () => 'emisor',
      clock: () => new Date('2026-10-07T10:00:00Z'),
      fetch: (async (url: URL, init: RequestInit) => {
        calls.push({ url: String(url), auth: new Headers(init.headers).get('authorization') });
        return new Response('{}', { status: calls.length === 1 ? 201 : 503 });
      }) as typeof fetch,
    });
    await drainer.trigger();
    expect(calls[0]).toEqual({ url: 'https://notificapp-api.yosiftware.es/v1/events', auth: 'Bearer emisor' });
    expect(sent).toEqual(['request-1']);
    expect(failed).toEqual([{ id: 'request-2', error: 'HTTP 503', next: new Date('2026-10-07T10:01:00Z') }]);
  });

  it('keeps events queued while the sender token is missing', async () => {
    const { store, sent, failed } = memoryOutbox([event('request-3')]);
    let fetched = false;
    const drainer = createOutboxDrainer({
      outbox: store,
      config: testConfig.notificapp,
      log: silent,
      readToken: async () => null,
      fetch: (async () => {
        fetched = true;
        return new Response();
      }) as typeof fetch,
    });
    await drainer.trigger();
    expect(fetched).toBe(false);
    expect(sent).toEqual([]);
    expect(failed[0]).toMatchObject({ id: 'request-3', error: 'missing_sender_token' });
  });
});
