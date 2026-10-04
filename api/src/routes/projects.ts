import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import type { AppDependencies } from '../app.ts';
import { authenticatedUser, HttpError } from '../auth/plugin.ts';

export const PROJECT_ID = /^[A-Za-z0-9_-]{1,100}$/;

const paramsSchema = z.object({ id: z.string().regex(PROJECT_ID, 'Identificador de proyecto no válido') });

// Validación mínima del documento: el front es quien migra y repara; aquí solo se comprueba
// que sea un Project reconocible y coherente con la ruta.
const documentSchema = z
  .object({
    id: z.string(),
    name: z.string().trim().min(1).max(200),
    updatedAt: z.string().refine(value => !Number.isNaN(Date.parse(value)), 'updatedAt no es una fecha'),
    schemas: z.array(z.unknown()),
    nodes: z.array(z.unknown()),
    relations: z.array(z.unknown()),
  })
  .loose();

const putSchema = z.object({
  document: documentSchema,
  baseVersion: z.number().int().min(0),
});

const deleteQuerySchema = z.object({ baseVersion: z.coerce.number().int().min(0).optional() });

export const projectRoutes: FastifyPluginAsync<Pick<AppDependencies, 'projects' | 'config'>> = async (
  app,
  { projects, config },
) => {
  app.get('/projects', async request => ({ projects: await projects.list(authenticatedUser(request).id) }));

  app.get('/projects/:id', async request => {
    const { id } = paramsSchema.parse(request.params);
    const stored = await projects.get(authenticatedUser(request).id, id);
    if (!stored) throw new HttpError(404, 'project_not_found', 'El proyecto no existe en la cuenta.');
    if (stored.document === null) {
      throw new HttpError(404, 'project_deleted', 'El proyecto fue borrado.', {
        version: stored.version,
        deletedAt: stored.deletedAt,
      });
    }
    const { document, ...summary } = stored;
    return { ...summary, document: JSON.parse(document) };
  });

  app.put('/projects/:id', async request => {
    const { id } = paramsSchema.parse(request.params);
    const { document, baseVersion } = putSchema.parse(request.body);
    if (document.id !== id) {
      throw new HttpError(400, 'project_id_mismatch', 'El identificador del documento no coincide con la ruta.');
    }
    const serialized = JSON.stringify(document);
    if (Buffer.byteLength(serialized, 'utf8') > config.projectMaxBytes) {
      throw new HttpError(413, 'project_too_large', 'El proyecto supera el tamaño máximo admitido.', {
        maxBytes: config.projectMaxBytes,
      });
    }

    const result = await projects.put(
      authenticatedUser(request).id,
      id,
      { name: document.name, document: serialized, updatedAt: document.updatedAt },
      baseVersion,
    );
    if (result.status === 'conflict') {
      throw new HttpError(409, 'version_conflict', 'Otro dispositivo cambió este proyecto antes.', {
        current: result.current,
      });
    }
    return { id, version: result.version, serverUpdatedAt: result.serverUpdatedAt };
  });

  app.delete('/projects/:id', async request => {
    const { id } = paramsSchema.parse(request.params);
    const { baseVersion } = deleteQuerySchema.parse(request.query);
    const result = await projects.delete(authenticatedUser(request).id, id, baseVersion ?? null);
    if (result.status === 'not_found')
      throw new HttpError(404, 'project_not_found', 'El proyecto no existe en la cuenta.');
    if (result.status === 'conflict') {
      throw new HttpError(409, 'version_conflict', 'Otro dispositivo cambió este proyecto antes.', {
        current: result.current,
      });
    }
    return { id, version: result.version, serverUpdatedAt: result.serverUpdatedAt };
  });
};
