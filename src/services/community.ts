import type { PublicationOptions } from '../domain/publication';
import type { Project } from '../domain/types';
import { ApiError, apiRequest, OfflineError } from './api';
import { PLATFORM_API_URL, sdk } from './yosiftware';

/*
 * La comunidad (docs/roadmaps/ROADMAP_COMUNIDAD.md). Los proyectos públicos son de Nodaria (su API); las
 * personas, el feed de novedades, los «me gusta» y los comentarios son de la plataforma y se leen con el
 * token de la plataforma (`ecosistema-kit/SOCIAL.md` y `NOVEDADES.md`). El navegador nunca publica
 * novedades: lo hace la API de Nodaria al publicar.
 */

/** Un proyecto público como lo ve cualquiera (sin el proyecto privado del que sale). */
export interface PublicSummary {
  id: string;
  /** Id global de la cuenta que lo publicó. */
  author: string;
  name: string;
  description: string;
  allowCopy: boolean;
  state: 'publico' | 'retirado';
  nodeCount: number;
  relationCount: number;
  sizeBytes: number;
  version: number;
  publishedAt: string;
  updatedAt: string;
}

export interface PublicProject extends PublicSummary {
  document: Project;
}

/** La publicación propia de un proyecto. */
export interface OwnPublication extends PublicSummary {
  projectId: string;
  options: PublicationOptions;
  retiredReason: string | null;
  url: string;
}

/** La publicación del proyecto, o `null` si no está publicado. */
export const getPublication = (token: string, projectId: string) =>
  apiRequest<{ publicacion: OwnPublication | null }>(
    'GET',
    `/api/projects/${encodeURIComponent(projectId)}/publicacion`,
    token,
  ).then(r => r.publicacion);

export const publishProject = (
  token: string,
  document: Project,
  body: { description: string; options: PublicationOptions; allowCopy: boolean },
) =>
  apiRequest<OwnPublication>('PUT', `/api/projects/${encodeURIComponent(document.id)}/publicacion`, token, {
    document,
    ...body,
  });

export const unpublishProject = (token: string, projectId: string) =>
  apiRequest<{ id: string }>('DELETE', `/api/projects/${encodeURIComponent(projectId)}/publicacion`, token);

export const myPublications = (token: string) =>
  apiRequest<{ publicaciones: OwnPublication[] }>('GET', '/api/publicaciones', token).then(r => r.publicaciones);

/** Sin sesión: la página pública se puede abrir con el enlace. */
export const fetchPublic = (publicId: string) =>
  apiRequest<PublicProject>('GET', `/api/publicos/${encodeURIComponent(publicId)}`, null);

export const listPublic = (author?: string) =>
  apiRequest<{ publicos: PublicSummary[] }>('GET', `/api/publicos${author ? `?cuenta=${author}` : ''}`, null).then(
    r => r.publicos,
  );

export const REPORT_REASONS = {
  spam: 'Publicidad o spam',
  ofensivo: 'Contenido ofensivo o que incita al odio',
  datos_personales: 'Datos personales de otras personas',
  derechos: 'Contenido de otra persona sin permiso',
  ilegal: 'Contenido ilegal o peligroso',
  otro: 'Otro motivo',
} as const;
export type ReportReason = keyof typeof REPORT_REASONS;

export const reportPublic = (token: string, publicId: string, motivo: ReportReason, texto: string) =>
  apiRequest<{ id: number }>('POST', `/api/publicos/${encodeURIComponent(publicId)}/denuncias`, token, {
    motivo,
    texto,
  });

/** Por qué no se ha podido publicar, para la persona. */
export function publishErrorMessage(error: unknown) {
  if (error instanceof OfflineError) return 'No hay conexión con Nodaria. Inténtalo de nuevo en un momento.';
  if (error instanceof ApiError) {
    if (error.code === 'publicacion_limitada' || error.code === 'creacion_limitada')
      return 'Tu cuenta tiene limitado publicar contenido por moderación.';
    if (error.code === 'normas_pendientes') return 'Acepta las normas de Nodaria para publicar.';
    if (error.code === 'project_too_large') return 'El proyecto es demasiado grande para publicarlo (más de 20 MB).';
    return error.message;
  }
  return 'No se ha podido publicar. Inténtalo de nuevo.';
}

/** Dirección de la página pública de un proyecto. */
export const publicPath = (publicId: string) => `/p/${publicId}`;

/** El id público de la dirección actual (`/p/<id>`), o `null` si no es una página pública. */
export function publicIdFromPath(pathname: string) {
  return /^\/p\/([A-Za-z0-9_-]{12})\/?$/.exec(pathname)?.[1] ?? null;
}

// --- La plataforma: personas, novedades y relaciones ---

/** Una persona como la dan las rutas de la plataforma; `nombre` es `null` si su perfil es privado. */
export interface Person {
  id: string;
  alias: string;
  nombre: string | null;
  privado: boolean;
  avatar: { url: string; miniatura: string; version?: number } | null;
  biografia?: string | null;
  borrada?: boolean;
}

export interface NewsItem {
  id: number;
  tipo: { clave: string; nombre: string };
  persona: Person;
  texto: string;
  enlace: string | null;
  imagen: string | null;
  creada: string;
  actualizada: string;
  meGusta: { total: number; propio: boolean };
  comentarios: number;
  relacion: 'propia' | 'amistad' | 'seguida' | 'ninguna';
}

