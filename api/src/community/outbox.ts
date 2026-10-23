import type { FastifyBaseLogger } from 'fastify';
import type { CommunityClient } from '../platform/community.ts';
import { PlatformError } from '../platform/spaces.ts';
import type { CommunityStore, OutboxItem } from './repository.ts';

/** Espera antes de cada reintento: 1 min, 5 min, 30 min y después cada 2 horas. */
export function retryDelayMs(attempts: number) {
  return [60_000, 5 * 60_000, 30 * 60_000][attempts] ?? 2 * 60 * 60_000;
}

/**
 * Un fallo que no se arregla reintentando: la plataforma rechaza el contenido o la cuenta ya no está.
 * Un 409 de Notificapp es el mismo `externalId` con otro contenido: el aviso ya existe.
 */
export function isFinal(error: unknown) {
  if (!(error instanceof PlatformError)) return false;
  return error.status >= 400 && error.status < 500 && error.status !== 401 && error.status !== 429;
}

async function deliver(client: CommunityClient, item: OutboxItem) {
  if (item.channel === 'notificapp') return client.notify(item.payload);
  if (item.operation === 'retirar') return client.retireNews(item.externalId);
  // `publicada: false` es la decisión de la persona: ni se avisa ni se reintenta.
  await client.postNews(item.payload);
}

/**
 * Manda lo que espera en la cola, en orden, después de que su transacción se confirmara. Cada envío es
 * idempotente por su `externalId`, así que repetir uno que llegó pero no se borró no duplica nada. Al
 * arrancar, y hasta que la plataforma lo acepte, declara el catálogo de tipos de novedad.
 */
export function createOutboxWorker({
  store,
  client,
  intervalMs,
  log,
}: {
  store: CommunityStore;
  client: CommunityClient;
  intervalMs: number;
  log: Pick<FastifyBaseLogger, 'info' | 'warn'>;
}) {
  let kindsDeclared = false;
  let timer: NodeJS.Timeout | null = null;
  let running: Promise<number> | null = null;

  async function runAll() {
    if (!kindsDeclared) {
      try {
        await client.declareNewsKinds();
        kindsDeclared = true;
        log.info('Tipos de novedad declarados en la plataforma');
      } catch (error) {
        log.warn({ err: error }, 'No se pudo declarar el catálogo de novedades');
      }
    }
    let sent = 0;
    for (const item of await store.due(50)) {
      // Sin el catálogo, la plataforma no admite las novedades: esperan a la siguiente pasada.
      if (item.channel === 'novedades' && !kindsDeclared) continue;
      try {
        await deliver(client, item);
        await store.complete(item.id);
        sent++;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (isFinal(error)) {
          log.warn({ err: error, item: item.externalId, channel: item.channel }, 'Envío descartado');
          await store.complete(item.id);
        } else {
          await store.retry(item.id, new Date(Date.now() + retryDelayMs(item.attempts)), message);
        }
      }
    }
    return sent;
  }

  function runOnce() {
    running ??= runAll().finally(() => {
      running = null;
    });
    return running;
  }

  return {
    runOnce,
    start() {
      const tick = () => void runOnce().catch(error => log.warn({ err: error }, 'No se pudo vaciar la cola de salida'));
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
