import { createHash } from 'node:crypto';
import type { FastifyRequest } from 'fastify';
import { z } from 'zod';
import { HttpError } from '../auth/plugin.ts';
import { REQUEST_STATUSES, type RequestStore } from './model.ts';

// Respuesta del propietario a una petición. La comparten el panel de Notificapp y el de
// administración de la web: misma validación, misma idempotencia, mismo historial.

const IDEMPOTENCY_KEY = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;

export const requestIdParams = z.object({ id: z.coerce.number().int().positive() });

const responseBody = z.object({
  status: z.enum(REQUEST_STATUSES),
  message: z
    .string()
    .trim()
    .max(2000)
    .nullish()
    .transform(value => value || null),
  duplicateOf: z
    .number()
    .int()
    .positive()
    .nullish()
    .transform(value => value ?? null),
});

export async function adminRequestDetail(requests: RequestStore, request: FastifyRequest) {
  const { id } = requestIdParams.parse(request.params);
  const detail = await requests.adminDetail(id);
  if (!detail) throw new HttpError(404, 'request_not_found', 'La petición no existe.');
  return detail;
}

/** Aplica la respuesta del cuerpo con la cabecera `Idempotency-Key`; repetirla no la duplica. */
export async function answerRequest(requests: RequestStore, request: FastifyRequest) {
  const { id } = requestIdParams.parse(request.params);
  const key = request.headers['idempotency-key'];
  if (typeof key !== 'string' || !IDEMPOTENCY_KEY.test(key)) {
    throw new HttpError(400, 'idempotency_key_invalid', 'Falta la cabecera Idempotency-Key o no es válida.');
  }
  const body = responseBody.parse(request.body);
  const hash = createHash('sha256')
    .update(JSON.stringify({ id, ...body }))
    .digest('hex');

  const result = await requests.respond(id, body, { key, hash });
  switch (result.status) {
    case 'not_found':
      throw new HttpError(404, 'request_not_found', 'La petición no existe.');
    case 'conflict':
      throw new HttpError(409, 'idempotency_conflict', 'Esa clave ya se usó con otra respuesta.');
    case 'invalid_duplicate':
      throw new HttpError(400, 'duplicate_invalid', 'Indica una petición existente y distinta como original.');
    default:
      request.log.info(
        { requestId: id, status: body.status, replayed: result.status === 'replayed' },
        'Petición respondida',
      );
      return { ...result.request, replayed: result.status === 'replayed' };
  }
}
