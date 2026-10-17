import type { Project } from '../domain/types';
import { ApiError, apiRequest, OfflineError, type WriteResult } from './api';
import { PLATFORM_API_URL, sdk } from './yosiftware';

/*
 * Grupos de trabajo (docs/roadmaps/ROADMAP_COLABORACION.md). Cada grupo es un espacio de la plataforma
 * con un proyecto compartido, que vive en la API de Nodaria con una sola versión. Aquí están las
 * llamadas (a la API de Nodaria y, para la pertenencia, a la de la plataforma con su token) y las
 * reglas puras de la sincronización de los compartidos, que el motor (`src/state/groups.tsx`) ejecuta.
 *
 * A diferencia de los proyectos propios, en un compartido nunca gana en silencio «el último cambio»:
 * si cambiaron los dos lados, se combinan con la versión base (`merge.ts`); si coinciden en el mismo
 * dato, gana el grupo y lo de aquí se guarda como un proyecto propio aparte. La vista del mapa
 * (`view`) es de cada persona: no cuenta como cambio y se conserva al bajar.
 */

export interface GroupCapabilities {
  read: boolean;
  edit: boolean;
  editSchema: boolean;
  deleteGroup: boolean;
}

export interface SharedProjectSummary {
  id: string;
  name: string;
  version: number;
  updatedAt: string;
  serverUpdatedAt: string;
  sizeBytes: number;
  updatedBy: string | null;
}

/** Un grupo de la cuenta tal como lo da `GET /api/grupos`. */
export interface GroupInfo {
  /** idExterno del espacio (`grupo-<uuid>`). */
  id: string;
  /** id del espacio en la plataforma (miembros, invitaciones, canal). */
  spaceId: number;
  name: string;
  owner: string | null;
  role: string;
  memberState: string;
  isOwner: boolean;
  capabilities: GroupCapabilities;
  projects: SharedProjectSummary[];
}

/** Roles que Nodaria declara en la plataforma (`api/src/groups/model.ts`). */
export const ROLE_LABELS: Record<string, string> = {
  responsable: 'Responsable',
  editor: 'Editor',
  lector: 'Lector',
};

export const ROLE_DESCRIPTIONS: Record<string, string> = {
  responsable: 'Edita todo, también el esquema, e invita y gestiona a los miembros.',
  editor: 'Edita nodos, relaciones, notas y posiciones; no cambia tipos ni atributos.',
  lector: 'Ve el proyecto y lo exporta, sin cambiarlo. Puede conversar en el grupo.',
};

export const roleLabel = (role: string) => ROLE_LABELS[role] ?? role;

// --- API de Nodaria ---

export const listGroups = (token: string) =>
  apiRequest<{ groups: GroupInfo[] }>('GET', '/api/grupos', token).then(r => r.groups);
/** Lee el feed ya (tras aceptar una invitación o cambiar un rol) y devuelve los grupos. */
export const refreshGroups = (token: string) =>
  apiRequest<{ groups: GroupInfo[] }>('POST', '/api/grupos/actualizar', token).then(r => r.groups);
export const createGroup = (token: string, id: string, name: string, document: Project) =>
  apiRequest<GroupInfo>('POST', '/api/grupos', token, { id, name, document });
export const getSharedProject = (token: string, group: string, id: string) =>
  apiRequest<SharedProjectSummary & { document: unknown }>(
    'GET',
    `/api/grupos/${encodeURIComponent(group)}/proyectos/${encodeURIComponent(id)}`,
    token,
  );
export const putSharedProject = (token: string, group: string, id: string, document: Project, baseVersion: number) =>
  apiRequest<WriteResult>(
    'PUT',
    `/api/grupos/${encodeURIComponent(group)}/proyectos/${encodeURIComponent(id)}`,
    token,
    { document, baseVersion },
  );
/** La conversación del grupo en el chat de la plataforma (la crea la primera vez). */
export const groupConversation = (token: string, group: string) =>
  apiRequest<{ id: number }>('POST', `/api/grupos/${encodeURIComponent(group)}/conversacion`, token);
