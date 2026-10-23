import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.ts';
import { newsText, reportEvent, updateNews } from '../src/community/model.ts';
import { createOutboxWorker, isFinal, retryDelayMs } from '../src/community/outbox.ts';
import {
  type CommunityStore,
  createMemoryCommunityStore,
  createSqlCommunityStore,
  type OutboxMessage,
} from '../src/community/repository.ts';
import { loadConfig } from '../src/config.ts';
import { readMigrations, runMigrations } from '../src/db/migrations.ts';
import type { Database } from '../src/db/pool.ts';
import { PlatformError } from '../src/platform/spaces.ts';
import { createMemoryProjectStore } from '../src/projects/repository.ts';
import { createSqlUserStore } from '../src/users/repository.ts';
import {
  fakeCommunityClient,
  fakeUsers,
  memoryGroups,
  OTHER,
  OWNER,
  platformTokens,
  testDependencies,
} from './helpers/fakes.ts';
import { createTestDatabase, dbTestsEnabled } from './helpers/testDatabase.ts';

const doc = (id: string, patch: Record<string, unknown> = {}) => ({
  id,
  name: 'Crónicas de Munfamed',
  updatedAt: '2026-10-23T10:00:00.000Z',
  schemas: [],
  nodes: [{ id: 'n1' }, { id: 'n2' }],
  relations: [{ id: 'r1' }],
  formatVersion: 9,
  ...patch,
});

const OPTIONS = { notes: false, images: true, excludedTypeIds: [] };

const write = (name = 'Crónicas') => ({
  name,
  description: 'Un mundo',
  document: JSON.stringify(doc('p1', { name })),
  nodeCount: 2,
  relationCount: 1,
  options: OPTIONS,
  allowCopy: false,
});

const newsFor =
  (account: string) =>
  (publication: { id: string }, created: boolean): OutboxMessage => ({
    channel: 'novedades',
    operation: 'publicar',
    externalId: created ? `proyecto-${publication.id}` : `proyecto-${publication.id}-dia`,
    payload: { cuenta: account },
  });

const reportFor = (report: { id: number }): OutboxMessage => ({
  channel: 'notificapp',
  operation: 'publicar',
  externalId: `report-${report.id}`,
  payload: {},
});

describe('textos de las novedades', () => {
  it('redacta en tercera persona, sin el nombre de la persona y dentro de los 280 caracteres', () => {
    expect(newsText('publicado', 'Munfamed', { nodes: 120, relations: 1 })).toBe(
      'ha publicado en Nodaria el proyecto «Munfamed», con 120 nodos y 1 relación',
    );
    expect(newsText('actualizado', 'Munfamed', { nodes: 0, relations: 0 })).toBe(
      'ha actualizado en Nodaria «Munfamed»',
    );
    const long = newsText('publicado', 'x'.repeat(400), { nodes: 1_000_000, relations: 2_000_000 });
    expect(long.length).toBeLessThanOrEqual(280);
    expect(long).toContain('…»');
  });

  it('una novedad de actualización al día, o la de la publicación si es del mismo día', () => {
    const published = new Date('2026-10-23T08:00:00Z');
    expect(updateNews('abc', published, new Date('2026-10-23T20:00:00Z'))).toEqual({
      externalId: 'proyecto-abc',
      kind: 'publicado',
    });
    expect(updateNews('abc', published, new Date('2026-10-25T09:00:00Z'))).toEqual({
      externalId: 'proyecto-abc-2026-10-25',
      kind: 'actualizado',
    });
  });

  it('el aviso de una denuncia se entiende sin abrir el panel', () => {
    const event = reportEvent(
      { id: 7, reason: 'spam', body: 'Enlaces a una tienda' },
      { id: 'abc', name: 'Munfamed' },
      'https://nodaria.yosiftware.es/p/abc',
    );
    expect(event).toMatchObject({
      externalId: 'report-7',
      kind: 'nodaria_report',
      data: { report: 7, publicId: 'abc' },
    });
    expect(event.body).toContain('Publicidad o spam');
    expect(event.body).toContain('https://nodaria.yosiftware.es/p/abc');
  });
});

