import { createHash, timingSafeEqual } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import type { FastifyPluginAsync, FastifyRequest } from 'fastify';
import { z } from 'zod';
import type { AppDependencies } from '../app.ts';
import { HttpError } from '../auth/plugin.ts';
import { REQUEST_STATUSES } from '../requests/model.ts';

type NotificappDependencies = Pick<AppDependencies, 'requests' | 'config'> & {
  /** Lee la credencial externa; por defecto, el archivo de la configuración. */
  readUpstreamToken?: () => Promise<string | null>;
};

const IDEMPOTENCY_KEY = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;

const idParams = z.object({ id: z.coerce.number().int().positive() });

const responseBody = z.object({
  status: z.enum(REQUEST_STATUSES),
  message: z
    .string()
    .trim()
    .max(2000)
    .nullish()
    .transform(value => value || null),
  duplicateOf: z
    .number()
    .int()
    .positive()
    .nullish()
    .transform(value => value ?? null),
});

/** Iguala en tiempo constante (las longitudes distintas se comparan sobre sus huellas). */
function sameToken(given: string, expected: string) {
  const hash = (value: string) => createHash('sha256').update(value).digest();
  return timingSafeEqual(hash(given), hash(expected));
}

/**
 * Rutas que solo invoca el servidor de Notificapp con la credencial externa del plugin
 * `nodaria-api`. No aceptan tokens de Firebase.
 */
export const notificappRoutes: FastifyPluginAsync<NotificappDependencies> = async (
  app,
  { requests, config, readUpstreamToken },
) => {
  const readToken =
    readUpstreamToken ??
    (async () => {
      try {
        return (await readFile(config.notificapp.upstreamTokenFile, 'utf8')).trim() || null;
      } catch {
        return null;
      }
    });

  app.addHook('onRequest', async (request: FastifyRequest) => {
    const expected = await readToken();
    if (!expected)
      throw new HttpError(503, 'notificapp_unavailable', 'La integración con Notificapp no está configurada.');
    const match = /^Bearer\s+(\S+)$/i.exec(request.headers.authorization ?? '');
    if (!match || !sameToken(match[1], expected)) {
      throw new HttpError(401, 'notificapp_unauthorized', 'Credencial de Notificapp no válida.');
    }
  });

  app.get('/requests', async () => requests.listOpen(100));

  app.get('/requests/:id', async request => {
    const { id } = idParams.parse(request.params);
    const detail = await requests.adminDetail(id);
    if (!detail) throw new HttpError(404, 'request_not_found', 'La petición no existe.');
    return detail;
  });

  app.post('/requests/:id/responses', async request => {
    const { id } = idParams.parse(request.params);
    const key = request.headers['idempotency-key'];
    if (typeof key !== 'string' || !IDEMPOTENCY_KEY.test(key)) {
      throw new HttpError(400, 'idempotency_key_invalid', 'Falta la cabecera Idempotency-Key o no es válida.');
    }
    const body = responseBody.parse(request.body);
    const hash = createHash('sha256')
      .update(JSON.stringify({ id, ...body }))
      .digest('hex');

    const result = await requests.respond(id, body, { key, hash });
    switch (result.status) {
      case 'not_found':
        throw new HttpError(404, 'request_not_found', 'La petición no existe.');
      case 'conflict':
        throw new HttpError(409, 'idempotency_conflict', 'Esa clave ya se usó con otra respuesta.');
      case 'invalid_duplicate':
        throw new HttpError(400, 'duplicate_invalid', 'Indica una petición existente y distinta como original.');
      default:
        request.log.info(
          { requestId: id, status: body.status, replayed: result.status === 'replayed' },
          'Petición respondida',
        );
        return { ...result.request, replayed: result.status === 'replayed' };
    }
  });
};