export const deleteGroup = (token: string, group: string, recipient: string) =>
  apiRequest<{ id: string; state: string }>(
    'DELETE',
    `/api/grupos/${encodeURIComponent(group)}?recipient=${encodeURIComponent(recipient)}`,
    token,
  );

// --- Pertenencia, en la plataforma (`ecosistema-kit/ESPACIOS.md`), con el token de la plataforma ---

export interface SpaceMember {
  cuenta: string;
  alias: string;
  nombre: string | null;
  rol: string | null;
  propietario: boolean;
  estado: string;
}

export interface SpaceInvitation {
  id: number;
  cuenta: string | null;
  alias: string | null;
  correo: string | null;
  rol: string | null;
  caduca: string;
}

async function platformRequest<T>(method: 'GET' | 'POST' | 'PUT' | 'DELETE', path: string, body?: unknown) {
  const token = await sdk()?.tokenPlataforma?.();
  if (!token) throw new ApiError(401, 'no_autenticado', 'Tienes que entrar con tu cuenta de Yosiftware.');
  let response: Response;
  try {
    response = await fetch(`${PLATFORM_API_URL}${path}`, {
      method,
      headers: {
        authorization: `Bearer ${token}`,
        accept: 'application/json',
        ...(body === undefined ? {} : { 'content-type': 'application/json' }),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch (error) {
    throw new OfflineError(error instanceof Error ? error.message : String(error));
  }
  if (response.status === 204) return undefined as T;
  const payload = (await response.json().catch(() => null)) as Record<string, unknown> | null;
  if (!response.ok) {
    throw new ApiError(
      response.status,
      typeof payload?.code === 'string' ? payload.code : 'error',
      typeof payload?.error === 'string' ? payload.error : `Error ${response.status} de la plataforma.`,
    );
  }
  return payload as T;
}

export async function spaceMembers(spaceId: number): Promise<SpaceMember[]> {
  const found = await sdk()?.espacios?.miembros(spaceId);
  return (found ?? []) as SpaceMember[];
}
export const inviteToSpace = async (spaceId: number, email: string, role: string) => {
  const espacios = sdk()?.espacios;
  if (!espacios) throw new ApiError(503, 'sin_sdk', 'La plataforma no está disponible.');
  await espacios.invitar(spaceId, { correo: email }, role);
};
export const spaceInvitations = (spaceId: number) =>
  platformRequest<SpaceInvitation[] | { invitaciones: SpaceInvitation[] }>(
    'GET',
    `/v1/espacios/${spaceId}/invitaciones`,
  ).then(r => (Array.isArray(r) ? r : (r.invitaciones ?? [])));
export const retireInvitation = (spaceId: number, invitation: number) =>
  platformRequest<void>('DELETE', `/v1/espacios/${spaceId}/invitaciones/${invitation}`);
export const changeMemberRole = (spaceId: number, account: string, role: string) =>
  platformRequest<void>('PUT', `/v1/espacios/${spaceId}/miembros/${encodeURIComponent(account)}/rol`, { rol: role });
export const removeMember = (spaceId: number, account: string) =>
  platformRequest<void>('DELETE', `/v1/espacios/${spaceId}/miembros/${encodeURIComponent(account)}`);
export const leaveSpace = (spaceId: number) => platformRequest<void>('DELETE', `/v1/espacios/${spaceId}/miembros/yo`);
export const offerOwnership = (spaceId: number, account: string) =>
  platformRequest<void>('POST', `/v1/espacios/${spaceId}/traspaso`, { cuenta: account });

/** Mensaje en español para los errores de la plataforma y de la API de los grupos. */
export function groupErrorMessage(error: unknown): string {
  if (error instanceof OfflineError) return 'No hay conexión. Inténtalo de nuevo en un momento.';
  const code = error instanceof ApiError ? error.code : (error as { code?: string } | null)?.code;
  switch (code) {
    case 'sin_permiso_en_el_espacio':
    case 'sin_permiso_en_el_grupo':
      return 'Tu rol en el grupo no te deja hacer eso.';
    case 'ya_es_miembro':
      return 'Esa persona ya está en el grupo.';
    case 'correo_no_valido':
      return 'Ese correo no es válido.';
    case 'demasiadas_invitaciones':
      return 'Has enviado demasiadas invitaciones. Inténtalo mañana.';
    case 'propietario_no_puede_salir':
      return 'Tienes la propiedad del grupo: cédela antes de salir o borra el grupo.';
    case 'espacio_lleno':
      return 'El grupo está lleno.';
    case 'traspaso_no_valido':
      return 'No se puede ceder la propiedad a esa persona.';
    case 'creacion_limitada':
      return 'Tu cuenta tiene limitado crear contenido nuevo.';
    case 'proyecto_ya_compartido':
      return 'Este proyecto ya es de otro grupo.';
    case 'plataforma_no_disponible':
      return 'La plataforma no ha respondido. Inténtalo de nuevo en un momento.';
    case 'receptor_no_valido':
      return 'El proyecto solo puede quedárselo un miembro activo del grupo.';
    default:
      return error instanceof Error && error.message ? error.message : 'No se ha podido completar.';
  }
}

// --- Reglas de la sincronización de los compartidos ---

export const SHARED_META_KEY = 'nodaria_shared_v1';

export interface SharedEntry {
  group: string;
  /** Versión del servidor que tiene este navegador. */
  version: number;
  /** Huella del contenido de esa versión aquí (sin la vista ni la fecha): si cambia, hay cambios sin subir. */
  signature: string;
}

export interface SharedMeta {
  uid: string | null;
  projects: Record<string, SharedEntry>;
}

export const emptySharedMeta = (uid: string | null = null): SharedMeta => ({ uid, projects: {} });

export function loadSharedMeta(uid: string): SharedMeta {
  try {
    const stored = JSON.parse(localStorage.getItem(SHARED_META_KEY) ?? 'null') as SharedMeta | null;
    if (stored?.uid === uid && stored.projects && typeof stored.projects === 'object') return stored;
  } catch {
    // Sin recuerdo válido: se parte de cero.
  }
  return emptySharedMeta(uid);
}

export function saveSharedMeta(meta: SharedMeta | null) {
  try {
    if (meta) localStorage.setItem(SHARED_META_KEY, JSON.stringify(meta));
    else localStorage.removeItem(SHARED_META_KEY);
  } catch {
    // Sin almacenamiento: el recuerdo dura lo que la sesión.
  }
}

/** Ids de los compartidos que recuerda el navegador, aunque aún no se haya leído la lista de grupos. */
export function storedSharedIds(): Set<string> {
  try {
    const stored = JSON.parse(localStorage.getItem(SHARED_META_KEY) ?? 'null') as SharedMeta | null;
    return new Set(Object.keys(stored?.projects ?? {}));
  } catch {
    return new Set();
  }
}

/** Huella del contenido del proyecto: todo salvo la vista de cada persona y la fecha de cambio. */
export async function contentSignature(project: Project): Promise<string> {
  const content: Partial<Project> = { ...project };
  delete content.view;
  delete content.updatedAt;
  const bytes = new TextEncoder().encode(JSON.stringify(content));
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, '0')).join('');
}

export interface SharedPlan {
  /** Bajar la versión del grupo (nuevo aquí o cambiado allí). `keepLocal`: si difiere, guardar aparte lo de aquí. */
  download: { group: string; id: string; keepLocal: boolean }[];
  /** Cambió aquí y allí: combinar las dos versiones con la base y subir el resultado. */
  merge: { group: string; id: string }[];
  upload: { group: string; project: Project; baseVersion: number }[];
  /** Ya no es de un grupo de la cuenta (salió, la echaron o se borró): fuera de aquí, salvo cambios sin subir. */
  release: { id: string; keepLocal: boolean }[];
}

/**
 * Qué hacer con cada compartido. `signatures` son las huellas actuales de los proyectos locales que
 * ya se recuerdan como compartidos.
 */
export function planShared(
  local: Project[],
  groups: GroupInfo[],
  meta: SharedMeta,
  signatures: Record<string, string>,
): SharedPlan {
  const plan: SharedPlan = { download: [], merge: [], upload: [], release: [] };
  const localById = new Map(local.map(p => [p.id, p]));
  const remote = new Map<string, { group: GroupInfo; project: SharedProjectSummary }>();
  for (const group of groups) for (const project of group.projects) remote.set(project.id, { group, project });

  for (const [id, { group, project: R }] of remote) {
    const L = localById.get(id);
    const M = meta.projects[id];
    if (!L) {
      plan.download.push({ group: group.id, id, keepLocal: false });
      continue;
    }
    // Una copia de aquí que no se recuerda como compartida (otro dispositivo, o un JSON importado con el
    // mismo id): se baja la del grupo y, si difieren, la de aquí se queda aparte (el motor lo compara).
    if (!M || M.group !== group.id) {
      plan.download.push({ group: group.id, id, keepLocal: true });
      continue;
    }
    const remoteChanged = R.version !== M.version;
    const localChanged = group.capabilities.edit && signatures[id] !== undefined && signatures[id] !== M.signature;
    if (localChanged && !remoteChanged) plan.upload.push({ group: group.id, project: L, baseVersion: M.version });
    else if (localChanged) plan.merge.push({ group: group.id, id });
    else if (remoteChanged) plan.download.push({ group: group.id, id, keepLocal: false });
  }

  for (const [id, M] of Object.entries(meta.projects)) {
    if (remote.has(id)) continue;
    const L = localById.get(id);
    if (!L) {
      plan.release.push({ id, keepLocal: false });
      continue;
    }
    plan.release.push({ id, keepLocal: signatures[id] !== undefined && signatures[id] !== M.signature });
  }
  return plan;
}

// --- Qué deja hacer el rol con el proyecto abierto ---

/** Acciones que no cambian el proyecto compartido, o que crean otro aparte: siempre se permiten. */
const FREE_ACTIONS = new Set([
  'set-project',
  'add-project',
  'import-project',
  'duplicate-project',
  'sync-apply',
  'reset-state',
  'update-view',
  'apply-lens',
]);

/** Acciones que cambian el esquema (tipos, atributos, preformas, parentesco, calendario, tipo de proyecto). */
export const SCHEMA_ACTIONS = new Set([
  'set-project-kind',
  'merge-template',
  'add-schema',
  'update-schema',
  'delete-schema',
  'move-schema',
  'reorder-schema',
  'add-schema-folder',
  'rename-schema-folder',
  'delete-schema-folder',
  'set-schema-folder',
  'duplicate-schema',
  'add-field',
  'delete-field',
  'share-field',
  'add-library-field',
  'update-library-field',
  'delete-library-field',
  'reorder-library',
  'link-field',
  'unlink-field',
  'update-kinship',
  'update-calendar',
  'set-field-sql',
  'set-column-sql',
  'apply-sql-annotations',
  'apply-ai-proposal',
]);

/** Por qué el rol no deja hacer la acción en el compartido, o `null` si la deja. */
export function blockedReason(actionType: string, group: GroupInfo): string | null {
  if (FREE_ACTIONS.has(actionType)) return null;
  if (actionType === 'delete-project') {
    return group.isOwner
      ? 'Este proyecto es del grupo. Para quitarlo, borra el grupo desde «Grupo…».'
      : 'Este proyecto es del grupo. Para dejarlo, sal del grupo desde «Grupo…».';
  }
  if (!group.capabilities.edit)
    return `Tu rol en el grupo (${roleLabel(group.role)}) solo te deja ver este proyecto. Duplícalo para tener tu propia copia.`;
  if (!group.capabilities.editSchema && SCHEMA_ACTIONS.has(actionType))
    return `Tu rol en el grupo (${roleLabel(group.role)}) no te deja cambiar el esquema: tipos, atributos y preformas.`;
  return null;
}
