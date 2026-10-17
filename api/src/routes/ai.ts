import type { FastifyPluginAsync, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import type { AppDependencies } from '../app.ts';
import { assertCanCreate, authenticatedUser, HttpError, type AuthenticatedUser } from '../auth/plugin.ts';
import { AiError, KEY_ERRORS, MANAGE_KEYS_URL, type AiCall } from '../ai/assistant.ts';
import { MAX_MESSAGES } from '../ai/conversations.ts';
import { conversationTurns } from '../ai/history.ts';
import { AI_MODELS, AI_PROVIDERS, findModel, type AiModel } from '../ai/models.ts';
import { AI_MAX_OPERATIONS, contextSchema } from '../ai/schema.ts';
import { worldContextSchema, worldRefsSchema } from '../ai/world.ts';
import { PROJECT_ID } from './projects.ts';

/*
 * Asistencia de IA (`docs/roadmaps/ROADMAP_IA.md`). El navegador manda la petición y el contexto
 * mínimo; la API llama a la pasarela de la plataforma con la cuenta que actúa y devuelve el resultado
 * validado: una propuesta de cambios del esquema (`/ia/propuestas`) o la respuesta a una pregunta
 * sobre el mundo del proyecto (`/ia/preguntas`, que no cambia nada). Cada petición pertenece a una
 * conversación del proyecto, que se guarda en la cuenta (`ai/conversations.ts`) para seguirla después;
 * al modelo le llegan los turnos anteriores resumidos. El registro del servidor solo apunta modelo,
 * tokens, resultado y tiempo.
 */

// Además del límite general por cuenta, la pasarela admite 30 llamadas por minuto y cuenta.
export const AI_RATE_LIMIT = 10;
export const AI_BODY_LIMIT = 1024 * 1024;
/** Una pregunta lleva el mundo entero (nodos, valores y notas): el navegador lo recorta antes. */
export const AI_QUESTION_BODY_LIMIT = 2 * 1024 * 1024;
const TITLE_LENGTH = 80;

const refsSchema = z.object({
  tables: z.record(z.string().max(16), z.string().max(200)),
  bases: z.record(z.string().max(16), z.string().max(200)).optional(),
});

/** Lo común a propuestas y preguntas: modelo, proyecto, conversación y clave. */
const callSchema = z.object({
  provider: z.enum(AI_PROVIDERS),
  model: z.string().max(100),
  projectId: z.string().regex(PROJECT_ID),
  /** Conversación que sigue; sin ella se empieza una nueva. */
  conversationId: z.number().int().positive().nullable().optional(),
  /**
   * En un proyecto de un grupo se usa la clave de IA del grupo; `personal` usa la de la persona (cuando
   * ella lo elige, por ejemplo si el grupo no tiene clave de ese proveedor).
   */
  keySource: z.enum(['grupo', 'personal']).optional(),
});

const proposeSchema = callSchema.extend({
  scope: z.literal('base-de-datos'),
  instruction: z.string().trim().min(1, 'Escribe qué quieres hacer.').max(4000),
  context: contextSchema,
  /** Traducción de los identificadores del contexto, para revisar la propuesta más tarde. */
  refs: refsSchema,
});

const questionSchema = callSchema.extend({
  question: z.string().trim().min(1, 'Escribe tu pregunta.').max(4000),
  context: worldContextSchema,
  /** Traducción de n1, n2… a los nodos, para enlazar los que cita la respuesta al volver a abrirla. */
  refs: worldRefsSchema,
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

export const aiRoutes: FastifyPluginAsync<Pick<AppDependencies, 'ai' | 'config' | 'conversations' | 'groups'>> = async (
  app,
  { ai, config, conversations, groups },
) => {
  /**
   * El espacio cuya clave de IA se usa: el del grupo del proyecto, si la cuenta es miembro activo y no ha
   * pedido usar la suya (decisión del propietario, 2026-10-17: la clave del grupo, solo en sus proyectos).
   */
  async function groupSpace(projectId: string, globalId: string, keySource: 'grupo' | 'personal' | undefined) {
    if (keySource === 'personal') return undefined;
    const externalId = await groups.projectGroup(projectId);
    if (!externalId) return undefined;
    const [group, member] = await Promise.all([groups.find(externalId), groups.member(externalId, globalId)]);
    return group?.state === 'activo' && group.spaceId && member?.state === 'activo' ? group.spaceId : undefined;
  }

  const manageUrl = MANAGE_KEYS_URL[config.platform.env];
  const limiter = app.createRateLimit({
    max: AI_RATE_LIMIT,
    timeWindow: '1 minute',
    keyGenerator: request => `ai:${request.user?.id}`,
  });

  /**
   * Un turno de la conversación, igual para propuestas y preguntas: comprueba la cuenta, el límite y el
   * modelo, guarda la petición, llama a la IA con el historial y guarda la respuesta o el error.
   */
  async function turn<T extends { usage: { inputTokens: number; outputTokens: number } }>(
    request: FastifyRequest,
    reply: FastifyReply,
    body: z.infer<typeof callSchema>,
    asked: { text: string; content: Record<string, unknown>; log: string },
    run: (call: AiCall) => Promise<T>,
    saved: (result: T, model: AiModel) => Record<string, unknown>,
  ) {
    const user: AuthenticatedUser = authenticatedUser(request);
    assertCanCreate(user);
    const limit = await limiter(request);
    if (!limit.isAllowed && limit.isExceeded) {
      reply.header('retry-after', limit.ttlInSeconds);
      throw new HttpError(429, 'demasiadas_peticiones', 'Demasiadas peticiones a la IA. Espera un momento.');
    }
    const model = findModel(body.provider, body.model);
    if (!model) throw new HttpError(400, 'modelo_no_admitido', 'Nodaria no ofrece ese modelo.');

    let conversation = body.conversationId ? await conversations.get(user.id, body.conversationId) : null;
    if (body.conversationId && (!conversation || conversation.projectId !== body.projectId))
      throw new HttpError(404, 'conversacion_no_encontrada', 'La conversación no existe.');
    if (conversation && conversation.messages.length >= MAX_MESSAGES - 1)
      throw new HttpError(409, 'conversacion_llena', 'Esta conversación es muy larga: empieza una nueva.');
    const history = conversation ? conversationTurns(conversation.messages) : [];
    conversation ??= {
      ...(await conversations.create(user.id, body.projectId, titleOf(asked.text))),
      messages: [],
    };
    const conversationId = conversation.id;
    const question = await conversations.addMessage(user.id, conversationId, 'user', asked.content);

    // Si el navegador corta la conexión (cancelar), se aborta la llamada al proveedor.
    const controller = new AbortController();
    reply.raw.on('close', () => {
      if (!reply.raw.writableFinished) controller.abort();
    });

    const started = Date.now();
    const space = await groupSpace(body.projectId, user.globalId, body.keySource);
    try {
      const result = await run({ space, model, account: user.globalId, history, signal: controller.signal });
      request.log.info(
        { userId: user.id, model: model.id, ...result.usage, turns: history.length / 2, ms: Date.now() - started },
        asked.log,
      );
      const content = saved(result, model);
      const message = await conversations.addMessage(user.id, conversationId, 'assistant', content);
      return {
        keySource: space ? ('grupo' as const) : ('personal' as const),
        conversationId,
        userMessageId: question?.id ?? null,
        messageId: message?.id ?? null,
        content,
      };
    } catch (error) {
      if (!(error instanceof AiError)) throw error;
      request.log.info(
        { userId: user.id, model: model.id, code: error.code, detail: error.detail, ms: Date.now() - started },
        `${asked.log}: sin resultado`,
      );
      await conversations.addMessage(user.id, conversationId, 'error', { code: error.code, message: error.message });
      throw new HttpError(error.statusCode, error.code, error.message, {
        conversationId,
        ...(KEY_ERRORS.has(error.code) ? { manageUrl } : {}),
      });
    }
  }

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
    authenticatedUser(request);
    const body = proposeSchema.parse(request.body);
    const { content, ...rest } = await turn(
      request,
      reply,
      body,
      { text: body.instruction, content: { instruction: body.instruction }, log: 'propuesta de IA' },
      call => ai.propose({ ...call, instruction: body.instruction, context: body.context }),
      (result, model) => ({
        proposal: result.proposal,
        model: { provider: model.provider, id: model.id, label: model.label },
        usage: result.usage,
        refs: body.refs,
        applied: null,
      }),
    );
    return { ...rest, proposal: content.proposal, model: content.model, usage: content.usage };
  });

  app.post('/ia/preguntas', { bodyLimit: AI_QUESTION_BODY_LIMIT }, async (request, reply) => {
    authenticatedUser(request);
    const body = questionSchema.parse(request.body);
    const { content, ...rest } = await turn(
      request,
      reply,
      body,
      { text: body.question, content: { instruction: body.question, kind: 'pregunta' }, log: 'pregunta a la IA' },
      call => ai.ask({ ...call, question: body.question, context: body.context }),
      (result, model) => ({
        answer: result.answer,
        model: { provider: model.provider, id: model.id, label: model.label },
        usage: result.usage,
        // Solo las referencias de los nodos citados: bastan para enlazarlos y no llenan la conversación.
        refs: {
          nodes: Object.fromEntries(
            result.answer.cited.flatMap(id => (body.refs.nodes[id] ? [[id, body.refs.nodes[id]]] : [])),
          ),
        },
      }),
    );
    return { ...rest, answer: content.answer, model: content.model, usage: content.usage, refs: content.refs };
  });
};
