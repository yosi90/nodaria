import { createLocalJWKSet, exportJWK, generateKeyPair, SignJWT, type JWTPayload } from 'jose';
import type { AppDependencies } from '../../src/app.ts';
import { AuthTokenError, identityFromClaims, type AuthProvider } from '../../src/auth/platform.ts';
import { TokenCaducado, TokenNoValido, crearVerificador } from '../../src/auth/yosiftware-tokens.mjs';
import { loadConfig } from '../../src/config.ts';
import { createMemoryConversationStore } from '../../src/ai/conversations.ts';
import { createMemoryGroupStore } from '../../src/groups/repository.ts';
import { createMemoryCommentStore } from '../../src/groups/comments.ts';
import { createMemoryCommunityStore } from '../../src/community/repository.ts';
import type { CommunityClient } from '../../src/platform/community.ts';
import type { PlatformSpace } from '../../src/groups/model.ts';
import { PlatformError } from '../../src/platform/http.ts';
import type { SpacesClient } from '../../src/platform/spaces.ts';
import { createMemoryProjectStore, type ProjectStore } from '../../src/projects/repository.ts';
import type { User, UserStore } from '../../src/users/repository.ts';

export const testConfig = loadConfig({
  NODE_ENV: 'test',
  CORS_ORIGINS: 'https://nodaria.yosiftware.es, https://nodaria.dev.yosiftware.es',
});

export const ISSUER = 'https://qa-cuentas-api.yosiftware.es';
export const OWNER = '7042db67-5cc3-f111-8c4b-002315ef7116';
export const OTHER = '6b89e190-60c3-f111-8c4b-002315ef7116';

export function fakeDb(query: () => Promise<unknown> = async () => ({})): AppDependencies['db'] {
  return { request: () => ({ query }) } as unknown as AppDependencies['db'];
}

/**
 * Tokens como los de la plataforma, firmados con una clave ES256 de prueba, y un AuthProvider con
 * el validador de referencia del kit apuntando a esa clave: se prueba la validación real.
 */
export async function platformTokens() {
  const { privateKey, publicKey } = await generateKeyPair('ES256');
  const jwk = { ...(await exportJWK(publicKey)), kid: 'prueba', alg: 'ES256' };
  const verify = crearVerificador({
    emisor: ISSUER,
    audiencia: 'nodaria-api',
    claves: createLocalJWKSet({ keys: [jwk] }),
  });
  const provider: AuthProvider = {
    async verify(token) {
      try {
        return identityFromClaims(await verify(token));
      } catch (error) {
        if (error instanceof TokenCaducado) throw new AuthTokenError('token_expired');
        if (error instanceof TokenNoValido) throw new AuthTokenError('invalid_token');
        throw error;
      }
    },
  };
  async function sign(
    claims: JWTPayload & { sub?: string } = {},
    {
      audience = 'nodaria-api',
      issuer = ISSUER,
      expiresIn = '10m',
    }: { audience?: string; issuer?: string; expiresIn?: string | number } = {},
  ) {
    return new SignJWT({ sid: 'sesion-1', azp: 'nodaria', sv: 1, alias: 'yosi', ...claims })
      .setProtectedHeader({ alg: 'ES256', kid: 'prueba' })
      .setSubject(claims.sub ?? OWNER)
      .setIssuer(issuer)
      .setAudience(audience)
      .setIssuedAt()
      .setExpirationTime(expiresIn)
      .sign(privateKey);
  }
  return { provider, sign };
}

// UserStore en memoria con el mismo contrato que el de SQL.
export function fakeUsers() {
  const byGlobalId = new Map<string, User>();
  let nextId = 1;

  const store: UserStore = {
    async findOrCreate(globalId) {
      const now = new Date();
      const existing = byGlobalId.get(globalId);
      const user: User = {
        id: existing?.id ?? nextId++,
        globalId,
        legacyAccount: existing?.legacyAccount ?? null,
        createdAt: existing?.createdAt ?? now,
        lastSeenAt: now,
        disabledAt: existing?.disabledAt ?? null,
        closedAt: existing?.closedAt ?? null,
      };
      byGlobalId.set(globalId, user);
      return user;
    },
    async delete(userId) {
      for (const [key, user] of byGlobalId) if (user.id === userId) byGlobalId.delete(key);
    },
  };

  return { store, byGlobalId };
}

