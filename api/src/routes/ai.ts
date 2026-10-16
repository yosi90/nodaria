import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import type { AppDependencies } from '../app.ts';
import { assertCanCreate, authenticatedUser, HttpError } from '../auth/plugin.ts';
import { AiError, KEY_ERRORS, MANAGE_KEYS_URL } from '../ai/assistant.ts';
import { MAX_MESSAGES } from '../ai/conversations.ts';
import { conversationTurns } from '../ai/history.ts';
import { AI_MODELS, AI_PROVIDERS, findModel } from '../ai/models.ts';
import { AI_MAX_OPERATIONS, contextSchema } from '../ai/schema.ts';
import { PROJECT_ID } from './projects.ts';

/*
 * Asistencia de IA (`docs/roadmaps/ROADMAP_IA.md`). El navegador manda la petición y el contexto
 * mínimo del esquema; la API llama a la pasarela de la plataforma con la cuenta que actúa y
 * devuelve la propuesta validada. Cada petición pertenece a una conversación del proyecto, que se
 * guarda en la cuenta (`ai/conversations.ts`) para seguirla después; al modelo le llegan los turnos
 * anteriores resumidos. El registro del servidor solo apunta modelo, tokens, resultado y tiempo.
 */

// Además del límite general por cuenta, la pasarela admite 30 llamadas por minuto y cuenta.
export const AI_RATE_LIMIT = 10;
export const AI_BODY_LIMIT = 1024 * 1024;
const TITLE_LENGTH = 80;

const refsSchema = z.object({
  tables: z.record(z.string().max(16), z.string().max(200)),
  bases: z.record(z.string().max(16), z.string().max(200)).optional(),
});

const proposeSchema = z.object({
  provider: z.enum(AI_PROVIDERS),
  model: z.string().max(100),
  scope: z.literal('base-de-datos'),
  instruction: z.string().trim().min(1, 'Escribe qué quieres hacer.').max(4000),
  context: contextSchema,
  projectId: z.string().regex(PROJECT_ID),
  /** Conversación que sigue; sin ella se empieza una nueva. */
  conversationId: z.number().int().positive().nullable().optional(),
  /** Traducción de los identificadores del contexto, para revisar la propuesta más tarde. */
  refs: refsSchema,
});

const idParams = z.object({ id: z.coerce.number().int().positive() });
const listQuery = z.object({ proyecto: z.string().regex(PROJECT_ID) });
const appliedSchema = z.object({
  applied: z.array(z.number().int().min(0).max(AI_MAX_OPERATIONS)).max(AI_MAX_OPERATIONS),
});

function titleOf(instruction: string) {
  const line = instruction.replace(/\s+/g, ' ').trim();
  return line.length > TITLE_LENGTH ? `${line.slice(0, TITLE_LENGTH - 1)}…` : line;
}

export const aiRoutes: FastifyPluginAsync<Pick<AppDependencies, 'ai' | 'config' | 'conversations'>> = async (
  app,
  { ai, config, conversations },
) => {
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

  app.get('/ia/conversaciones', async request => {
    const { proyecto } = listQuery.parse(request.query);
    return { conversations: await conversations.list(authenticatedUser(request).id, proyecto) };
  });

  app.get('/ia/conversaciones/:id', async request => {
    const { id } = idParams.parse(request.params);
    const found = await conversations.get(authenticatedUser(request).id, id);
    if (!found) throw new HttpError(404, 'conversacion_no_encontrada', 'La conversación no existe.');
    return found;
  });

  app.delete('/ia/conversaciones/:id', async request => {
    const { id } = idParams.parse(request.params);
    if (!(await conversations.delete(authenticatedUser(request).id, id)))
      throw new HttpError(404, 'conversacion_no_encontrada', 'La conversación no existe.');
    return { id };
  });

  app.patch('/ia/mensajes/:id', async request => {
    const { id } = idParams.parse(request.params);
    const { applied } = appliedSchema.parse(request.body);
    const ok = await conversations.updateAssistantMessage(authenticatedUser(request).id, id, {
      applied,
      appliedAt: new Date().toISOString(),
    });
    if (!ok) throw new HttpError(404, 'mensaje_no_encontrado', 'El mensaje no existe.');
    return { id, applied };
  });

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

    let conversation = body.conversationId ? await conversations.get(user.id, body.conversationId) : null;
    if (body.conversationId && (!conversation || conversation.projectId !== body.projectId))
      throw new HttpError(404, 'conversacion_no_encontrada', 'La conversación no existe.');
    if (conversation && conversation.messages.length >= MAX_MESSAGES - 1)
      throw new HttpError(409, 'conversacion_llena', 'Esta conversación es muy larga: empieza una nueva.');
    const history = conversation ? conversationTurns(conversation.messages) : [];
    conversation ??= {
      ...(await conversations.create(user.id, body.projectId, titleOf(body.instruction))),
      messages: [],
    };
    const conversationId = conversation.id;
    const asked = await conversations.addMessage(user.id, conversationId, 'user', { instruction: body.instruction });

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
        history,
        signal: controller.signal,
      });
      request.log.info(
        { userId: user.id, model: model.id, ...result.usage, turns: history.length / 2, ms: Date.now() - started },
        'propuesta de IA',
      );
      const answer = {
        proposal: result.proposal,
        model: { provider: model.provider, id: model.id, label: model.label },
        usage: result.usage,
        refs: body.refs,
        applied: null,
      };
      const saved = await conversations.addMessage(user.id, conversationId, 'assistant', answer);
      return {
        conversationId,
        userMessageId: asked?.id ?? null,
        messageId: saved?.id ?? null,
        proposal: answer.proposal,
        model: answer.model,
        usage: answer.usage,
      };
    } catch (error) {
      if (!(error instanceof AiError)) throw error;
      request.log.info(
        { userId: user.id, model: model.id, code: error.code, detail: error.detail, ms: Date.now() - started },
        'IA sin propuesta',
      );
      await conversations.addMessage(user.id, conversationId, 'error', { code: error.code, message: error.message });
      throw new HttpError(error.statusCode, error.code, error.message, {
        conversationId,
        ...(KEY_ERRORS.has(error.code) ? { manageUrl } : {}),
      });
    }
  });
};
