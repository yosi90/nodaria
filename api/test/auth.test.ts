import { describe, expect, it } from 'vitest';
import { buildApp, USER_RATE_LIMIT } from '../src/app.ts';
import { fakeUsers, ISSUER, OTHER, OWNER, platformTokens, testDependencies } from './helpers/fakes.ts';

async function setup() {
  const tokens = await platformTokens();
  const users = fakeUsers();
  const app = await buildApp(testDependencies({ auth: tokens.provider, users: users.store }));
  const call = (method: 'GET' | 'DELETE' | 'PUT', token?: string, url = '/api/me', payload?: unknown) =>
    app.inject({
      method,
      url,
      headers: token ? { authorization: `Bearer ${token}` } : {},
      payload: payload as never,
    });
  return { app, tokens, users, call };
}

const project = (id: string) => ({
  document: { id, name: 'Mapa', updatedAt: '2026-10-15T10:00:00.000Z', schemas: [], nodes: [], relations: [] },
  baseVersion: 0,
});

describe('tokens de la plataforma', () => {
  it('exige un token', async () => {
    const { call } = await setup();
    const response = await call('GET');
    expect(response.statusCode).toBe(401);
    expect(response.json()).toMatchObject({ error: 'no_autenticado' });
  });

  it('distingue el token caducado del que no vale', async () => {
    const { call, tokens } = await setup();
    const expired = await tokens.sign({}, { expiresIn: Math.floor(Date.now() / 1000) - 60 });
    expect((await call('GET', expired)).json()).toMatchObject({ error: 'token_caducado' });
    expect((await call('GET', 'basura')).json()).toMatchObject({ error: 'no_autenticado' });
  });

  it('rechaza tokens de otra API, de otro emisor o con un sub que no es un GUID', async () => {
    const { call, tokens } = await setup();
    for (const token of [
      await tokens.sign({}, { audience: 'cuentas' }),
      await tokens.sign({}, { audience: 'lorcana-api' }),
      await tokens.sign({}, { issuer: 'https://cuentas-api.yosiftware.es' }),
      await tokens.sign({ sub: 'uid-de-firebase' }),
    ]) {
      const response = await call('GET', token);
      expect(response.statusCode).toBe(401);
      expect(response.json()).toMatchObject({ error: 'no_autenticado' });
    }
    expect(ISSUER).toContain('qa-');
  });

  it('crea el usuario por su sub la primera vez y lo reutiliza después', async () => {
    const { call, tokens, users } = await setup();
    const first = (await call('GET', await tokens.sign())).json();
    const second = (await call('GET', await tokens.sign({ sub: OWNER.toUpperCase() }))).json();
    expect(first).toMatchObject({ globalId: OWNER, legacyAccount: null, restrictions: [], rulesPending: false });
    expect(second.id).toBe(first.id);
    expect(users.byGlobalId.size).toBe(1);
    const other = (await call('GET', await tokens.sign({ sub: OTHER }))).json();
    expect(other.id).not.toBe(first.id);
  });

  it('no deja seguir a una cuenta cerrada o desactivada', async () => {
    const { call, tokens, users } = await setup();
    await call('GET', await tokens.sign());
    users.byGlobalId.get(OWNER)!.closedAt = new Date();
    expect((await call('GET', await tokens.sign())).json()).toMatchObject({ error: 'cuenta_cerrada' });
  });

  it('con normas pendientes solo deja consultar la cuenta', async () => {
    const { call, tokens } = await setup();
    const token = await tokens.sign({ normasPendientes: true });
    expect((await call('GET', token)).json()).toMatchObject({ rulesPending: true });
    const list = await call('GET', token, '/api/projects');
    expect(list.statusCode).toBe(403);
    expect(list.json()).toMatchObject({ error: 'normas_pendientes' });
  });

  it('con «creacion» limitada no deja subir proyectos nuevos, pero sí cambiar los que ya están', async () => {
    const { call, tokens } = await setup();
    const free = await tokens.sign();
    expect((await call('PUT', free, '/api/projects/p1', project('p1'))).statusCode).toBe(200);
    const hasta = Math.floor(Date.now() / 1000) + 3600;
    const limited = await tokens.sign({ restricciones: ['creacion'], restriccionesHasta: hasta });
    const created = await call('PUT', limited, '/api/projects/p2', project('p2'));
    expect(created.statusCode).toBe(403);
    expect(created.json()).toMatchObject({ error: 'creacion_limitada', hasta: new Date(hasta * 1000).toISOString() });
    const updated = await call('PUT', limited, '/api/projects/p1', { ...project('p1'), baseVersion: 1 });
    expect(updated.statusCode).toBe(200);
    expect((await call('GET', limited)).json()).toMatchObject({ restrictions: ['creacion'] });
  });

  it('limita las peticiones por usuario', async () => {
    const { call, tokens } = await setup();
    const token = await tokens.sign();
    let last = 200;
    for (let i = 0; i <= USER_RATE_LIMIT; i++) last = (await call('GET', token)).statusCode;
    expect(last).toBe(429);
  });
});

describe('DELETE /api/me', () => {
  it('borra los datos de Nodaria de la cuenta; la cuenta sigue y vuelve a empezar vacía', async () => {
    const { call, tokens, users } = await setup();
    const token = await tokens.sign();
    const before = (await call('GET', token)).json();
    expect((await call('DELETE', token)).statusCode).toBe(204);
    expect(users.byGlobalId.size).toBe(0);
    const after = (await call('GET', token)).json();
    expect(after.id).not.toBe(before.id);
  });
});
