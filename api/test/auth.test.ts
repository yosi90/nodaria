import { describe, expect, it } from 'vitest';
import { buildApp, USER_RATE_LIMIT } from '../src/app.ts';
import { RECENT_LOGIN_MS } from '../src/routes/me.ts';
import { fakeAuth, fakeUsers, identity, testConfig, testDependencies } from './helpers/fakes.ts';

const google = identity();
const verifiedPassword = identity({ uid: 'uid-pass', signInProvider: 'password', emailVerified: true });
const unverifiedPassword = identity({ uid: 'uid-new', signInProvider: 'password', emailVerified: false });
const oldLogin = identity({ uid: 'uid-old', authTime: new Date(Date.now() - RECENT_LOGIN_MS - 1000) });

async function setup() {
  const auth = fakeAuth({ google, pass: verifiedPassword, unverified: unverifiedPassword, old: oldLogin });
  const users = fakeUsers();
  const app = await buildApp(testDependencies({ auth: auth.provider, users: users.store }));
  const call = (method: 'GET' | 'DELETE', token?: string) =>
    app.inject({ method, url: '/api/me', headers: token ? { authorization: `Bearer ${token}` } : {} });
  return { app, auth, users, call };
}

describe('authentication', () => {
  it('requires a bearer token', async () => {
    const { call } = await setup();
    const response = await call('GET');

    expect(response.statusCode).toBe(401);
    expect(response.json()).toMatchObject({ error: 'missing_token', message: 'Inicia sesión para continuar.' });
  });

  it('rejects invalid and expired tokens with distinct codes', async () => {
    const { call } = await setup();

    expect((await call('GET', 'nope')).json()).toMatchObject({ error: 'invalid_token' });
    const expired = await call('GET', 'expired');
    expect(expired.statusCode).toBe(401);
    expect(expired.json()).toMatchObject({ error: 'token_expired' });
  });

  it('treats unexpected verifier failures as server errors', async () => {
    const { call } = await setup();
    const response = await call('GET', 'boom');

    expect(response.statusCode).toBe(500);
    expect(response.json()).toEqual({ error: 'internal_error', message: 'Error interno del servidor.' });
  });

  it('blocks unverified email/password accounts without creating them', async () => {
    const { call, users } = await setup();
    const response = await call('GET', 'unverified');

    expect(response.statusCode).toBe(403);
    expect(response.json()).toMatchObject({ error: 'email_not_verified' });
    expect(users.byUid.has('uid-new')).toBe(false);
  });

  it('accepts verified email/password accounts', async () => {
    const { call } = await setup();
    const response = await call('GET', 'pass');

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ signInProvider: 'password', emailVerified: true });
  });

  it('rejects users disabled in the database', async () => {
    const { call, users } = await setup();
    await call('GET', 'google');
    users.byUid.get('uid-google')!.disabledAt = new Date();

    const response = await call('GET', 'google');
    expect(response.statusCode).toBe(403);
    expect(response.json()).toMatchObject({ error: 'account_disabled' });
  });

  it('limits requests per signed-in user', async () => {
    const { call } = await setup();
    for (let i = 0; i < USER_RATE_LIMIT; i++) expect((await call('GET', 'google')).statusCode).toBe(200);

    const limited = await call('GET', 'google');
    expect(limited.statusCode).toBe(429);
    expect(limited.json()).toMatchObject({ error: 'too_many_requests' });
    // Otro usuario conserva su propio presupuesto.
    expect((await call('GET', 'pass')).statusCode).toBe(200);
  });
});

describe('GET /api/me', () => {
  it('creates the user on first request and reuses it afterwards', async () => {
    const { call, users } = await setup();
    const first = await call('GET', 'google');
    const second = await call('GET', 'google');

    expect(first.statusCode).toBe(200);
    expect(first.json()).toMatchObject({
      id: 1,
      email: 'yosi@example.com',
      emailVerified: true,
      displayName: 'Yosi',
      signInProvider: 'google.com',
    });
    expect(second.json().id).toBe(1);
    expect(users.byUid.size).toBe(1);
  });

  it('flags only the owner accounts to exclude from stats', async () => {
    const auth = fakeAuth({ google, pass: verifiedPassword });
    const config = { ...testConfig, ownerFirebaseUids: [google.uid] };
    const app = await buildApp(testDependencies({ config, auth: auth.provider, users: fakeUsers().store }));
    const me = (token: string) =>
      app.inject({ method: 'GET', url: '/api/me', headers: { authorization: `Bearer ${token}` } });

    const owner = (await me('google')).json();
    expect(owner.excludeFromStats).toBe(true);
    expect(JSON.stringify(owner)).not.toContain('ownerFirebaseUids');
    expect((await me('pass')).json().excludeFromStats).toBe(false);
  });
});

describe('DELETE /api/me', () => {
  it('deletes the local user and the Firebase account', async () => {
    const { call, users, auth } = await setup();
    await call('GET', 'google');

    const response = await call('DELETE', 'google');
    expect(response.statusCode).toBe(204);
    expect(users.byUid.size).toBe(0);
    expect(auth.deleted).toEqual(['uid-google']);
  });

  it('requires a recent sign-in', async () => {
    const { call, users, auth } = await setup();
    const response = await call('DELETE', 'old');

    expect(response.statusCode).toBe(403);
    expect(response.json()).toMatchObject({ error: 'recent_login_required' });
    expect(users.byUid.has('uid-old')).toBe(true);
    expect(auth.deleted).toEqual([]);
  });

  it('keeps the data when Firebase cannot delete the account', async () => {
    const { call, users, auth } = await setup();
    auth.failNextDeletes();

    const response = await call('DELETE', 'google');
    expect(response.statusCode).toBe(500);
    expect(users.byUid.has('uid-google')).toBe(true);
  });
});
