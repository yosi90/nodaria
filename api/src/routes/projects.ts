import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import type { AppDependencies } from '../app.ts';
import { assertCanCreate, authenticatedUser, HttpError } from '../auth/plugin.ts';

export const PROJECT_ID = /^[A-Za-z0-9_-]{1,100}$/;

const paramsSchema = z.object({ id: z.string().regex(PROJECT_ID, 'Identificador de proyecto no válido') });

// Validación mínima del documento: el front es quien migra y repara; aquí solo se comprueba
// que sea un Project reconocible y coherente con la ruta.
export const documentSchema = z
  .object({
    id: z.string(),
    name: z.string().trim().min(1).max(200),
    updatedAt: z.string().refine(value => !Number.isNaN(Date.parse(value)), 'updatedAt no es una fecha'),
    schemas: z.array(z.unknown()),
    nodes: z.array(z.unknown()),
    relations: z.array(z.unknown()),
  })
  .loose();

/** El id del documento tiene que ser el de la ruta. */
export function assertDocumentId(document: { id: string }, id: string) {
  if (document.id !== id) {
    throw new HttpError(400, 'project_id_mismatch', 'El identificador del documento no coincide con la ruta.');
  }
}

/** El documento en JSON para guardarlo; 413 si pasa del tamaño máximo de un proyecto. */
export function serializeDocument(document: object, maxBytes: number) {
  const serialized = JSON.stringify(document);
  if (Buffer.byteLength(serialized, 'utf8') > maxBytes) {
    throw new HttpError(413, 'project_too_large', 'El proyecto supera el tamaño máximo admitido.', { maxBytes });
  }
  return serialized;
}

/** Otro dispositivo de la cuenta escribió antes: la versión vigente va en `current`. */
const versionConflict = (current: unknown) =>
  new HttpError(409, 'version_conflict', 'Otro dispositivo cambió este proyecto antes.', { current });

const putSchema = z.object({
  document: documentSchema,
  baseVersion: z.number().int().min(0),
});

const deleteQuerySchema = z.object({ baseVersion: z.coerce.number().int().min(0).optional() });

export const projectRoutes: FastifyPluginAsync<
  Pick<AppDependencies, 'projects' | 'config' | 'conversations' | 'groups' | 'community'>
> = async (app, { projects, config, conversations, groups, community }) => {
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
    assertDocumentId(document, id);
    const serialized = serializeDocument(document, config.projectMaxBytes);

    // Un proyecto que la cuenta compartió (o el de un grupo suyo con el mismo id) ya no es suyo: otro
    // dispositivo con la copia de antes no lo resucita como proyecto propio.
    const sharedIn = await groups.projectGroup(id);
    if (sharedIn && (await groups.member(sharedIn, authenticatedUser(request).globalId))) {
      throw new HttpError(409, 'proyecto_compartido', 'Este proyecto es de un grupo.', { group: sharedIn });
    }

    // Subir un proyecto que la cuenta aún no tiene es crear contenido: no se deja con `creacion` limitada.
    if (baseVersion === 0) assertCanCreate(authenticatedUser(request));
    const result = await projects.put(
      authenticatedUser(request).id,
      id,
      { name: document.name, document: serialized, updatedAt: document.updatedAt },
      baseVersion,
    );
    if (result.status === 'conflict') throw versionConflict(result.current);
    return { id, version: result.version, serverUpdatedAt: result.serverUpdatedAt };
  });

  app.delete('/projects/:id', async request => {
    const { id } = paramsSchema.parse(request.params);
    const { baseVersion } = deleteQuerySchema.parse(request.query);
    const result = await projects.delete(authenticatedUser(request).id, id, baseVersion ?? null);
    if (result.status === 'not_found')
      throw new HttpError(404, 'project_not_found', 'El proyecto no existe en la cuenta.');
    if (result.status === 'conflict') throw versionConflict(result.current);
    // Las conversaciones con la IA de un proyecto borrado se borran con él, y deja de ser público.
    await conversations.deleteForProject(authenticatedUser(request).id, id);
    await community.unpublish(authenticatedUser(request).id, id);
    return { id, version: result.version, serverUpdatedAt: result.serverUpdatedAt };
  });
};
