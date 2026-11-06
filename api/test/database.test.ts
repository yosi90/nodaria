import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildApp } from '../src/app.ts';
import { linkDatabase } from '../src/db/pool.ts';
import { testDependencies } from './helpers/fakes.ts';

const quietLog = { info: () => undefined, warn: () => undefined };

/** Un pool que falla las primeras `failures` veces que se le pide conectar. */
function flakyPool(failures: number) {
  const pool = {
    connected: false,
    attempts: 0,
    async connect() {
      pool.attempts += 1;
      if (pool.attempts <= failures) throw new Error('SQL Server aún no acepta conexiones');
      pool.connected = true;
      return pool;
    },
  };
  return pool;
}

describe('linkDatabase', () => {
  afterEach(() => vi.useRealTimers());

  it('arranca sin la base y reintenta con una espera que crece hasta conectar', async () => {
    vi.useFakeTimers();
    const pool = flakyPool(3);
    const link = linkDatabase(pool as never, quietLog, { minDelayMs: 1_000, maxDelayMs: 3_000 });

    link.start();
    await vi.advanceTimersByTimeAsync(0);
    expect(pool.attempts).toBe(1);
    expect(link.connected()).toBe(false);

    await vi.advanceTimersByTimeAsync(1_000);
    expect(pool.attempts).toBe(2);
    await vi.advanceTimersByTimeAsync(1_999);
    expect(pool.attempts).toBe(2);
    await vi.advanceTimersByTimeAsync(1);
    expect(pool.attempts).toBe(3);
    // La espera no pasa del máximo.
    await vi.advanceTimersByTimeAsync(3_000);
    expect(pool.attempts).toBe(4);
    expect(link.connected()).toBe(true);

    await vi.advanceTimersByTimeAsync(60_000);
    expect(pool.attempts).toBe(4);
  });

  it('una petición que la necesita vuelve a intentarlo, y las simultáneas comparten el intento', async () => {
    const pool = flakyPool(1);
    const link = linkDatabase(pool as never, quietLog);

    expect(await link.ensure()).toBe(false);
    const [a, b] = await Promise.all([link.ensure(), link.ensure()]);
    expect([a, b]).toEqual([true, true]);
    expect(pool.attempts).toBe(2);
  });
});

describe('la API sin la base', () => {
  function appWith(database: { connected(): boolean; ensure(): Promise<boolean> }) {
    return buildApp(testDependencies({ database }));
  }

  it('la salud dice que falta la base, sin esperar ni reintentar', async () => {
    const ensure = vi.fn(async () => false);
    const app = await appWith({ connected: () => false, ensure });
    const response = await app.inject({ method: 'GET', url: '/api/health' });

    expect(response.statusCode).toBe(503);
    expect(response.json()).toMatchObject({ status: 'degraded', database: 'no_disponible' });
    expect(ensure).not.toHaveBeenCalled();
  });

  it('una ruta que usa la base responde 503 si sigue sin estar, y sirve en cuanto aparece', async () => {
    let up = false;
    const app = await appWith({ connected: () => false, ensure: async () => up });

    const down = await app.inject({ method: 'GET', url: '/api/publicos' });
    expect(down.statusCode).toBe(503);
    expect(down.json()).toMatchObject({ error: 'base_no_disponible' });

    up = true;
    const back = await app.inject({ method: 'GET', url: '/api/publicos' });
    expect(back.statusCode).toBe(200);
  });

  it('una ruta que no existe sigue siendo 404', async () => {
    const app = await appWith({ connected: () => false, ensure: async () => false });
    const response = await app.inject({ method: 'GET', url: '/api/nope' });
    expect(response.statusCode).toBe(404);
  });
});
