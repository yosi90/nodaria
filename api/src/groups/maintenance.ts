import type { FastifyBaseLogger } from 'fastify';
import { createPeriodicTask } from '../periodic.ts';
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

  return createPeriodicTask({
    run: runAll,
    intervalMs,
    log,
    failure: 'No se pudo poner al día los espacios de los grupos',
  });
}