// Contrato que cumplen el almacén en memoria y el de SQL Server.
function storeContract(
  name: string,
  make: () => Promise<{ store: CommunityStore; owner: { id: number; globalId: string }; other: string }>,
) {
  describe(`${name} community store`, () => {
    it('publica, actualiza, lista, denuncia, retira y deja de publicar', async () => {
      const { store, owner, other } = await make();
      const first = await store.publish(owner, 'p1', write(), newsFor(owner.globalId));
      expect(first).toMatchObject({ status: 'applied', created: true, publication: { version: 1, nodeCount: 2 } });
      if (first.status !== 'applied') throw new Error('no publicado');
      const publicId = first.publication.id;
      expect(publicId).toMatch(/^[A-Za-z0-9_-]{12}$/);
      expect(first.publication.author).toBe(owner.globalId.toLowerCase());

      const second = await store.publish(owner, 'p1', write('Crónicas II'), newsFor(owner.globalId));
      expect(second).toMatchObject({ status: 'applied', created: false, publication: { id: publicId, version: 2 } });
      expect((await store.get(publicId))?.document).toContain('Crónicas II');
      expect((await store.forProject(owner.id, 'p1'))?.name).toBe('Crónicas II');
      expect(await store.mine(owner.id)).toHaveLength(1);
      expect((await store.listPublic({ limit: 10 })).map(p => p.id)).toContain(publicId);
      expect(await store.listPublic({ author: other, limit: 10 })).toEqual([]);

      // Las dos novedades esperan en la cola.
      expect((await store.due(10)).map(i => i.externalId)).toEqual([
        `proyecto-${publicId}`,
        `proyecto-${publicId}-dia`,
      ]);

      expect(await store.report(publicId, owner.globalId, 'spam', '', reportFor)).toEqual({ status: 'own' });
      const report = await store.report(publicId, other, 'spam', 'Tienda', reportFor);
      expect(report).toMatchObject({ status: 'created', report: { state: 'pendiente', reason: 'spam' } });
      expect(await store.report(publicId, other, 'otro', '', reportFor)).toEqual({ status: 'repeated' });
      expect(await store.report('nonexistent0', other, 'otro', '', reportFor)).toEqual({ status: 'not_found' });
      if (report.status !== 'created') throw new Error('sin denuncia');

      const [listed] = await store.listReports(10);
      expect(listed).toMatchObject({
        id: report.report.id,
        pendingOnPublication: 1,
        publication: { name: 'Crónicas II' },
      });

      const retired = await store.resolveReport(report.report.id, 'retirar', 'Spam');
      expect(retired).toMatchObject({
        changed: true,
        report: { state: 'retirado', publication: { state: 'retirado' } },
      });
      expect(await store.resolveReport(report.report.id, 'desestimar', null)).toMatchObject({ changed: false });
      expect(await store.listPublic({ limit: 10 })).toEqual([]);
      // Lo retirado no se actualiza; la cola ya solo tiene la retirada de sus novedades.
      expect(await store.publish(owner, 'p1', write(), newsFor(owner.globalId))).toMatchObject({ status: 'retired' });
      const queue = await store.due(10);
      expect(queue.filter(i => i.channel === 'novedades').map(i => `${i.operation}:${i.externalId}`)).toEqual([
        `retirar:proyecto-${publicId}`,
        `retirar:proyecto-${publicId}-dia`,
      ]);

      for (const item of queue) await store.complete(item.id);
      expect(await store.due(10)).toEqual([]);

      // Dejar de publicar lo borra (también lo retirado).
      expect(await store.unpublish(owner.id, 'p1')).toMatchObject({ id: publicId });
      expect(await store.get(publicId)).toBeNull();
      expect(await store.unpublish(owner.id, 'p1')).toBeNull();
    });

    it('reintenta más tarde lo que no salió', async () => {
      const { store, owner } = await make();
      await store.publish(owner, 'p2', write(), newsFor(owner.globalId));
      const [item] = await store.due(10);
      await store.retry(item.id, new Date(Date.now() + 60_000), 'sin conexión');
      expect(await store.due(10)).toEqual([]);
      expect(await store.due(10, new Date(Date.now() + 120_000))).toMatchObject([{ id: item.id, attempts: 1 }]);
    });
  });
}

