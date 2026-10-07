import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import type { AppDependencies } from '../app.ts';
import { authenticatedUser, HttpError } from '../auth/plugin.ts';
import { adminRequestDetail, answerRequest } from '../requests/answer.ts';
import { REQUEST_KINDS, REQUEST_STATUSES } from '../requests/model.ts';

const listQuery = z.object({
  scope: z.enum(['open', 'all']).default('open'),
  status: z.enum(REQUEST_STATUSES).optional(),
  kind: z.enum(REQUEST_KINDS).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

/** Panel de administración de la web: solo cuentas con `users.is_admin`. */
export const adminRoutes: FastifyPluginAsync<Pick<AppDependencies, 'requests'>> = async (app, { requests }) => {
  app.addHook('preHandler', async request => {
    if (!authenticatedUser(request).isAdmin) {
      throw new HttpError(403, 'admin_required', 'Esta sección es solo para administradores.');
    }
  });

  app.get('/admin/requests', async request => {
    const query = listQuery.parse(request.query);
    const page = await requests.adminList({ ...query, status: query.status ?? null, kind: query.kind ?? null });
    return { ...page, limit: query.limit, offset: query.offset };
  });

  app.get('/admin/requests/:id', async request => adminRequestDetail(requests, request));

  app.post('/admin/requests/:id/responses', async request => answerRequest(requests, request));
};
