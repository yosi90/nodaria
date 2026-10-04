import { describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.ts';
import { loadConfig } from '../src/config.ts';
import { fakeDb, testConfig as config, testDependencies } from './helpers/fakes.ts';

describe('config', () => {
  it('applies defaults and splits CORS origins', () => {
    expect(config.port).toBe(5003);
    expect(config.db.database).toBe('Nodaria');
    expect(config.firebaseProjectId).toBe('yosiftware-nodaria');
    expect(config.projectMaxBytes).toBe(20 * 1024 * 1024);
    expect(config.corsOrigins).toEqual(['https://nodaria.yosiftware.es', 'http://localhost:5173']);
  });

  it('rejects unsafe database names', () => {
    expect(() => loadConfig({ DB_NAME: 'x]; DROP DATABASE master;--' })).toThrow(/DB_NAME/);
  });

  it('rejects a Notificapp URL that is not a URL', () => {
    expect(() => loadConfig({ NOTIFICAPP_URL: 'notificapp' })).toThrow(/NOTIFICAPP_URL/);
  });
});

describe('GET /api/health', () => {
  it('reports ok when the database answers', async () => {
    const app = await buildApp(testDependencies({ db: fakeDb(async () => ({ recordset: [{ ok: 1 }] })) }));
    const response = await app.inject({ method: 'GET', url: '/api/health' });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ status: 'ok', database: 'ok' });
  });

  it('returns 503 when the database fails', async () => {
    const app = await buildApp(
      testDependencies({
        db: fakeDb(async () => {
          throw new Error('down');
        }),
      }),
    );
    const response = await app.inject({ method: 'GET', url: '/api/health' });

    expect(response.statusCode).toBe(503);
    expect(response.json()).toMatchObject({ status: 'degraded', database: 'error' });
  });
});

describe('http plumbing', () => {
  it('answers unknown routes with a Spanish 404', async () => {
    const app = await buildApp(testDependencies());
    const response = await app.inject({ method: 'GET', url: '/api/nope' });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toEqual({ error: 'not_found', message: 'Ruta no encontrada.' });
  });

  it('allows CORS only for configured origins', async () => {
    const app = await buildApp(testDependencies());
    const allowed = await app.inject({
      method: 'GET',
      url: '/api/health',
      headers: { origin: 'http://localhost:5173' },
    });
    const blocked = await app.inject({
      method: 'GET',
      url: '/api/health',
      headers: { origin: 'https://evil.example' },
    });

    expect(allowed.headers['access-control-allow-origin']).toBe('http://localhost:5173');
    expect(blocked.headers['access-control-allow-origin']).toBeUndefined();
  });
});
