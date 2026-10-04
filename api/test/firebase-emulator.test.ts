import { getAuth } from 'firebase-admin/auth';
import { beforeAll, describe, expect, it } from 'vitest';
import { type AuthProvider, AuthTokenError, createFirebaseAuthProvider } from '../src/auth/firebase.ts';

// Corre contra el emulador de Firebase Auth: `npm run test:emulator`.
const emulatorHost = process.env.FIREBASE_AUTH_EMULATOR_HOST;

async function identityToolkit(action: string, body: object) {
  const response = await fetch(`http://${emulatorHost}/identitytoolkit.googleapis.com/v1/accounts:${action}?key=fake`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ ...body, returnSecureToken: true }),
  });
  const json = (await response.json()) as { idToken: string; localId: string };
  if (!response.ok) throw new Error(JSON.stringify(json));
  return json;
}

const signUp = (email: string) => identityToolkit('signUp', { email, password: 'secreto123' });
const signIn = (email: string) => identityToolkit('signInWithPassword', { email, password: 'secreto123' });

async function reason(promise: Promise<unknown>) {
  const error = await promise.then(
    () => null,
    (caught: unknown) => caught,
  );
  return error instanceof AuthTokenError ? error.reason : error;
}

describe.runIf(emulatorHost)('Firebase Auth provider against the emulator', () => {
  let auth: AuthProvider;

  beforeAll(() => {
    auth = createFirebaseAuthProvider({ firebaseProjectId: process.env.GCLOUD_PROJECT ?? 'demo-nodaria' });
  });

  it('maps a real email/password token, verified or not', async () => {
    const email = `nuevo-${Date.now()}@example.com`;
    const { idToken, localId } = await signUp(email);

    expect(await auth.verifyIdToken(idToken)).toMatchObject({
      uid: localId,
      email,
      emailVerified: false,
      signInProvider: 'password',
    });

    await getAuth().updateUser(localId, { emailVerified: true });
    const verified = await auth.verifyIdToken((await signIn(email)).idToken);
    expect(verified.emailVerified).toBe(true);
    expect(Math.abs(verified.authTime.getTime() - Date.now())).toBeLessThan(60_000);
  });

  it('rejects garbage, revoked and deleted-user tokens as unauthenticated', async () => {
    expect(await reason(auth.verifyIdToken('not-a-token'))).toBe('invalid_token');

    const email = `revocado-${Date.now()}@example.com`;
    const { idToken, localId } = await signUp(email);
    // La revocación tiene resolución de un segundo: el token debe ser anterior.
    await new Promise(resolve => setTimeout(resolve, 1100));
    await getAuth().revokeRefreshTokens(localId);
    expect(await reason(auth.verifyIdToken(idToken))).toBe('token_revoked');

    const fresh = (await signIn(email)).idToken;
    await auth.deleteUser(localId);
    expect(await reason(auth.verifyIdToken(fresh))).toBe('invalid_token');
    // Borrar una cuenta que ya no existe no es un error.
    await expect(auth.deleteUser(localId)).resolves.toBeUndefined();
  });

  it('rejects disabled accounts', async () => {
    const { idToken, localId } = await signUp(`desactivado-${Date.now()}@example.com`);
    await getAuth().updateUser(localId, { disabled: true });

    expect(await reason(auth.verifyIdToken(idToken))).toBe('account_disabled');
  });
});