{
  const users = fakeUsers();
  const accounts = (userId: number) => {
    const user = [...users.byGlobalId.values()].find(u => u.id === userId);
    return user ? { globalId: user.globalId, active: !user.closedAt } : null;
  };
  storeContract('memory', async () => ({
    store: createMemoryCommunityStore(accounts).store,
    owner: await users.store.findOrCreate(OWNER),
    other: OTHER,
  }));
}

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
    const owner = await createSqlUserStore(db).findOrCreate(crypto.randomUUID());
    return { store: createSqlCommunityStore(db), owner, other: crypto.randomUUID() };
  });
});

describe('outbox worker', () => {
  const log = { info: () => undefined, warn: () => undefined };

  it('declara los tipos, manda en orden y borra lo enviado', async () => {
    const { store } = createMemoryCommunityStore(() => ({ globalId: OWNER, active: true }));
    const fake = fakeCommunityClient();
    await store.publish({ id: 1, globalId: OWNER }, 'p1', write(), newsFor(OWNER));
    const worker = createOutboxWorker({ store, client: fake.client, intervalMs: 60_000, log });
    expect(await worker.runOnce()).toBe(1);
    expect(fake.calls.map(c => c.op)).toEqual(['kinds', 'news']);
    expect(await store.due(10)).toEqual([]);
  });

  it('reintenta los fallos pasajeros y descarta los definitivos', async () => {
    const { store } = createMemoryCommunityStore(() => ({ globalId: OWNER, active: true }));
    const fake = fakeCommunityClient();
    const worker = createOutboxWorker({ store, client: fake.client, intervalMs: 60_000, log });
    await store.publish({ id: 1, globalId: OWNER }, 'p1', write(), newsFor(OWNER));
    fake.failOnce(new PlatformError(503, 'sin_credencial', 'Falta la credencial'));
    expect(await worker.runOnce()).toBe(0);
    expect(await store.due(10)).toEqual([]);
    expect(await store.due(10, new Date(Date.now() + retryDelayMs(0) + 1000))).toHaveLength(1);

    await store.publish({ id: 1, globalId: OWNER }, 'p3', write(), newsFor(OWNER));
    fake.failOnce(new PlatformError(404, 'cuenta_no_encontrada', 'No ha entrado'));
    await worker.runOnce();
    expect((await store.due(10, new Date(Date.now() + 10 * 60_000))).map(i => i.externalId)).not.toContain(
      expect.stringContaining('p3'),
    );
    expect(isFinal(new PlatformError(429, 'demasiadas_novedades', ''))).toBe(false);
    expect(isFinal(new Error('red'))).toBe(false);
  });
});

