import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import type { AppDependencies } from '../app.ts';
import { assertCanCreate, authenticatedUser, HttpError } from '../auth/plugin.ts';
import { AiError, KEY_ERRORS, MANAGE_KEYS_URL } from '../ai/assistant.ts';
import { AI_MODELS, AI_PROVIDERS, findModel } from '../ai/models.ts';
import { contextSchema } from '../ai/schema.ts';

/*
 * Asistencia de IA (`docs/roadmaps/ROADMAP_IA.md`). El navegador manda la petición y el contexto
 * mínimo del esquema; la API llama a la pasarela de la plataforma con la cuenta que actúa y
 * devuelve la propuesta validada. No guarda ni registra el contenido: solo modelo, tokens y tiempo.
 */

// Además del límite general por cuenta, la pasarela admite 30 llamadas por minuto y cuenta.
export const AI_RATE_LIMIT = 10;
export const AI_BODY_LIMIT = 1024 * 1024;

const proposeSchema = z.object({
  provider: z.enum(AI_PROVIDERS),
  model: z.string().max(100),
  scope: z.literal('base-de-datos'),
  instruction: z.string().trim().min(1, 'Escribe qué quieres hacer.').max(4000),
  context: contextSchema,
});

export const aiRoutes: FastifyPluginAsync<Pick<AppDependencies, 'ai' | 'config'>> = async (app, { ai, config }) => {
  const manageUrl = MANAGE_KEYS_URL[config.platform.env];
  const limiter = app.createRateLimit({
    max: AI_RATE_LIMIT,
    timeWindow: '1 minute',
    keyGenerator: request => `ai:${request.user?.id}`,
  });

  app.get('/ia/modelos', async () => ({
    manageUrl,
    models: AI_MODELS.map(({ provider, id, label, tier }) => ({ provider, id, label, tier })),
  }));

  app.post('/ia/propuestas', { bodyLimit: AI_BODY_LIMIT }, async (request, reply) => {
    const user = authenticatedUser(request);
    assertCanCreate(user);
    const limit = await limiter(request);
    if (!limit.isAllowed && limit.isExceeded) {
      reply.header('retry-after', limit.ttlInSeconds);
      throw new HttpError(429, 'demasiadas_peticiones', 'Demasiadas peticiones a la IA. Espera un momento.');
    }

    const body = proposeSchema.parse(request.body);
    const model = findModel(body.provider, body.model);
    if (!model) throw new HttpError(400, 'modelo_no_admitido', 'Nodaria no ofrece ese modelo.');

    // Si el navegador corta la conexión (cancelar), se aborta la llamada al proveedor.
    const controller = new AbortController();
    reply.raw.on('close', () => {
      if (!reply.raw.writableFinished) controller.abort();
    });

    const started = Date.now();
    try {
      const result = await ai.propose({
        model,
        account: user.globalId,
        instruction: body.instruction,
        context: body.context,
        signal: controller.signal,
      });
      request.log.info(
        { userId: user.id, model: model.id, ...result.usage, ms: Date.now() - started },
        'propuesta de IA',
      );
      return {
        proposal: result.proposal,
        model: { provider: model.provider, id: model.id, label: model.label },
        usage: result.usage,
      };
    } catch (error) {
      if (!(error instanceof AiError)) throw error;
      request.log.info(
        { userId: user.id, model: model.id, code: error.code, ms: Date.now() - started },
        'IA sin propuesta',
      );
      throw new HttpError(
        error.statusCode,
        error.code,
        error.message,
        KEY_ERRORS.has(error.code) ? { manageUrl } : undefined,
      );
    }
  });
};
