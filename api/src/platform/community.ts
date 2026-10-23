import { readFile } from 'node:fs/promises';
import type { AppConfig } from '../config.ts';
import { NEWS_KINDS } from '../community/model.ts';
import { USER_AGENT } from './feed.ts';
import { PlatformError } from './spaces.ts';

/*
 * Lo que la comunidad manda fuera desde el backend: las novedades de la persona y la moderación de los
 * proyectos públicos en la plataforma (`ecosistema-kit/NOVEDADES.md` y `MODERACION.md`, con la credencial
 * de servicio) y los avisos de denuncias a Notificapp (`plugin-kit/PROJECT_PLUGIN.md`, con la credencial
 * de emisor del plugin). El navegador nunca publica.
 */

export interface CommunityClient {
  /** Declara el catálogo de tipos de novedad. Repetirlo no cambia nada. */
  declareNewsKinds(): Promise<void>;
  /** Publica o actualiza (mismo `idExterno`). `false` si la persona tiene apagado compartirla. */
  postNews(payload: Record<string, unknown>): Promise<boolean>;
  retireNews(externalId: string): Promise<void>;
  /** Manda un aviso a Notificapp. Sin credencial de emisor todavía, `PlatformError` 503 (se reintenta). */
  notify(payload: Record<string, unknown>): Promise<void>;
  /** Los casos de moderación de la plataforma, con su escalera. */
  cases(): Promise<unknown[]>;
  /** Registra un aviso a la cuenta en la plataforma (idempotente por `idExterno`). */
  incident(body: {
    cuenta: string;
    caso: string;
    mensaje: string;
    idExterno: string;
    contexto?: string;
  }): Promise<unknown>;
}

async function readToken(file: string) {
  try {
    return (await readFile(file, 'utf8')).trim() || null;
  } catch {
    return null;
  }
}

async function send(url: string, token: string, method: string, body?: unknown) {
  const response = await fetch(url, {
    method,
    headers: {
      authorization: `Bearer ${token}`,
      accept: 'application/json',
      'user-agent': USER_AGENT,
      ...(body === undefined ? {} : { 'content-type': 'application/json' }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (response.status === 204) return null;
  const data = (await response.json().catch(() => null)) as Record<string, unknown> | null;
  if (!response.ok) {
    const code = typeof data?.code === 'string' ? data.code : typeof data?.error === 'string' ? data.error : 'error';
    const message =
      typeof data?.error === 'string'
        ? data.error
        : typeof data?.message === 'string'
          ? data.message
          : `Respondió ${response.status}.`;
    throw new PlatformError(response.status, code, message);
  }
  return data;
}

export function createCommunityClient(
  platform: AppConfig['platform'],
  notificapp: AppConfig['notificapp'],
): CommunityClient {
  async function service(method: string, route: string, body?: unknown) {
    const token = await readToken(platform.serviceTokenFile);
    if (!token) throw new PlatformError(503, 'sin_credencial', 'Falta la credencial de servicio de la plataforma.');
    return send(`${platform.api}${route}`, token, method, body);
  }

  return {
    async declareNewsKinds() {
      await service('PUT', '/v1/servicio/novedades/tipos', { tipos: NEWS_KINDS });
    },
    async postNews(payload) {
      const data = await service('POST', '/v1/servicio/novedades', payload);
      return data?.publicada !== false;
    },
    async retireNews(externalId) {
      await service('DELETE', `/v1/servicio/novedades/${encodeURIComponent(externalId)}`);
    },
    async notify(payload) {
      const token = await readToken(notificapp.senderTokenFile);
      if (!token) throw new PlatformError(503, 'sin_credencial', 'Falta la credencial de emisor de Notificapp.');
      await send(`${notificapp.api}/v1/events`, token, 'POST', payload);
    },
    async cases() {
      const data = await service('GET', '/v1/servicio/moderacion/casos');
      return Array.isArray(data?.casos) ? data.casos : [];
    },
    async incident(body) {
      return service('POST', '/v1/servicio/moderacion/incidentes', body);
    },
  };
}
