import type { FastifyPluginAsync } from 'fastify';
import type { AppDependencies } from '../app.ts';

export const healthRoutes: FastifyPluginAsync<Pick<AppDependencies, 'db'>> = async (app, { db }) => {
  app.get('/health', { config: { rateLimit: false } }, async (request, reply) => {
    const time = new Date().toISOString();

    try {
      await db.request().query('SELECT 1 AS ok');
      return { status: 'ok', database: 'ok', time };
    } catch (error) {
      request.log.error(error, 'Comprobación de salud: base de datos no disponible');
      return reply.status(503).send({ status: 'degraded', database: 'error', time });
    }
  });
};