describe('community routes', () => {
  async function setup() {
    const tokens = await platformTokens();
    const users = fakeUsers();
    const accounts = (userId: number) => {
      const user = [...users.byGlobalId.values()].find(u => u.id === userId);
      return user ? { globalId: user.globalId, active: !user.closedAt } : null;
    };
    const { store: community, outbox } = createMemoryCommunityStore(accounts);
    const fake = fakeCommunityClient();
    const projects = createMemoryProjectStore();
    const groups = memoryGroups(projects);
    const dir = mkdtempSync(path.join(tmpdir(), 'nodaria-notificapp-'));
    const upstream = path.join(dir, 'upstream.token');
    writeFileSync(upstream, 'secreto-de-notificapp\n');
    const app = await buildApp(
      testDependencies({
        auth: tokens.provider,
        users: users.store,
        projects,
        groups: { ...groups, projectGroup: async (id: string) => (id === 'g1' ? 'grupo-1' : groups.projectGroup(id)) },
        community,
        communityClient: fake.client,
        config: loadConfig({
          NODE_ENV: 'test',
          PUBLIC_WEB_URL: 'https://nodaria.yosiftware.es',
          NOTIFICAPP_UPSTREAM_TOKEN_FILE: upstream,
        }),
      }),
    );
    const owner = await tokens.sign({ sub: OWNER });
    const other = await tokens.sign({ sub: OTHER });
    const limited = await tokens.sign({ sub: OWNER, restricciones: ['publicacion'] });
    const tokensBy = { owner, other, limited, none: null } as const;
    const call = (
      method: 'GET' | 'PUT' | 'POST' | 'DELETE',
      url: string,
      body?: unknown,
      who: keyof typeof tokensBy = 'owner',
    ) =>
      app.inject({
        method,
        url,
        headers: tokensBy[who] ? { authorization: `Bearer ${tokensBy[who]}` } : {},
        payload: body as never,
      });
    const panel = (method: 'GET' | 'POST', url: string, body?: unknown, token = 'secreto-de-notificapp') =>
      app.inject({ method, url, headers: { authorization: `Bearer ${token}` }, payload: body as never });
    await call('PUT', '/api/projects/p1', { document: doc('p1'), baseVersion: 0 });
    return { call, panel, outbox, fake };
  }

  const publish = (patch: Record<string, unknown> = {}) => ({
    document: doc('p1'),
    description: 'Un mundo de fantasía',
    options: OPTIONS,
    allowCopy: true,
    ...patch,
  });

  it('publica, se lee sin sesión y encola la novedad con su enlace', async () => {
    const { call, outbox } = await setup();
    expect((await call('GET', '/api/projects/p1/publicacion')).json()).toEqual({ publicacion: null });
    const put = await call('PUT', '/api/projects/p1/publicacion', publish());
    expect(put.statusCode).toBe(200);
    const { id, url } = put.json();
    expect(url).toBe(`https://nodaria.yosiftware.es/p/${id}`);
    expect(outbox[0]).toMatchObject({
      channel: 'novedades',
      externalId: `proyecto-${id}`,
      payload: {
        cuenta: OWNER,
        tipo: 'proyecto.publicado',
        texto: 'ha publicado en Nodaria el proyecto «Crónicas de Munfamed», con 2 nodos y 1 relación',
        enlace: url,
      },
    });

    const read = await call('GET', `/api/publicos/${id}`, undefined, 'none');
    expect(read.statusCode).toBe(200);
    expect(read.json()).toMatchObject({
      id,
      name: 'Crónicas de Munfamed',
      author: OWNER,
      allowCopy: true,
      document: doc('p1'),
    });
    // Nunca se enseña el proyecto privado del que sale.
    expect(read.json()).not.toHaveProperty('projectId');
    expect((await call('GET', `/api/publicos?cuenta=${OWNER}`, undefined, 'none')).json().publicos).toHaveLength(1);
    expect((await call('GET', '/api/publicos', undefined, 'none')).json().publicos[0]).not.toHaveProperty('document');
    expect((await call('GET', '/api/publicos/noexiste1234', undefined, 'none')).statusCode).toBe(404);
  });

  it('no publica lo que no es de la persona, de un grupo, con la publicación limitada o sin sincronizar', async () => {
    const { call } = await setup();
    expect((await call('PUT', '/api/projects/p1/publicacion', publish(), 'other')).json()).toMatchObject({
      error: 'project_not_found',
    });
    expect((await call('PUT', '/api/projects/g1/publicacion', publish({ document: doc('g1') }))).json()).toMatchObject({
      error: 'proyecto_de_grupo',
    });
    expect((await call('PUT', '/api/projects/p1/publicacion', publish(), 'limited')).json()).toMatchObject({
      error: 'publicacion_limitada',
    });
    expect((await call('PUT', '/api/projects/p1/publicacion', publish({ document: doc('p2') }))).json()).toMatchObject({
      error: 'project_id_mismatch',
    });
    expect((await call('PUT', '/api/projects/p1/publicacion', publish(), 'none')).statusCode).toBe(401);
  });

  it('deja de publicar al pedirlo y al borrar el proyecto, y retira sus novedades', async () => {
    const { call, outbox } = await setup();
    const { id } = (await call('PUT', '/api/projects/p1/publicacion', publish())).json();
    expect((await call('DELETE', '/api/projects/p1/publicacion')).json()).toEqual({ id });
    expect((await call('GET', `/api/publicos/${id}`, undefined, 'none')).statusCode).toBe(404);
    expect(outbox.map(i => `${i.operation}:${i.externalId}`)).toEqual([`retirar:proyecto-${id}`]);

    const again = (await call('PUT', '/api/projects/p1/publicacion', publish())).json();
    await call('DELETE', '/api/projects/p1?baseVersion=1');
    expect((await call('GET', `/api/publicos/${again.id}`, undefined, 'none')).statusCode).toBe(404);
  });

  it('denuncia, avisa a Notificapp y se modera desde su panel', async () => {
    const { call, panel, outbox, fake } = await setup();
    const { id } = (await call('PUT', '/api/projects/p1/publicacion', publish())).json();
    expect((await call('POST', `/api/publicos/${id}/denuncias`, { motivo: 'spam' }, 'none')).statusCode).toBe(401);
    expect((await call('POST', `/api/publicos/${id}/denuncias`, { motivo: 'spam' })).json()).toMatchObject({
      error: 'denuncia_propia',
    });
    expect((await call('POST', `/api/publicos/${id}/denuncias`, { motivo: 'nada' }, 'other')).statusCode).toBe(400);
    const created = await call('POST', `/api/publicos/${id}/denuncias`, { motivo: 'spam', texto: 'Tienda' }, 'other');
    expect(created.statusCode).toBe(201);
    const reportId = created.json().id;
    expect((await call('POST', `/api/publicos/${id}/denuncias`, { motivo: 'spam' }, 'other')).statusCode).toBe(409);
    expect(outbox.at(-1)).toMatchObject({
      channel: 'notificapp',
      externalId: `report-${reportId}`,
      payload: { kind: 'nodaria_report', data: { report: reportId, publicId: id } },
    });

    expect((await panel('GET', '/notificapp/v1/reports', undefined, 'otra')).statusCode).toBe(401);
    const list = (await panel('GET', '/notificapp/v1/reports')).json();
    expect(list.reports[0]).toMatchObject({ id: reportId, reasonName: 'Publicidad o spam', state: 'pendiente' });
    expect((await panel('GET', '/notificapp/v1/cases')).json().cases).toHaveLength(1);

    const retired = await panel('POST', `/notificapp/v1/reports/${reportId}/retire`, {
      note: 'Spam',
      caso: 'contenido',
      mensaje: 'Hemos retirado tu proyecto público por spam.',
    });
    expect(retired.json()).toMatchObject({ changed: true, incident: 'registrado', report: { state: 'retirado' } });
    expect(fake.calls.find(c => c.op === 'incident')?.body).toMatchObject({
      cuenta: OWNER,
      caso: 'contenido',
      idExterno: `report-${reportId}`,
    });
    // Repetir la acción no cambia nada más.
    expect((await panel('POST', `/notificapp/v1/reports/${reportId}/dismiss`, {})).json()).toMatchObject({
      changed: false,
    });
    expect((await call('GET', `/api/publicos/${id}`, undefined, 'none')).statusCode).toBe(404);
    const own = (await call('GET', '/api/projects/p1/publicacion')).json().publicacion;
    expect(own).toMatchObject({ state: 'retirado', retiredReason: 'Spam' });
    expect((await call('PUT', '/api/projects/p1/publicacion', publish())).json()).toMatchObject({
      error: 'publicacion_retirada',
    });
  });
});
