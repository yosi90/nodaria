import type { AppDependencies } from '../../src/app.ts';
import { type AuthProvider, AuthTokenError, type VerifiedIdentity } from '../../src/auth/firebase.ts';
import { loadConfig } from '../../src/config.ts';
import { createMemoryProjectStore } from '../../src/projects/repository.ts';
import { createMemoryRequestStore } from '../../src/requests/memory.ts';
import type { User, UserStore } from '../../src/users/repository.ts';

export const testConfig = loadConfig({
  NODE_ENV: 'test',
  CORS_ORIGINS: 'https://nodaria.yosiftware.es, http://localhost:5173',
});

export function fakeDb(query: () => Promise<unknown> = async () => ({})): AppDependencies['db'] {
  return { request: () => ({ query }) } as unknown as AppDependencies['db'];
}

export function identity(overrides: Partial<VerifiedIdentity> = {}): VerifiedIdentity {
  return {
    uid: 'uid-google',
    email: 'yosi@example.com',
    emailVerified: true,
    displayName: 'Yosi',
    photoUrl: null,
    signInProvider: 'google.com',
    authTime: new Date(),
    ...overrides,
  };
}

// Los tokens se buscan por valor; 'expired' y 'boom' simulan fallos de Firebase.
export function fakeAuth(tokens: Record<string, VerifiedIdentity>) {
  const deleted: string[] = [];
  let failDelete = false;

  const provider: AuthProvider = {
    async verifyIdToken(token) {
      if (token === 'expired') throw new AuthTokenError('token_expired');
      if (token === 'boom') throw new Error('network down');
      const found = tokens[token];
      if (!found) throw new AuthTokenError('invalid_token');
      return found;
    },
    async deleteUser(uid) {
      if (failDelete) throw new Error('firebase down');
      deleted.push(uid);
    },
  };

  return {
    provider,
    deleted,
    failNextDeletes() {
      failDelete = true;
    },
  };
}

// UserStore en memoria con el mismo contrato que el de SQL.
export function fakeUsers() {
  const byUid = new Map<string, User>();
  let nextId = 1;

  const store: UserStore = {
    async upsert(id) {
      const now = new Date();
      const existing = byUid.get(id.uid);
      const user: User = {
        id: existing?.id ?? nextId++,
        firebaseUid: id.uid,
        email: id.email,
        emailVerified: id.emailVerified,
        displayName: id.displayName,
        photoUrl: id.photoUrl,
        createdAt: existing?.createdAt ?? now,
        lastSeenAt: now,
        disabledAt: existing?.disabledAt ?? null,
      };
      byUid.set(id.uid, user);
      return user;
    },
    async delete(userId, beforeCommit) {
      await beforeCommit();
      for (const [uid, user] of byUid) if (user.id === userId) byUid.delete(uid);
    },
  };

  return { store, byUid };
}

export function testDependencies(overrides: Partial<AppDependencies> = {}): AppDependencies {
  return {
    config: testConfig,
    db: fakeDb(),
    auth: fakeAuth({}).provider,
    users: fakeUsers().store,
    projects: createMemoryProjectStore(),
    requests: createMemoryRequestStore().store,
    ...overrides,
  };
}
