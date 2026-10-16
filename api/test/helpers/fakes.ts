import { createLocalJWKSet, exportJWK, generateKeyPair, SignJWT, type JWTPayload } from 'jose';
import type { AppDependencies } from '../../src/app.ts';
import { AuthTokenError, identityFromClaims, type AuthProvider } from '../../src/auth/platform.ts';
import { TokenCaducado, TokenNoValido, crearVerificador } from '../../src/auth/yosiftware-tokens.mjs';
import { loadConfig } from '../../src/config.ts';
import { createMemoryConversationStore } from '../../src/ai/conversations.ts';
import { createMemoryProjectStore } from '../../src/projects/repository.ts';
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

export function testDependencies(overrides: Partial<AppDependencies> = {}): AppDependencies {
  return {
    config: testConfig,
    db: fakeDb(),
    auth: { verify: async () => Promise.reject(new AuthTokenError('invalid_token')) },
    users: fakeUsers().store,
    projects: createMemoryProjectStore(),
    ai: { propose: async () => Promise.reject(new Error('IA no configurada en la prueba')) },
    conversations: createMemoryConversationStore(),
    ...overrides,
  };
}
