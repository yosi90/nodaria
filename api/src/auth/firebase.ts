import { applicationDefault, getApps, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import type { AppConfig } from '../config.ts';

// Lo que la API necesita saber de quien llama, a partir de un ID token de Firebase verificado.
export interface VerifiedIdentity {
  uid: string;
  email: string | null;
  emailVerified: boolean;
  displayName: string | null;
  photoUrl: string | null;
  signInProvider: string;
  authTime: Date;
}

export interface AuthProvider {
  verifyIdToken(token: string): Promise<VerifiedIdentity>;
  deleteUser(uid: string): Promise<void>;
}

// Errores de token que significan «no está autenticado», no «el servidor falló».
const UNAUTHENTICATED_CODES = new Map([
  ['auth/id-token-expired', 'token_expired'],
  ['auth/id-token-revoked', 'token_revoked'],
  ['auth/user-disabled', 'account_disabled'],
  ['auth/user-not-found', 'invalid_token'],
  ['auth/argument-error', 'invalid_token'],
  ['auth/invalid-id-token', 'invalid_token'],
]);

export class AuthTokenError extends Error {
  readonly reason: string;

  constructor(reason: string) {
    super(reason);
    this.reason = reason;
  }
}

export function createFirebaseAuthProvider(config: Pick<AppConfig, 'firebaseProjectId'>): AuthProvider {
  // GOOGLE_APPLICATION_CREDENTIALS apunta applicationDefault() a la cuenta de servicio.
  // Con FIREBASE_AUTH_EMULATOR_HOST, firebase-admin habla con el emulador local.
  const app =
    getApps()[0] ??
    initializeApp({
      projectId: config.firebaseProjectId,
      ...(process.env.FIREBASE_AUTH_EMULATOR_HOST ? {} : { credential: applicationDefault() }),
    });
  const auth = getAuth(app);

  return {
    async verifyIdToken(token) {
      try {
        // checkRevoked rechaza también cuentas desactivadas o borradas.
        const decoded = await auth.verifyIdToken(token, true);
        return {
          uid: decoded.uid,
          email: decoded.email ?? null,
          emailVerified: decoded.email_verified ?? false,
          displayName: typeof decoded.name === 'string' ? decoded.name : null,
          photoUrl: decoded.picture ?? null,
          signInProvider: decoded.firebase.sign_in_provider,
          authTime: new Date(decoded.auth_time * 1000),
        };
      } catch (error) {
        const reason = UNAUTHENTICATED_CODES.get((error as { code?: string }).code ?? '');
        if (reason) throw new AuthTokenError(reason);
        throw error;
      }
    },

    async deleteUser(uid) {
      try {
        await auth.deleteUser(uid);
      } catch (error) {
        if ((error as { code?: string }).code !== 'auth/user-not-found') throw error;
      }
    },
  };
}
