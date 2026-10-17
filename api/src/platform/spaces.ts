import { readFile } from 'node:fs/promises';
import type { AppConfig } from '../config.ts';
import { type PlatformSpace, ROLES } from '../groups/model.ts';
import { USER_AGENT } from './feed.ts';

/*
 * Rutas de servicio de los espacios (`ecosistema-kit/ESPACIOS.md`), con la credencial de servicio de la
 * web, solo desde el backend. Invitar, aceptar y salir los hace la persona desde el frontend con el
 * token de la plataforma; aquí solo se declaran los roles y se crean y borran los espacios.
 */

/** Error de la plataforma en su formato común (`code`, `error`). */
export class PlatformError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export interface SpaceCreation {
  idExterno: string;
  nombre: string;
  rol: string;
}

export interface SpacesClient {
  declareRoles(): Promise<void>;
  /** Crea el espacio a nombre de la cuenta, que tiene su propiedad. Repetirlo devuelve el que hay. */
  create(globalId: string, space: SpaceCreation): Promise<PlatformSpace>;
  /** Borra el espacio. Borrar uno que ya no existe no es un error. */
  remove(externalId: string): Promise<void>;
  /**
   * Publica en el canal del espacio algo que ya está guardado (hasta 16 KB, opaco para la plataforma).
   * Repetirlo con el mismo `idExterno` no lo duplica.
   */
  publish(externalId: string, idExterno: string, datos: Record<string, unknown>): Promise<void>;
}

export function createPlatformSpacesClient(config: AppConfig['platform']): SpacesClient {
  async function call(method: string, route: string, { body, account }: { body?: unknown; account?: string } = {}) {
    const token = (await readFile(config.serviceTokenFile, 'utf8')).trim();
    const response = await fetch(`${config.api}/v1/servicio/espacios${route}`, {
      method,
      headers: {
        authorization: `Bearer ${token}`,
        accept: 'application/json',
        'user-agent': USER_AGENT,
        ...(body === undefined ? {} : { 'content-type': 'application/json' }),
        ...(account ? { 'x-yosi-cuenta': account } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    if (response.status === 204) return null;
    const data = (await response.json().catch(() => null)) as Record<string, unknown> | null;
    if (!response.ok) {
      const code = typeof data?.code === 'string' ? data.code : 'error';
      const message = typeof data?.error === 'string' ? data.error : `La plataforma respondió ${response.status}.`;
      throw new PlatformError(response.status, code, message);
    }
    return data;
  }

  return {
    async declareRoles() {
      await call('PUT', '/roles', { body: { roles: ROLES } });
    },
    async create(globalId, space) {
      const data = await call('POST', '', {
        account: globalId,
        body: { ...space, entrada: 'invitacion', dosPasos: false },
      });
      return {
        id: Number(data?.id),
        idExterno: String(data?.idExterno ?? space.idExterno),
        nombre: String(data?.nombre ?? space.nombre),
        entrada: String(data?.entrada ?? 'invitacion'),
        dosPasos: data?.dosPasos === true,
        propietario: typeof data?.propietario === 'string' ? data.propietario.toLowerCase() : globalId,
      };
    },
    async publish(externalId, idExterno, datos) {
      await call('POST', `/${encodeURIComponent(externalId)}/canal`, { body: { idExterno, datos } });
    },
    async remove(externalId) {
      try {
        await call('DELETE', `/${encodeURIComponent(externalId)}`);
      } catch (error) {
        if (error instanceof PlatformError && error.status === 404) return;
        throw error;
      }
    },
  };
}
