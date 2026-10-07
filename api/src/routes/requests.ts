import type { FastifyPluginAsync, FastifyRequest } from 'fastify';
import { z } from 'zod';
import type { AppDependencies } from '../app.ts';
import { authenticatedUser, HttpError } from '../auth/plugin.ts';
import { requestEvent } from '../notificapp/events.ts';
import { DAILY_REQUEST_LIMIT, REQUEST_KINDS, REQUEST_STATUSES } from '../requests/model.ts';

type RequestDependencies = Pick<AppDependencies, 'requests' | 'config'> & { onQueued?: () => void };

const idParams = z.object({ id: z.coerce.number().int().positive() });

const boardQuery = z.object({
  sort: z.enum(['votes', 'recent']).default('votes'),
  status: z.enum(REQUEST_STATUSES).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

const newRequest = z.object({
  kind: z.enum(REQUEST_KINDS),
  title: z.string().trim().min(4, 'El título es demasiado corto.').max(120, 'El título es demasiado largo.'),
  body: z.string().trim().min(10, 'Cuéntalo con algo más de detalle.').max(4000, 'La descripción es demasiado larga.'),
});

const notFound = () => new HttpError(404, 'request_not_found', 'La petición no existe.');

/** Tablón público: se puede leer sin sesión; con ella, cada idea indica si es propia y si ya se votó. */
export const publicRequestRoutes: FastifyPluginAsync<Pick<AppDependencies, 'requests'>> = async (app, { requests }) => {
  app.get('/requests', async request => {
    const query = boardQuery.parse(request.query);
    const page = await requests.board({ ...query, status: query.status ?? null, viewerId: request.user?.id ?? null });
    return { ...page, limit: query.limit, offset: query.offset };
  });

  app.get('/requests/:id', async request => {
    const { id } = idParams.parse(request.params);
    const detail = await requests.detail(id, request.user?.id ?? null);
    if (!detail) throw notFound();
    return detail;
  });
};

export const requestRoutes: FastifyPluginAsync<RequestDependencies> = async (app, { requests, config, onQueued }) => {
  app.post('/requests', async (request, reply) => {
    const input = newRequest.parse(request.body);
    const user = authenticatedUser(request);
    const result = await requests.create(user.id, input, created =>
      config.notificapp.enabled ? requestEvent(created) : null,
    );
    if (result.status === 'rate_limited') {
      throw new HttpError(
        429,
        'request_limit',
        `Puedes enviar como mucho ${DAILY_REQUEST_LIMIT} peticiones al día. Vuelve a intentarlo mañana.`,
      );
    }
    request.log.info({ requestId: result.request.id, kind: input.kind }, 'Petición creada');
    onQueued?.();
    return reply.status(201).send(result.request);
  });

  const vote = (voted: boolean) => async (request: FastifyRequest) => {
    const { id } = idParams.parse(request.params);
    const result = await requests.vote(authenticatedUser(request).id, id, voted);
    if (result.status === 'not_found') throw notFound();
    if (result.status === 'closed') {
      throw new HttpError(409, 'voting_closed', 'Esta idea ya no admite votos.');
    }
    return { id, votes: result.votes, voted: result.voted };
  };
  app.put('/requests/:id/vote', vote(true));
  app.delete('/requests/:id/vote', vote(false));

  app.get('/me/requests', async request => ({ requests: await requests.mine(authenticatedUser(request).id) }));

  app.post('/me/requests/:id/read', async (request, reply) => {
    const { id } = idParams.parse(request.params);
    if (!(await requests.markRead(authenticatedUser(request).id, id))) throw notFound();
    return reply.status(204).send();
  });
};
