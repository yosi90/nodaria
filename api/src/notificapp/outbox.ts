import { readFile } from 'node:fs/promises';
import type { FastifyBaseLogger } from 'fastify';
import type { AppConfig } from '../config.ts';
import type { Database } from '../db/pool.ts';
import { sql } from '../db/pool.ts';

export interface PendingEvent {
  externalId: string;
  payload: string;
  attempts: number;
}

/** Cola `notificapp_outbox`: las filas se escriben en la transacción de la petición. */
export interface OutboxStore {
  pending(limit: number): Promise<PendingEvent[]>;
  markSent(externalId: string, note: string | null): Promise<void>;
  markFailed(externalId: string, error: string, nextAttemptAt: Date): Promise<void>;
}

export function createSqlOutboxStore(db: Database): OutboxStore {
  return {
    async pending(limit) {
      const result = await db
        .request()
        .input('limit', sql.Int, limit)
        .query<{ external_id: string; payload: string; attempts: number }>(
          `SELECT TOP (@limit) external_id, payload, attempts FROM dbo.notificapp_outbox
           WHERE sent_at IS NULL AND next_attempt_at <= SYSUTCDATETIME() ORDER BY created_at`,
        );
      return result.recordset.map(row => ({
        externalId: row.external_id,
        payload: row.payload,
        attempts: row.attempts,
      }));
    },
    async markSent(externalId, note) {
      await db
        .request()
        .input('id', sql.VarChar(128), externalId)
        .input('note', sql.NVarChar(500), note)
        .query(
          `UPDATE dbo.notificapp_outbox SET sent_at = SYSUTCDATETIME(), attempts = attempts + 1, last_error = @note
           WHERE external_id = @id`,
        );
    },
    async markFailed(externalId, error, nextAttemptAt) {
      await db
        .request()
        .input('id', sql.VarChar(128), externalId)
        .input('error', sql.NVarChar(500), error.slice(0, 500))
        .input('next', sql.DateTime2(3), nextAttemptAt)
        .query(
          `UPDATE dbo.notificapp_outbox SET attempts = attempts + 1, last_error = @error, next_attempt_at = @next
           WHERE external_id = @id`,
        );
    },
  };
}

/** Espera antes del siguiente intento: 1, 2, 4… minutos, hasta 6 horas. */
export const retryDelayMs = (attempts: number) => Math.min(60_000 * 2 ** attempts, 6 * 3600_000);

interface DrainerOptions {
  outbox: OutboxStore;
  config: AppConfig['notificapp'];
  log: FastifyBaseLogger;
  fetch?: typeof fetch;
  readToken?: () => Promise<string | null>;
  clock?: () => Date;
}

/**
 * Publica en Notificapp los avisos pendientes. Repetir un `externalId` con el mismo contenido
 * no duplica el aviso (200), así que reintentar es seguro.
 */
export function createOutboxDrainer({
  outbox,
  config,
  log,
  fetch: send = fetch,
  readToken = async () => {
    try {
      return (await readFile(config.senderTokenFile, 'utf8')).trim() || null;
    } catch {
      return null;
    }
  },
  clock = () => new Date(),
}: DrainerOptions) {
  let running: Promise<void> | null = null;
  let again = false;
  let timer: NodeJS.Timeout | null = null;

  async function drainOnce() {
    const events = await outbox.pending(20);
    if (events.length === 0) return;
    const token = await readToken();
    if (!token) {
      log.warn({ pending: events.length }, 'Notificapp: falta la credencial de emisor; los avisos siguen en cola');
      for (const event of events) {
        await outbox.markFailed(
          event.externalId,
          'missing_sender_token',
          new Date(clock().getTime() + retryDelayMs(event.attempts)),
        );
      }
      return;
    }
    for (const event of events) {
      try {
        const response = await send(new URL('/v1/events', config.url), {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: event.payload,
          signal: AbortSignal.timeout(15_000),
        });
        if (response.ok) {
          await outbox.markSent(event.externalId, null);
        } else if (response.status === 409) {
          // Mismo externalId con otro contenido: reintentar no lo arreglaría.
          log.error({ externalId: event.externalId }, 'Notificapp rechazó el aviso por conflicto (409)');
          await outbox.markSent(event.externalId, 'conflict_409');
        } else {
          throw new Error(`HTTP ${response.status}`);
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        log.warn({ externalId: event.externalId, error: message }, 'Notificapp: aviso no entregado, se reintentará');
        await outbox.markFailed(event.externalId, message, new Date(clock().getTime() + retryDelayMs(event.attempts)));
      }
    }
  }

  /** Lanza una pasada; si ya hay una en curso, programa otra al terminar. */
  function trigger(): Promise<void> {
    if (running) {
      again = true;
      return running;
    }
    running = (async () => {
      do {
        again = false;
        await drainOnce().catch(error => log.error(error, 'Notificapp: fallo al vaciar la cola'));
      } while (again);
    })().finally(() => {
      running = null;
    });
    return running;
  }

  return {
    trigger,
    start(intervalMs = 60_000) {
      timer = setInterval(() => void trigger(), intervalMs);
      timer.unref();
      void trigger();
    },
    async stop() {
      if (timer) clearInterval(timer);
      timer = null;
      await running;
    },
  };
}
