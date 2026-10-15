import type { FastifyRequest } from 'fastify';
import type { User, UserStore } from '../users/repository.ts';
import { type AuthProvider, AuthTokenError, type PlatformIdentity } from './platform.ts';

export interface AuthenticatedUser extends User {
  identity: PlatformIdentity;
}

declare module 'fastify' {
  interface FastifyRequest {
    user: AuthenticatedUser | null;
  }
}

export class HttpError extends Error {
  readonly statusCode: number;
  readonly code: string;
  /** Datos extra que viajan en la respuesta junto a `error` y `message`. */
  readonly details: Record<string, unknown> | undefined;

  constructor(statusCode: number, code: string, message: string, details?: Record<string, unknown>) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
  }
}

const TOKEN_MESSAGES: Record<AuthTokenError['reason'], string> = {
  token_expired: 'Tu acceso ha caducado. Vuelve a intentarlo.',
  invalid_token: 'Tienes que iniciar sesión con tu cuenta de Yosiftware.',
};

export function authenticatedUser(request: FastifyRequest) {
  if (!request.user) throw new Error('Ruta privada sin el hook de autenticación.');
  return request.user;
}

/** Rutas que no exigen haber aceptado las normas de la web (para poder consultar el estado). */
const WITHOUT_RULES = new Set(['/api/me']);

// Hook onRequest de las rutas privadas: Authorization: Bearer <token de la plataforma>.
export function createAuthenticate(auth: AuthProvider, users: UserStore) {
  return async function authenticate(request: FastifyRequest) {
    const match = /^Bearer\s+(\S+)$/i.exec(request.headers.authorization ?? '');
    if (!match) throw new HttpError(401, 'no_autenticado', TOKEN_MESSAGES.invalid_token);

    let identity: PlatformIdentity;
    try {
      identity = await auth.verify(match[1]);
    } catch (error) {
      if (!(error instanceof AuthTokenError)) throw error;
      throw new HttpError(
        401,
        error.reason === 'token_expired' ? 'token_caducado' : 'no_autenticado',
        TOKEN_MESSAGES[error.reason],
      );
    }

    const user = await users.findOrCreate(identity.globalId);
    if (user.disabledAt) throw new HttpError(403, 'cuenta_desactivada', 'La cuenta está desactivada en Nodaria.');
    if (user.closedAt) {
      throw new HttpError(
        403,
        'cuenta_cerrada',
        'La cuenta está cerrada. Puedes recuperarla desde tu cuenta de Yosiftware.',
      );
    }
    if (identity.rulesPending && !WITHOUT_RULES.has(request.routeOptions.url ?? '')) {
      throw new HttpError(403, 'normas_pendientes', 'Acepta las normas de Nodaria para continuar.');
    }

    request.user = { ...user, identity };
  };
}

/** Con `creacion` limitada por moderación no se crea contenido nuevo (`ecosistema-kit/MODERACION.md`). */
export function assertCanCreate(user: AuthenticatedUser) {
  if (!user.identity.restrictions.includes('creacion')) return;
  throw new HttpError(403, 'creacion_limitada', 'Tu cuenta tiene limitado crear contenido nuevo.', {
    hasta: user.identity.restrictionsUntil?.toISOString() ?? null,
  });
}
