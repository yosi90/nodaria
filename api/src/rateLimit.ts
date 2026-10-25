import type { FastifyReply } from 'fastify';

/** Lo que devuelve un limitador de `@fastify/rate-limit` creado con `createRateLimit` cuando no deja pasar. */
interface Limited {
  isAllowed: false;
  isExceeded: boolean;
  ttl: number;
  ttlInSeconds: number;
}

/**
 * Si el limitador dice que la petición se ha pasado del límite: pone `Retry-After` y devuelve `true`. Lo
 * usan el límite general por usuario y los de la IA; cada uno responde el 429 a su manera.
 */
export function overLimit(limit: { isAllowed: true } | Limited, reply: FastifyReply): limit is Limited {
  if (limit.isAllowed || !limit.isExceeded) return false;
  reply.header('retry-after', limit.ttlInSeconds);
  return true;
}
