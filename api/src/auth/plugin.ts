import type { FastifyRequest } from 'fastify';
import type { User, UserStore } from '../users/repository.ts';
import { type AuthProvider, AuthTokenError, type VerifiedIdentity } from './firebase.ts';

export interface AuthenticatedUser extends User {
  identity: VerifiedIdentity;
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

const TOKEN_MESSAGES: Record<string, [number, string]> = {
  token_expired: [401, 'La sesión ha caducado. Vuelve a iniciar sesión.'],
  token_revoked: [401, 'La sesión ya no es válida. Vuelve a iniciar sesión.'],
  account_disabled: [403, 'La cuenta está desactivada.'],
  invalid_token: [401, 'La sesión no es válida. Vuelve a iniciar sesión.'],
};

export function authenticatedUser(request: FastifyRequest) {
  if (!request.user) throw new Error('Ruta privada sin el hook de autenticación.');
  return request.user;
}

// Hook onRequest de las rutas privadas: Authorization: Bearer <Firebase ID token>.
export function createAuthenticate(auth: AuthProvider, users: UserStore) {
  return async function authenticate(request: FastifyRequest) {
    const match = /^Bearer\s+(\S+)$/i.exec(request.headers.authorization ?? '');
    if (!match) throw new HttpError(401, 'missing_token', 'Inicia sesión para continuar.');

    let identity: VerifiedIdentity;
    try {
      identity = await auth.verifyIdToken(match[1]);
    } catch (error) {
      if (!(error instanceof AuthTokenError)) throw error;
      const [statusCode, message] = TOKEN_MESSAGES[error.reason] ?? TOKEN_MESSAGES.invalid_token;
      throw new HttpError(statusCode, error.reason, message);
    }

    // Las cuentas de Google llegan verificadas; las de correo y contraseña deben confirmar su dirección.
    if (identity.signInProvider === 'password' && !identity.emailVerified) {
      throw new HttpError(
        403,
        'email_not_verified',
        'Verifica tu correo electrónico antes de continuar. Revisa tu bandeja de entrada.',
      );
    }

    const user = await users.upsert(identity);
    if (user.disabledAt) throw new HttpError(403, 'account_disabled', TOKEN_MESSAGES.account_disabled[1]);

    request.user = { ...user, identity };
  };
}

// Hook de las rutas públicas que se enriquecen con sesión: sin cabecera, sigue como anónimo.
export function createOptionalAuthenticate(auth: AuthProvider, users: UserStore) {
  const authenticate = createAuthenticate(auth, users);
  return async function optionalAuthenticate(request: FastifyRequest) {
    if (request.headers.authorization) await authenticate(request);
  };
}
