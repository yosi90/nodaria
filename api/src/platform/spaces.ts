import type { FastifyBaseLogger } from 'fastify';
import type { AppConfig } from '../config.ts';
import { type PlatformSpace, ROLES } from '../groups/model.ts';
import { PlatformError, platformRequest } from './http.ts';

/*
 * Rutas de servicio de los espacios (`ecosistema-kit/ESPACIOS.md`), con la credencial de servicio de la
 * web, solo desde el backend. Invitar, aceptar y salir los hace la persona desde el frontend con el
 * token de la plataforma; aquí solo se declaran los roles y se crean y borran los espacios.
 */

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
  /**
   * La conversación del espacio en el chat de la plataforma: la crea la primera vez y después la devuelve.
   * Sus participantes los pone la plataforma según el permiso de chat de cada rol.
   */
  conversation(externalId: string): Promise<number>;
}

/**
 * Avisa por el canal del espacio de algo ya guardado, sin esperar ni fallar: si el aviso no llega, lo
 * recoge el sondeo del frontend y solo queda en el registro.
 */
export function announceInChannel(
  spaces: Pick<SpacesClient, 'publish'>,
  log: Pick<FastifyBaseLogger, 'warn'>,
  externalId: string,
  idExterno: string,
  datos: Record<string, unknown>,
) {
  void spaces
    .publish(externalId, idExterno, datos)
    .catch(error => log.warn({ err: error, group: externalId }, 'No se pudo publicar en el canal del grupo'));
}

export function createPlatformSpacesClient(config: AppConfig['platform']): SpacesClient {
  const call = (method: string, route: string, { body, account }: { body?: unknown; account?: string } = {}) =>
    platformRequest(config, method, `/v1/servicio/espacios${route}`, {
      body,
      headers: account ? { 'x-yosi-cuenta': account } : undefined,
    });

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
    async conversation(externalId) {
      const data = await call('PUT', `/${encodeURIComponent(externalId)}/conversacion`);
      return Number(data?.id);
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
