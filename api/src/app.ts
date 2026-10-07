import cors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit';
import path from 'node:path';
import Fastify, { type FastifyRequest, type FastifyServerOptions } from 'fastify';
import { ZodError } from 'zod';
import type { AuthProvider } from './auth/firebase.ts';
import { createAuthenticate, HttpError } from './auth/plugin.ts';
import type { AppConfig } from './config.ts';
import type { Database } from './db/pool.ts';
import { healthRoutes } from './routes/health.ts';
import { meRoutes } from './routes/me.ts';
import { projectRoutes } from './routes/projects.ts';
import type { ProjectStore } from './projects/repository.ts';
import type { UserStore } from './users/repository.ts';

export interface AppDependencies {
  config: AppConfig;
  db: Pick<Database, 'request'>;
  auth: AuthProvider;
  users: UserStore;
  projects: ProjectStore;
}

// Peticiones por minuto de cada usuario con sesión, además del límite por IP.
export const USER_RATE_LIMIT = 120;

// Detrás del túnel de Cloudflare todas las peticiones llegan desde cloudflared en loopback;
// la dirección real del cliente viaja en CF-Connecting-IP.
function clientAddress(request: FastifyRequest) {
  const forwarded = request.headers['cf-connecting-ip'];
  return typeof forwarded === 'string' && forwarded ? forwarded : request.ip;
}

function tooManyRequests(_request: FastifyRequest, context: { ttl: number }) {
  return {
    statusCode: 429,
    error: 'too_many_requests',
    message: `Demasiadas peticiones. Inténtalo de nuevo en ${Math.ceil(context.ttl / 1000)} s.`,
  };
}

function loggerOptions(config: AppConfig): FastifyServerOptions['logger'] {
  if (config.env === 'test') return false;
  const level = config.env === 'production' ? 'info' : 'debug';
  if (!config.logDir) return { level };
  return {
    level,
    transport: {
      target: 'pino-roll',
      options: {
        file: path.join(config.logDir, 'api'),
        frequency: 'daily',
        dateFormat: 'yyyy-MM-dd',
        extension: '.log',
        mkdir: true,
        limit: { count: 30, removeOtherLogFiles: true },
      },
    },
  };
}

export async function buildApp({ config, db, auth, users, projects }: AppDependencies) {
  const app = Fastify({
    logger: loggerOptions(config),
    trustProxy: 'loopback',
    // Los proyectos viajan como un único documento JSON (imágenes incluidas).
    bodyLimit: config.projectMaxBytes + 1024 * 1024,
  });

  await app.register(cors, {
    origin: (origin, callback) => {
      // Las llamadas servidor a servidor no envían Origin.
      if (!origin || config.corsOrigins.includes(origin)) return callback(null, true);
      callback(null, false);
    },
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
    allowedHeaders: ['Authorization', 'Content-Type'],
    maxAge: 86_400,
  });

  await app.register(rateLimit, {
    max: 300,
    timeWindow: '1 minute',
    keyGenerator: clientAddress,
    errorResponseBuilder: tooManyRequests,
  });

  app.decorateRequest('user', null);

  app.setErrorHandler((error, request, reply) => {
    if (error instanceof ZodError) {
      return reply.status(400).send({
        error: 'invalid_request',
        message: 'La petición no es válida.',
        issues: error.issues.map(issue => ({ path: issue.path.join('.'), message: issue.message })),
      });
    }

    if (error instanceof HttpError) {
      return reply.status(error.statusCode).send({ error: error.code, message: error.message, ...error.details });
    }

    const statusCode = (error as { statusCode?: number }).statusCode ?? 500;
    if (statusCode < 500) {
      return reply.status(statusCode).send({
        error: (error as { code?: string }).code ?? 'request_error',
        message: (error as Error).message,
      });
    }

    request.log.error(error);
    return reply.status(500).send({ error: 'internal_error', message: 'Error interno del servidor.' });
  });

  app.setNotFoundHandler((_request, reply) =>
    reply.status(404).send({ error: 'not_found', message: 'Ruta no encontrada.' }),
  );

  await app.register(healthRoutes, { prefix: '/api', db });

  // Rutas privadas: cada petición trae un usuario de Firebase verificado.
  await app.register(
    async privateApp => {
      privateApp.addHook('onRequest', createAuthenticate(auth, users));
      // fastify.rateLimit() se saltaría porque el hook por IP ya corrió para esta petición,
      // así que el presupuesto por usuario usa el limitador en bruto.
      const userLimiter = privateApp.createRateLimit({
        max: USER_RATE_LIMIT,
        timeWindow: '1 minute',
        keyGenerator: request => `user:${request.user?.id}`,
      });
      privateApp.addHook('preHandler', async (request, reply) => {
        const limit = await userLimiter(request);
        if (limit.isAllowed || !limit.isExceeded) return;
        reply.header('retry-after', limit.ttlInSeconds);
        return reply.status(429).send(tooManyRequests(request, limit));
      });
      await privateApp.register(meRoutes, { auth, users, config });
      await privateApp.register(projectRoutes, { projects, config });
    },
    { prefix: '/api' },
  );

  return app;
}
