import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import type { AppDependencies } from '../app.ts';
import { assertCanCreate, type AuthenticatedUser, authenticatedUser, HttpError } from '../auth/plugin.ts';
import {
  capabilitiesOf,
  changedSchemaKeys,
  CREATOR_ROLE,
  groupExternalId,
  GROUP_NAME_MAX,
  type PlatformSpace,
} from '../groups/model.ts';
import type { GroupRecord, GroupView } from '../groups/repository.ts';
import { PlatformError } from '../platform/http.ts';
import { MAX_COMMENTS, type CommentState } from '../groups/comments.ts';
import { assertDocumentId, documentSchema, PROJECT_ID, serializeDocument } from './projects.ts';

/*
 * Grupos de trabajo (docs/roadmaps/ROADMAP_COLABORACION.md). Cada grupo es un espacio de la plataforma
 * con un proyecto compartido. Crear y borrar el grupo pasa por aquí (la API crea el espacio a nombre de
 * quien lo pide y lo borra después de entregar el proyecto); invitar, aceptar, salir y cambiar roles los
 * hace la persona desde el frontend con el SDK. La autorización usa la copia local del feed.
 */

const GROUP_ID = /^grupo-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

const groupParams = z.object({ group: z.string().regex(GROUP_ID, 'Identificador de grupo no válido') });
const projectParams = groupParams.extend({
  id: z.string().regex(PROJECT_ID, 'Identificador de proyecto no válido'),
});

const createSchema = z.object({
  /** UUID que elige el frontend: repetir la creación con el mismo no crea otro grupo. */
  id: z.uuid(),
  name: z
    .string()
    .trim()
    .min(1, 'Escribe el nombre del grupo.')
    .max(GROUP_NAME_MAX, `El nombre del grupo admite hasta ${GROUP_NAME_MAX} caracteres.`),
  document: documentSchema,
});

const putSchema = z.object({ document: documentSchema, baseVersion: z.number().int().min(1) });

// Los identificadores de las cuentas son GUID de SQL Server, no UUID del RFC 4122.
const GLOBAL_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const commentParams = projectParams.extend({ comment: z.coerce.number().int().positive() });
const suggestionValue = z.union([
  z.string().max(4000),
  z.number(),
  z.boolean(),
  z.null(),
  z.array(z.string().max(400)).max(100),
]);
const commentSchema = z
  .object({
    nodeId: z.string().regex(PROJECT_ID).nullable().optional(),
    body: z.string().trim().min(1, 'Escribe el comentario.').max(4000),
    suggestion: z
      .object({ fieldId: z.string().min(1).max(100), value: suggestionValue })
      .nullable()
      .optional(),
  })
  .refine(c => !c.suggestion || c.nodeId, { message: 'Una sugerencia es sobre un nodo.', path: ['nodeId'] });
const stateSchema = z.object({ state: z.enum(['abierto', 'resuelto', 'aceptado', 'rechazado']) });

/** Nombres propios de los roles: solo de los que declara Nodaria, hasta 40 caracteres. */
const labelsSchema = z.object({
  labels: z.partialRecord(z.enum(['responsable', 'editor', 'revisor', 'lector']), z.string().trim().max(40)).nullable(),
});

const deleteQuery = z.object({ recipient: z.string().regex(GLOBAL_ID, 'Cuenta no válida') });

const NOT_FOUND = () => new HttpError(404, 'grupo_no_encontrado', 'El grupo no existe o no eres miembro.');
const FORBIDDEN = () => new HttpError(403, 'sin_permiso_en_el_grupo', 'Tu rol en el grupo no te deja hacer eso.');
const PROJECT_NOT_FOUND = () => new HttpError(404, 'project_not_found', 'El proyecto no existe en el grupo.');
const ALREADY_SHARED = () => new HttpError(409, 'proyecto_ya_compartido', 'Ese proyecto ya es de otro grupo.');

function serialize(view: GroupView, user: AuthenticatedUser) {
  const isOwner = view.owner === user.globalId;
  return {
    id: view.externalId,
    spaceId: view.spaceId,
    name: view.name,
    owner: view.owner,
    role: view.member.role,
    memberState: view.member.state,
    isOwner,
    capabilities: capabilitiesOf({ ...view.member, owner: isOwner }),
    roleLabels: view.roleLabels,
    projects: view.projects,
  };
}

