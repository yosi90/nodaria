import type { FastifyBaseLogger } from 'fastify';
import type { AppConfig } from '../config.ts';
import { type Database, sql, withTransaction } from '../db/pool.ts';
import { spaceFeedEffect } from '../groups/model.ts';
import { applySpaceEffectSql } from '../groups/repository.ts';
import { createPeriodicTask } from '../periodic.ts';
import { DELETE_USER } from '../users/repository.ts';
import { PlatformError, platformRequest } from './http.ts';

/*
 * Feed de cambios de la plataforma (`ecosistema-kit/FEED_DE_CAMBIOS.md`). Nodaria no enseña perfiles
 * ni relaciones: solo le importa el estado de las cuentas. Con `cerrada` (borrado pedido o
 * suspensión) esconde la cuenta, con `activa` la recupera y con `borrada` borra lo suyo (el usuario y
 * sus proyectos propios; los de sus grupos son del grupo y no se tocan). Lo limitado por moderación se
 * guarda. Los cambios de los espacios (`espacio.*`, `miembro.*`) ponen al día la copia de los grupos con
 * la que se autoriza (`ecosistema-kit/ESPACIOS.md`). El cursor se guarda en la misma transacción que los
 * cambios aplicados; repetir una lectura no cambia nada.
 */

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
          const effect = spaceFeedEffect(change);
          if (effect) {
            await applySpaceEffectSql(transaction, effect);
            continue;
          }
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
    const page = await platformRequest(config, 'GET', `/v1/servicio/cambios?desde=${since}&limite=100`);
    if (!page) throw new PlatformError(502, 'feed_vacio', 'El feed de la plataforma no ha devuelto nada.');
    return page as unknown as FeedPage;
  };
}

/** Lee el feed hasta ponerse al día; se lanza cada cierto tiempo y se puede pedir a mano. */
export function createFeedReader({
  store,
  fetchPage,
  intervalMs,
  log,
  onSpaces,
}: {
  store: FeedStore;
  fetchPage: (since: number) => Promise<FeedPage>;
  intervalMs: number;
  log: Pick<FastifyBaseLogger, 'info' | 'warn' | 'error'>;
  /**
   * Tras aplicar una página: los grupos cuya pertenencia o datos cambiaron, con el id del último cambio
   * de cada uno (para avisar por su canal a quien los tiene abiertos). No se llama por los borrados.
   */
  onSpaces?: (changed: { externalId: string; changeId: number }[]) => void;
}) {
  async function readAll() {
    let cursor = await store.cursor();
    let applied = 0;
    for (let page = 0; page < 1000; page++) {
      const result = await fetchPage(cursor);
      await store.apply(result.cambios, result.cursor);
      applied += result.cambios.length;
      if (onSpaces) {
        const changed = new Map<string, number>();
        for (const change of result.cambios) {
          const effect = spaceFeedEffect(change);
          if (!effect || effect.kind === 'space-deleted') continue;
          changed.set(effect.kind === 'space' ? effect.space.idExterno : effect.externalId, change.id);
        }
        if (changed.size) onSpaces([...changed].map(([externalId, changeId]) => ({ externalId, changeId })));
      }
      cursor = result.cursor;
      if (!result.hayMas) break;
    }
    if (applied) log.info({ applied, cursor }, 'Feed de la plataforma aplicado');
    return applied;
  }

  const task = createPeriodicTask({
    run: readAll,
    intervalMs,
    log,
    failure: 'No se pudo leer el feed de la plataforma',
  });
  return { readOnce: task.runOnce, start: task.start, stop: task.stop };
}
