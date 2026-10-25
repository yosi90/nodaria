import type { AppConfig } from '../config.ts';
import { crearVerificador, TokenCaducado, TokenNoValido, type DatosDelToken } from './yosiftware-tokens.mjs';

/*
 * Tokens de la plataforma Yosiftware (`ecosistema-kit/VALIDAR_TOKENS.md`). Se validan en local con la
 * implementación de referencia del kit: ES256, emisor del entorno, audiencia `nodaria-api` y caducidad.
 */

/** Quién llama, según un token de la plataforma ya validado. */
export interface PlatformIdentity {
  /** Identificador de la cuenta en todo el ecosistema (`sub`), en minúsculas. */
  globalId: string;
  /** Alcances limitados por moderación (`comunidad`, `chat`, `publicacion`, `creacion`). */
  restrictions: string[];
  /** Hasta cuándo dura lo limitado; `null` si es permanente o no hay nada. */
  restrictionsUntil: Date | null;
  /** No ha aceptado las normas propias vigentes de la web. */
  rulesPending: boolean;
}

export class AuthTokenError extends Error {
  readonly reason: 'token_expired' | 'invalid_token';

  constructor(reason: 'token_expired' | 'invalid_token', options?: ErrorOptions) {
    super(reason, options);
    this.reason = reason;
  }
}

export interface AuthProvider {
  verify(token: string): Promise<PlatformIdentity>;
}

/** El `sub` es un GUID de SQL Server: se valida el formato GUID, no el de un UUID del RFC 4122. */
export const GUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function identityFromClaims(claims: DatosDelToken): PlatformIdentity {
  if (!GUID.test(claims.sub)) throw new AuthTokenError('invalid_token');
  const raw = (claims as { restricciones?: unknown }).restricciones;
  const until = (claims as { restriccionesHasta?: unknown }).restriccionesHasta;
  return {
    globalId: claims.sub.toLowerCase(),
    restrictions: Array.isArray(raw) ? raw.filter((r): r is string => typeof r === 'string') : [],
    restrictionsUntil: typeof until === 'number' ? new Date(until * 1000) : null,
    rulesPending: (claims as { normasPendientes?: unknown }).normasPendientes === true,
  };
}

export function createPlatformAuthProvider(config: Pick<AppConfig, 'platform'>): AuthProvider {
  const verify = crearVerificador({ entorno: config.platform.env, audiencia: config.platform.audience });
  return {
    async verify(token) {
      try {
        return identityFromClaims(await verify(token));
      } catch (error) {
        if (error instanceof TokenCaducado) throw new AuthTokenError('token_expired', { cause: error });
        if (error instanceof TokenNoValido) throw new AuthTokenError('invalid_token', { cause: error });
        throw error;
      }
    },
  };
}
