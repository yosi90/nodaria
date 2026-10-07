import { createHash, timingSafeEqual } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import type { FastifyPluginAsync, FastifyRequest } from 'fastify';
import type { AppDependencies } from '../app.ts';
import { HttpError } from '../auth/plugin.ts';
import { adminRequestDetail, answerRequest } from '../requests/answer.ts';

type NotificappDependencies = Pick<AppDependencies, 'requests' | 'config'> & {
  /** Lee la credencial externa; por defecto, el archivo de la configuración. */
  readUpstreamToken?: () => Promise<string | null>;
};

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

  app.get('/requests/:id', async request => adminRequestDetail(requests, request));

  app.post('/requests/:id/responses', async request => answerRequest(requests, request));
};