export const groupRoutes: FastifyPluginAsync<
  Pick<AppDependencies, 'groups' | 'spaces' | 'users' | 'config' | 'feed' | 'comments'>
> = async (app, { groups, spaces, users, config, feed, comments }) => {
  async function access(user: AuthenticatedUser, externalId: string) {
    const group = await groups.find(externalId);
    if (!group || group.state !== 'activo') throw NOT_FOUND();
    const member = await groups.member(externalId, user.globalId);
    const capabilities = capabilitiesOf(member && { ...member, owner: group.owner === user.globalId });
    if (!capabilities.read) throw NOT_FOUND();
    return { group, capabilities };
  }

  /** Errores de la plataforma: 424 y no 502, que Cloudflare sustituye por su propia página. */
  function platformFailure(error: unknown): never {
    if (error instanceof PlatformError) {
      if (error.code === 'cuenta_restringida')
        throw new HttpError(403, 'creacion_limitada', 'Tu cuenta tiene limitado crear contenido nuevo.');
      if (error.code === 'demasiados_espacios' || error.code === 'demasiados_espacios_de_la_cuenta')
        throw new HttpError(429, error.code, 'Has llegado al límite de grupos. Inténtalo más tarde.');
      throw new HttpError(424, 'plataforma_no_disponible', 'La plataforma no ha podido crear el grupo.', {
        causa: error.code,
      });
    }
    throw new HttpError(424, 'plataforma_no_disponible', 'No se ha podido contactar con la plataforma.');
  }

  async function createSpace(user: AuthenticatedUser, group: GroupRecord): Promise<PlatformSpace> {
    const request = () =>
      spaces.create(user.globalId, { idExterno: group.externalId, nombre: group.name, rol: CREATOR_ROLE });
    try {
      return await request();
    } catch (error) {
      // Los roles se declaran al arrancar; si la plataforma aún no los tiene, se declaran y se repite.
      if (!(error instanceof PlatformError && error.code === 'sin_roles')) platformFailure(error);
    }
    try {
      await spaces.declareRoles();
      return await request();
    } catch (error) {
      platformFailure(error);
    }
  }

  const list = async (user: AuthenticatedUser) => ({
    groups: (await groups.listForMember(user.globalId)).map(view => serialize(view, user)),
  });

  app.get('/grupos', async request => list(authenticatedUser(request)));

  // Tras aceptar una invitación o cambiar un rol desde el SDK: lee el feed ya, sin esperar a la siguiente vuelta.
  app.post('/grupos/actualizar', async request => {
    await feed?.readOnce().catch(error => request.log.warn({ err: error }, 'No se pudo leer el feed'));
    return list(authenticatedUser(request));
  });

  // Crea el grupo con el proyecto que se comparte: el proyecto deja de ser de la cuenta y pasa al grupo.
  app.post('/grupos', async request => {
    const user = authenticatedUser(request);
    assertCanCreate(user);
    const { id, name, document } = createSchema.parse(request.body);
    const serialized = serializeDocument(document, config.projectMaxBytes);
    const externalId = groupExternalId(id);
    const sharedIn = await groups.projectGroup(document.id);
    if (sharedIn && sharedIn !== externalId) throw ALREADY_SHARED();

    const begun = await groups.beginCreate({ externalId, name, createdBy: user.globalId });
    if (begun.status === 'taken')
      throw new HttpError(409, 'grupo_ya_existe', 'Ese identificador de grupo ya está en uso.');
    let group = begun.group;
    if (group.state === 'creando')
      group = await groups.completeCreate(externalId, await createSpace(user, group), CREATOR_ROLE);

    const attached = await groups.attachProject(externalId, user.id, {
      projectId: document.id,
      name: document.name,
      document: serialized,
      updatedAt: document.updatedAt,
      by: user.globalId,
    });
    if (attached.status === 'already_shared') throw ALREADY_SHARED();
    const view = (await groups.listForMember(user.globalId)).find(item => item.externalId === externalId);
    if (!view) throw NOT_FOUND();
    return serialize(view, user);
  });

  app.get('/grupos/:group/proyectos/:id', async request => {
    const user = authenticatedUser(request);
    const { group, id } = projectParams.parse(request.params);
    await access(user, group);
    const stored = await groups.getProject(group, id);
    if (!stored) throw PROJECT_NOT_FOUND();
    const { document, ...summary } = stored;
    return { ...summary, document: JSON.parse(document) };
  });

  app.put('/grupos/:group/proyectos/:id', async request => {
    const user = authenticatedUser(request);
    const { group, id } = projectParams.parse(request.params);
    const { capabilities } = await access(user, group);
    if (!capabilities.edit) throw FORBIDDEN();
    const { document, baseVersion } = putSchema.parse(request.body);
    assertDocumentId(document, id);
    const serialized = serializeDocument(document, config.projectMaxBytes);
    if (!capabilities.editSchema) await assertSchemaUnchanged(group, id, document, baseVersion);

    const result = await groups.putProject(
      group,
      id,
      { name: document.name, document: serialized, updatedAt: document.updatedAt, by: user.globalId },
      baseVersion,
    );
    if (result.status === 'conflict') {
      if (!result.current) throw PROJECT_NOT_FOUND();
      throw new HttpError(409, 'version_conflict', 'Otra persona cambió este proyecto antes.', {
        current: result.current,
      });
    }
    // Ya guardado: se avisa por el canal del espacio a quien lo tiene abierto (hito 3). Solo la
    // referencia, que el frontend baja de esta API; si falla, lo recogen al sondear.
    spaces
      .publish(group, `${id}-v${result.version}`, { tipo: 'proyecto', id, version: result.version, por: user.globalId })
      .catch(error => request.log.warn({ err: error, group }, 'No se pudo publicar en el canal del grupo'));
    return { id, version: result.version, serverUpdatedAt: result.serverUpdatedAt };
  });

  // Nombres propios de los roles del grupo: quien tiene la propiedad o el rol responsable (los que
  // gestionan el grupo en la plataforma). Solo etiquetas: los permisos no cambian.
  app.put('/grupos/:group/nombres-de-rol', async request => {
    const user = authenticatedUser(request);
    const { group } = groupParams.parse(request.params);
    const found = await access(user, group);
    const member = await groups.member(group, user.globalId);
    if (found.group.owner !== user.globalId && member?.role !== 'responsable') throw FORBIDDEN();
    const { labels } = labelsSchema.parse(request.body);
    const clean = labels ? Object.fromEntries(Object.entries(labels).filter(([, name]) => name)) : null;
    await groups.setRoleLabels(group, clean && Object.keys(clean).length ? clean : null);
    void spaces
      .publish(group, `nombres-de-rol-${Date.now()}`, { tipo: 'grupo' })
      .catch(error => request.log.warn({ err: error, group }, 'No se pudo avisar al canal del grupo'));
    return { roleLabels: clean && Object.keys(clean).length ? clean : null };
  });

  // --- Comentarios y sugerencias (hito 5) ---

  /** El proyecto tiene que ser de ese grupo; si no, no existe para esta ruta. */
  async function commentAccess(user: AuthenticatedUser, group: string, id: string) {
    const found = await access(user, group);
    if ((await groups.projectGroup(id)) !== group) throw PROJECT_NOT_FOUND();
    return found;
  }

  /** Avisa por el canal de que los comentarios del proyecto cambiaron (solo la referencia). */
  const announce = (
    request: { log: { warn: (o: object, m: string) => void } },
    group: string,
    id: string,
    key: string,
  ) =>
    void spaces
      .publish(group, `comentarios-${id}-${key}`, { tipo: 'comentarios', id })
      .catch(error => request.log.warn({ err: error, group }, 'No se pudo publicar en el canal del grupo'));

  app.get('/grupos/:group/proyectos/:id/comentarios', async request => {
    const user = authenticatedUser(request);
    const { group, id } = projectParams.parse(request.params);
    await commentAccess(user, group, id);
    return { comments: await comments.list(id) };
  });

  app.post('/grupos/:group/proyectos/:id/comentarios', async request => {
    const user = authenticatedUser(request);
    const { group, id } = projectParams.parse(request.params);
    const { capabilities } = await commentAccess(user, group, id);
    if (!capabilities.comment) throw FORBIDDEN();
    const body = commentSchema.parse(request.body);
    if ((await comments.list(id)).length >= MAX_COMMENTS)
      throw new HttpError(
        409,
        'demasiados_comentarios',
        'Este proyecto tiene demasiados comentarios: borra los resueltos.',
      );
    const created = await comments.create(id, {
      nodeId: body.nodeId ?? null,
      author: user.globalId,
      body: body.body,
      suggestion: body.suggestion ?? null,
    });
    announce(request, group, id, `${created.id}-nuevo`);
    return created;
  });

  // Resolver o reabrir un comentario: su autor o quien edita. Aceptar o rechazar una sugerencia: quien
  // edita (aceptarla es aplicar el cambio, que hace su navegador como cualquier edición).
  app.patch('/grupos/:group/proyectos/:id/comentarios/:comment', async request => {
    const user = authenticatedUser(request);
    const { group, id, comment } = commentParams.parse(request.params);
    const { capabilities } = await commentAccess(user, group, id);
    const { state } = stateSchema.parse(request.body);
    const current = await comments.get(id, comment);
    if (!current) throw new HttpError(404, 'comentario_no_encontrado', 'El comentario no existe.');
    const decision = state === 'aceptado' || state === 'rechazado';
    if (decision && !current.suggestion)
      throw new HttpError(400, 'no_es_sugerencia', 'Solo se aceptan o rechazan sugerencias.');
    const allowed = decision ? capabilities.edit : capabilities.edit || current.author === user.globalId;
    if (!allowed) throw FORBIDDEN();
    const updated = await comments.setState(id, comment, state as CommentState, user.globalId);
    announce(request, group, id, `${comment}-${state}-${Date.now()}`);
    return updated;
  });

  // Borrar: su autor, o quien tiene la propiedad.
  app.delete('/grupos/:group/proyectos/:id/comentarios/:comment', async request => {
    const user = authenticatedUser(request);
    const { group, id, comment } = commentParams.parse(request.params);
    const found = await commentAccess(user, group, id);
    const current = await comments.get(id, comment);
    if (!current) return { id: comment };
    if (current.author !== user.globalId && !found.capabilities.deleteGroup) throw FORBIDDEN();
    await comments.delete(id, comment);
    announce(request, group, id, `${comment}-borrado`);
    return { id: comment };
  });

  // La conversación del grupo (hito 4), para incrustar el chat. Cualquier miembro activo la pide: la
  // plataforma la crea la primera vez y decide quién escribe según su rol.
  app.post('/grupos/:group/conversacion', async request => {
    const user = authenticatedUser(request);
    const { group } = groupParams.parse(request.params);
    await access(user, group);
    try {
      return { id: await spaces.conversation(group) };
    } catch (error) {
      request.log.warn({ err: error, group }, 'No se pudo obtener la conversación del grupo');
      throw new HttpError(424, 'plataforma_no_disponible', 'La plataforma no ha podido abrir el chat del grupo.');
    }
  });

  /** Un editor no cambia el esquema: se compara con la versión de la que parte. */
  async function assertSchemaUnchanged(
    group: string,
    id: string,
    document: Record<string, unknown>,
    baseVersion: number,
  ) {
    const stored = await groups.getProject(group, id);
    // Con otra versión, la escritura dará conflicto igualmente.
    if (!stored || stored.version !== baseVersion) return;
    const changed = changedSchemaKeys(JSON.parse(stored.document) as Record<string, unknown>, document);
    if (changed.length) {
      throw new HttpError(403, 'cambio_de_esquema_no_permitido', 'Tu rol no te deja cambiar el esquema del proyecto.', {
        keys: changed,
      });
    }
  }

  // Borra el grupo. Solo quien tiene la propiedad, que elige quién se queda el proyecto (él u otro miembro activo).
  app.delete('/grupos/:group', async request => {
    const user = authenticatedUser(request);
    const { group } = groupParams.parse(request.params);
    const { capabilities } = await access(user, group);
    if (!capabilities.deleteGroup) throw FORBIDDEN();
    const recipient = deleteQuery.parse(request.query).recipient.toLowerCase();
    const member = await groups.member(group, recipient);
    if (member?.state !== 'activo') {
      throw new HttpError(400, 'receptor_no_valido', 'El proyecto solo puede quedárselo un miembro activo del grupo.');
    }
    const recipientUser = recipient === user.globalId ? user : await users.findOrCreate(recipient);
    if ((await groups.beginDelete(group, recipientUser.id)).status === 'not_found') throw NOT_FOUND();
    // El proyecto ya está entregado; si la plataforma falla, el espacio se borra en la siguiente vuelta.
    try {
      await spaces.remove(group);
      await groups.finishDelete(group);
      return { id: group, state: 'borrado' };
    } catch (error) {
      request.log.warn({ err: error, group }, 'No se pudo borrar el espacio; se reintentará');
      return { id: group, state: 'borrando' };
    }
  });
};
