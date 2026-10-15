import type { FastifyPluginAsync } from 'fastify';
import type { AppDependencies } from '../app.ts';
import { authenticatedUser } from '../auth/plugin.ts';

/*
 * La cuenta es de la plataforma Yosiftware: aquí solo se ve el usuario local de Nodaria y se pueden
 * borrar sus datos (los proyectos guardados en la cuenta). Borrar la cuenta entera se hace en la web
 * social; cuando la plataforma la borra, el feed lo avisa y Nodaria borra lo suyo (`platform/feed.ts`).
 */
export const meRoutes: FastifyPluginAsync<Pick<AppDependencies, 'users'>> = async (app, { users }) => {
  app.get('/me', async request => {
    const user = authenticatedUser(request);
    return {
      id: user.id,
      globalId: user.globalId,
      // Clave de la cuenta de antes de migrar: el navegador conserva con ella su recuerdo de sincronización.
      legacyAccount: user.legacyAccount,
      createdAt: user.createdAt,
      restrictions: user.identity.restrictions,
      restrictionsUntil: user.identity.restrictionsUntil,
      rulesPending: user.identity.rulesPending,
    };
  });

  // Borra los datos de Nodaria de esta cuenta (el usuario local y sus proyectos); la cuenta sigue.
  app.delete('/me', async (request, reply) => {
    const user = authenticatedUser(request);
    await users.delete(user.id);
    request.log.info({ userId: user.id }, 'Datos de Nodaria borrados a petición de la cuenta');
    return reply.status(204).send();
  });
};