/** Grupos en memoria cuyos proyectos personales son los del almacén de proyectos dado. */
export function memoryGroups(projects: ProjectStore) {
  return createMemoryGroupStore({
    async remove(userId, projectId) {
      const existing = await projects.get(userId, projectId);
      if (existing && !existing.deletedAt) await projects.delete(userId, projectId, null);
    },
    async give(userId, project) {
      const existing = await projects.get(userId, project.id);
      await projects.put(
        userId,
        project.id,
        { name: project.name, document: project.document, updatedAt: project.updatedAt },
        existing?.version ?? 0,
      );
    },
  });
}

/** La plataforma de los espacios, en memoria: crea espacios con ids correlativos y apunta las llamadas. */
export function fakeSpaces() {
  const created = new Map<string, PlatformSpace>();
  const calls: string[] = [];
  const published: { externalId: string; idExterno: string; datos: Record<string, unknown> }[] = [];
  let nextId = 100;
  let failNext: PlatformError | null = null;
  const client: SpacesClient = {
    async declareRoles() {
      calls.push('roles');
    },
    async create(globalId, space) {
      calls.push(`create:${space.idExterno}`);
      if (failNext) {
        const error = failNext;
        failNext = null;
        throw error;
      }
      const existing = created.get(space.idExterno);
      if (existing) return existing;
      const value: PlatformSpace = {
        id: nextId++,
        idExterno: space.idExterno,
        nombre: space.nombre,
        entrada: 'invitacion',
        dosPasos: false,
        propietario: globalId.toLowerCase(),
      };
      created.set(space.idExterno, value);
      return value;
    },
    async conversation(externalId) {
      calls.push(`conversation:${externalId}`);
      return 500;
    },
    async publish(externalId, idExterno, datos) {
      calls.push(`publish:${externalId}:${idExterno}`);
      published.push({ externalId, idExterno, datos });
    },
    async remove(externalId) {
      calls.push(`remove:${externalId}`);
      if (failNext) {
        const error = failNext;
        failNext = null;
        throw error;
      }
      created.delete(externalId);
    },
  };
  return {
    client,
    created,
    calls,
    published,
    failOnce(error: PlatformError) {
      failNext = error;
    },
  };
}

/** La plataforma y Notificapp, en memoria: apuntan lo que se manda. */
export function fakeCommunityClient() {
  const calls: { op: string; body: unknown }[] = [];
  let failNext: Error | null = null;
  const fail = () => {
    if (!failNext) return;
    const error = failNext;
    failNext = null;
    throw error;
  };
  const client: CommunityClient = {
    async declareNewsKinds() {
      calls.push({ op: 'kinds', body: null });
    },
    async postNews(payload) {
      fail();
      calls.push({ op: 'news', body: payload });
      return true;
    },
    async retireNews(externalId) {
      fail();
      calls.push({ op: 'retire', body: externalId });
    },
    async notify(payload) {
      fail();
      calls.push({ op: 'notify', body: payload });
    },
    async cases() {
      return [{ clave: 'contenido', nombre: 'Contenido inapropiado' }];
    },
    async incident(body) {
      fail();
      calls.push({ op: 'incident', body });
      return { incidente: { id: 1 } };
    },
  };
  return {
    client,
    calls,
    failOnce(error: Error) {
      failNext = error;
    },
  };
}

export function testDependencies(overrides: Partial<AppDependencies> = {}): AppDependencies {
  const projects = overrides.projects ?? createMemoryProjectStore();
  return {
    config: testConfig,
    db: fakeDb(),
    auth: { verify: async () => Promise.reject(new AuthTokenError('invalid_token')) },
    users: fakeUsers().store,
    ai: {
      propose: async () => Promise.reject(new Error('IA no configurada en la prueba')),
      ask: async () => Promise.reject(new Error('IA no configurada en la prueba')),
    },
    conversations: createMemoryConversationStore(),
    groups: memoryGroups(projects),
    comments: createMemoryCommentStore(),
    spaces: fakeSpaces().client,
    community: createMemoryCommunityStore(() => ({ globalId: OWNER, active: true })).store,
    communityClient: fakeCommunityClient().client,
    feed: null,
    ...overrides,
    projects,
  };
}
