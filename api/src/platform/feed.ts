import { readFile } from 'node:fs/promises';
import type { FastifyBaseLogger } from 'fastify';
import type { AppConfig } from '../config.ts';
import { type Database, sql, withTransaction } from '../db/pool.ts';
import { DELETE_USER } from '../users/repository.ts';

/*
 * Feed de cambios de la plataforma (`ecosistema-kit/FEED_DE_CAMBIOS.md`). Nodaria no enseña perfiles
 * ni relaciones: solo le importa el estado de las cuentas. Con `cerrada` (borrado pedido o
 * suspensión) esconde la cuenta, con `activa` la recupera y con `borrada` borra lo suyo (el usuario y
 * sus proyectos). Lo limitado por moderación se guarda. El cursor se guarda en la misma transacción
 * que los cambios aplicados; repetir una lectura no cambia nada.
 */

export const USER_AGENT = 'nodaria-api/1.0';

export interface FeedChange {
  id: number;
  tipo: string;
  cuenta: string;
  cuenta2: string | null;
  datos: unknown;
  fecha: string;
}

export interface FeedPage {
  cambios: FeedChange[];
  cursor: number;
  hayMas: boolean;
}

export interface FeedStore {
  cursor(): Promise<number>;
  /** Aplica los cambios en orden y guarda el cursor nuevo, todo en una transacción. */
  apply(changes: FeedChange[], cursor: number): Promise<void>;
}

interface AccountState {
  estado?: unknown;
  restricciones?: unknown;
  hasta?: unknown;
}

export function createSqlFeedStore(db: Database): FeedStore {
  return {
    async cursor() {
      const result = await db
        .request()
        .query<{ feed_cursor: number | string }>('SELECT feed_cursor FROM dbo.platform_feed WHERE id = 1');
      return Number(result.recordset[0]?.feed_cursor ?? 0);
    },

    async apply(changes, cursor) {
      await withTransaction(db, async transaction => {
        for (const change of changes) {
          if (change.tipo !== 'cuenta.estado') continue;
          const datos = (change.datos ?? {}) as AccountState;
          const request = () => new sql.Request(transaction).input('globalId', sql.UniqueIdentifier, change.cuenta);
          if (datos.estado === 'borrada') {
            const found = await request().query<{ id: number | string }>(
              'SELECT id FROM dbo.users WHERE id_global = @globalId',
            );
            for (const row of found.recordset)
              await new sql.Request(transaction).input('id', sql.BigInt, Number(row.id)).query(DELETE_USER);
            continue;
          }
          const restrictions = Array.isArray(datos.restricciones)
            ? datos.restricciones.filter((r): r is string => typeof r === 'string').join(',')
            : '';
          const until =
            typeof datos.hasta === 'string' && !Number.isNaN(Date.parse(datos.hasta)) ? new Date(datos.hasta) : null;
          await request()
            .input('closed', sql.Bit, datos.estado === 'cerrada')
            .input('restrictions', sql.NVarChar(200), restrictions.slice(0, 200) || null)
            .input('until', sql.DateTime2(3), until).query(`
              UPDATE dbo.users SET
                closed_at = CASE WHEN @closed = 1 THEN COALESCE(closed_at, SYSUTCDATETIME()) ELSE NULL END,
                restrictions = @restrictions,
                restrictions_until = @until
              WHERE id_global = @globalId`);
        }
        await new sql.Request(transaction)
          .input('cursor', sql.BigInt, cursor)
          .query('UPDATE dbo.platform_feed SET feed_cursor = @cursor, updated_at = SYSUTCDATETIME() WHERE id = 1');
      });
    },
  };
}

/** Lee una página del feed con la credencial de servicio, que se lee del archivo en cada llamada. */
export function createFeedClient(config: AppConfig['platform']) {
  return async function fetchPage(since: number): Promise<FeedPage> {
    const token = (await readFile(config.serviceTokenFile, 'utf8')).trim();
    const response = await fetch(`${config.api}/v1/servicio/cambios?desde=${since}&limite=100`, {
      headers: { authorization: `Bearer ${token}`, 'user-agent': USER_AGENT, accept: 'application/json' },
    });
    if (!response.ok) throw new Error(`El feed de la plataforma respondió ${response.status}.`);
    return (await response.json()) as FeedPage;
  };
}

/** Lee el feed hasta ponerse al día; se lanza cada cierto tiempo y se puede pedir a mano. */
export function createFeedReader({
  store,
  fetchPage,
  intervalMs,
  log,
}: {
  store: FeedStore;
  fetchPage: (since: number) => Promise<FeedPage>;
  intervalMs: number;
  log: Pick<FastifyBaseLogger, 'info' | 'warn' | 'error'>;
}) {
  let timer: NodeJS.Timeout | null = null;
  let running: Promise<number> | null = null;

  async function readAll() {
    let cursor = await store.cursor();
    let applied = 0;
    for (let page = 0; page < 1000; page++) {
      const result = await fetchPage(cursor);
      await store.apply(result.cambios, result.cursor);
      applied += result.cambios.length;
      cursor = result.cursor;
      if (!result.hayMas) break;
    }
    if (applied) log.info({ applied, cursor }, 'Feed de la plataforma aplicado');
    return applied;
  }

  function readOnce() {
    running ??= readAll().finally(() => {
      running = null;
    });
    return running;
  }

  return {
    readOnce,
    start() {
      const tick = () =>
        void readOnce().catch(error => log.warn({ err: error }, 'No se pudo leer el feed de la plataforma'));
      tick();
      timer = setInterval(tick, intervalMs);
      timer.unref();
    },
    async stop() {
      if (timer) clearInterval(timer);
      timer = null;
      await running?.catch(() => undefined);
    },
  };
}
