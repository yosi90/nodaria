import type { FastifyBaseLogger } from 'fastify';
import type { SpacesClient } from '../platform/spaces.ts';
import type { GroupStore } from './repository.ts';

/**
 * Lo que la API hace por su cuenta con los espacios: declarar el catálogo de roles (al arrancar y hasta
 * que la plataforma lo acepte; repetirlo no cambia nada) y terminar de borrar los grupos cuyo proyecto
 * ya se entregó pero cuyo espacio la plataforma no llegó a borrar.
 */
export function createGroupMaintenance({
  groups,
  spaces,
  intervalMs,
  log,
}: {
  groups: GroupStore;
  spaces: SpacesClient;
  intervalMs: number;
  log: Pick<FastifyBaseLogger, 'info' | 'warn'>;
}) {
  let rolesDeclared = false;
  let timer: NodeJS.Timeout | null = null;
  let running: Promise<void> | null = null;

  async function runAll() {
    if (!rolesDeclared) {
      await spaces.declareRoles();
      rolesDeclared = true;
      log.info('Roles de los grupos declarados en la plataforma');
    }
    for (const externalId of await groups.pendingDeletes()) {
      await spaces.remove(externalId);
      await groups.finishDelete(externalId);
      log.info({ group: externalId }, 'Espacio del grupo borrado');
    }
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
      const tick = () =>
        void runOnce().catch(error => log.warn({ err: error }, 'No se pudo poner al día los espacios de los grupos'));
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