export interface NewsComment {
  id: number;
  persona: Person;
  texto: string;
  creado: string;
  propio: boolean;
}

export interface Relationship {
  amistad: 'ninguna' | 'solicitud_enviada' | 'solicitud_recibida' | 'amistades';
  sigo: boolean;
  meSigue: boolean;
  bloqueada: boolean;
}

/** Error de la plataforma en su formato común (`error`, `code`). `persona_no_encontrada` es «no hay nadie». */
export class PlatformRequestError extends Error {
  readonly status: number;
  readonly code: string;
  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

async function platform<T>(method: 'GET' | 'PUT' | 'POST' | 'DELETE', path: string, body?: unknown): Promise<T> {
  const token = await sdk()?.tokenPlataforma?.();
  if (!token) throw new PlatformRequestError(401, 'sin_sesion', 'Entra con tu cuenta de Yosiftware.');
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
  const data = (await response.json().catch(() => null)) as Record<string, unknown> | null;
  if (!response.ok) {
    throw new PlatformRequestError(
      response.status,
      typeof data?.code === 'string' ? data.code : 'error',
      typeof data?.error === 'string' ? data.error : `La plataforma respondió ${response.status}.`,
    );
  }
  return data as T;
}

const page = (cursor: string | null) => (cursor ? `?cursor=${encodeURIComponent(cursor)}` : '');

function withAvatars<T extends { novedades: NewsItem[] }>(result: T): T {
  return {
    ...result,
    novedades: result.novedades.map(n => ({
      ...n,
      persona: { ...n.persona, avatar: absoluteAvatar(n.persona.avatar) },
    })),
  };
}

/** Las novedades de Nodaria de mis amistades y de quienes sigo. */
export const followingFeed = (cursor: string | null = null) =>
  platform<{ novedades: NewsItem[]; cursor: string | null }>('GET', `/v1/novedades${page(cursor)}`).then(withAvatars);

export const discoverFeed = () =>
  platform<{ novedades: NewsItem[] }>('GET', '/v1/novedades/descubrir').then(withAvatars);

export const personNews = (id: string, cursor: string | null = null) =>
  platform<{ novedades: NewsItem[]; cursor: string | null; reservadas: boolean }>(
    'GET',
    `/v1/personas/${encodeURIComponent(id)}/novedades${page(cursor)}`,
  ).then(withAvatars);

export const setLike = (newsId: number, like: boolean) =>
  platform<void>(like ? 'PUT' : 'DELETE', `/v1/novedades/${newsId}/me-gusta`);

export const newsComments = (newsId: number) =>
  platform<{ comentarios: NewsComment[]; cursor: string | null }>('GET', `/v1/novedades/${newsId}/comentarios`).then(
    result => ({
      ...result,
      comentarios: result.comentarios.map(c => ({
        ...c,
        persona: { ...c.persona, avatar: absoluteAvatar(c.persona.avatar) },
      })),
    }),
  );

export const addComment = (newsId: number, texto: string) =>
  platform<NewsComment>('POST', `/v1/novedades/${newsId}/comentarios`, { texto });

export const deleteComment = (newsId: number, commentId: number) =>
  platform<void>('DELETE', `/v1/novedades/${newsId}/comentarios/${commentId}`);

/** El perfil público de una cuenta; `null` si no hay nadie (no existe, está suspendida o hay un bloqueo). */
export async function personProfile(id: string): Promise<Person | null> {
  try {
    const profile = await platform<Person>('GET', `/v1/perfiles/${encodeURIComponent(id)}`);
    return { ...profile, avatar: absoluteAvatar(profile.avatar) };
  } catch (error) {
    if (error instanceof PlatformRequestError && error.status === 404) return null;
    throw error;
  }
}

export async function relationship(id: string): Promise<Relationship | null> {
  try {
    return await platform<Relationship>('GET', `/v1/personas/${encodeURIComponent(id)}/relacion`);
  } catch (error) {
    if (error instanceof PlatformRequestError && (error.status === 404 || error.code === 'relacion_consigo_mismo'))
      return null;
    throw error;
  }
}

export const setFollowing = (id: string, follow: boolean) =>
  platform<void>(follow ? 'PUT' : 'DELETE', `/v1/social/seguidos/${encodeURIComponent(id)}`);

/** Las direcciones del avatar llegan relativas a la API de la plataforma. */
export function absoluteAvatar(avatar: Person['avatar']): Person['avatar'] {
  if (!avatar) return null;
  const full = (url: string) => (/^https?:/.test(url) ? url : `${PLATFORM_API_URL}${url}`);
  return { ...avatar, url: full(avatar.url), miniatura: full(avatar.miniatura) };
}

/** Cómo se llama a una persona: su nombre o, con el perfil privado, `@alias`. */
export const personName = (person: Pick<Person, 'alias' | 'nombre'>) => person.nombre || `@${person.alias}`;

/** La dirección de una novedad, si es una página pública de esta misma web: se abre aquí. */
export function localPublicLink(link: string | null) {
  if (!link) return null;
  try {
    const url = new URL(link);
    return url.origin === window.location.origin ? publicIdFromPath(url.pathname) : null;
  } catch {
    return null;
  }
}
