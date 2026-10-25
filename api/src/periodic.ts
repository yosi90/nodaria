import type { FastifyBaseLogger } from 'fastify';

/**
 * Un trabajo que se repite cada cierto tiempo y que también se puede pedir a mano (el feed, el
 * mantenimiento de los grupos, la cola de salida). Nunca corre dos veces a la vez: pedirlo mientras corre
 * devuelve la misma pasada. Un fallo de una vuelta se registra y la siguiente lo vuelve a intentar.
 */
export function createPeriodicTask<T>({
  run,
  intervalMs,
  log,
  failure,
}: {
  run: () => Promise<T>;
  intervalMs: number;
  log: Pick<FastifyBaseLogger, 'warn'>;
  /** Lo que se registra si una vuelta falla. */
  failure: string;
}) {
  let timer: NodeJS.Timeout | null = null;
  let running: Promise<T> | null = null;

  function runOnce() {
    running ??= run().finally(() => {
      running = null;
    });
    return running;
  }

  return {
    runOnce,
    start() {
      const tick = () => void runOnce().catch(error => log.warn({ err: error }, failure));
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
