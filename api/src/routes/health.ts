import type { FastifyPluginAsync } from 'fastify';
import type { AppDependencies } from '../app.ts';

export const healthRoutes: FastifyPluginAsync<Pick<AppDependencies, 'db' | 'database'>> = async (
  app,
  { db, database },
) => {
  app.get('/health', { config: { rateLimit: false } }, async (request, reply) => {
    const time = new Date().toISOString();
    // Mientras no ha conectado nunca (o se está reconectando), se dice sin llenar el registro.
    if (database && !database.connected())
      return reply.status(503).send({ status: 'degraded', database: 'no_disponible', time });

    try {
      await db.request().query('SELECT 1 AS ok');
      return { status: 'ok', database: 'ok', time };
    } catch (error) {
      request.log.error(error, 'Comprobación de salud: base de datos no disponible');
      return reply.status(503).send({ status: 'degraded', database: 'error', time });
    }
  });
};
