import Anthropic from '@anthropic-ai/sdk';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import OpenAI from 'openai';
import { zodTextFormat } from 'openai/helpers/zod';
import type { AppConfig } from '../config.ts';
import { PlatformError, serviceToken, USER_AGENT } from '../platform/http.ts';
import type { AiModel } from './models.ts';
import { DATABASE_SYSTEM_PROMPT, databaseUserMessage } from './prompt.ts';
import { checkProposalLimits, proposalSchema, type AiDatabaseContext, type AiProposal } from './schema.ts';
import { fromWire, wireProposalSchema } from './wire.ts';
import {
  checkAnswer,
  WORLD_SYSTEM_PROMPT,
  worldAnswerSchema,
  worldUserMessage,
  type AiWorldAnswer,
  type AiWorldContext,
} from './world.ts';

/*
 * Llamadas a la IA a través de la pasarela de la plataforma (`ecosistema-kit/CLAVES_DE_IA.md`). Los
 * SDK oficiales apuntan a la pasarela con la credencial de servicio de Nodaria en lugar de la clave,
 * y cada llamada lleva en `X-Yosi-Cuenta` la cuenta que la pide: la plataforma pone su clave. Nodaria
 * nunca ve la clave.
 *
 * La salida se pide como JSON con el esquema de la propuesta (salidas estructuradas de cada
 * proveedor) y se vuelve a validar aquí. Terminar por longitud (el tope de gasto puede rebajar el
 * máximo de tokens) o un rechazo del modelo no dan propuesta: nunca se aplica nada a medias.
 */

export const AI_MAX_OUTPUT_TOKENS = 32_000;
/** Una respuesta a una pregunta es texto: basta con menos (y acota el gasto). */
export const AI_MAX_ANSWER_TOKENS = 12_000;
// Solo el esquema: con el formato «auto-parseable» el SDK interpretaría la salida por su cuenta
// antes de poder mirar si se cortó. Se valida aquí, igual para los dos proveedores.
const PROPOSAL_FORMAT = {
  anthropic: { type: 'json_schema' as const, schema: zodOutputFormat(wireProposalSchema).schema },
  openai: zodTextFormat(wireProposalSchema, 'propuesta'),
};
const ANSWER_FORMAT = {
  anthropic: { type: 'json_schema' as const, schema: zodOutputFormat(worldAnswerSchema).schema },
  openai: zodTextFormat(worldAnswerSchema, 'respuesta'),
};
/** La pasarela corta a los 10 minutos; Nodaria se rinde un poco antes. */
export const AI_TIMEOUT_MS = 9 * 60 * 1000;
/**
 * Estado de los fallos del proveedor o de la pasarela. No es 502 ni 504: Cloudflare cambia esas
 * respuestas del origen por su propia página, sin CORS, y el navegador lo ve como «sin conexión».
 */
export const UPSTREAM_FAILED = 424;

export const MANAGE_KEYS_URL: Record<AppConfig['platform']['env'], string> = {
  produccion: 'https://social.yosiftware.es/?vista=claves-ia',
  qa: 'https://qa-social.yosiftware.es/?vista=claves-ia',
  desarrollo: 'https://qa-social.yosiftware.es/?vista=claves-ia',
};

/** Lo común a toda llamada: modelo, cuenta, clave del grupo, historial y cancelación. */
export interface AiCall {
  model: AiModel;
  /** `sub` validado de la cuenta que actúa. */
  account: string;
  /** Turnos anteriores de la conversación, ya resumidos (`conversationTurns`), del más antiguo al último. */
  history?: AiTurn[];
  /**
   * Espacio (grupo) cuya clave de IA se usa (`X-Yosi-Espacio`): solo en los proyectos de ese grupo. Sin él,
   * la clave de la persona.
   */
  space?: number;
  signal?: AbortSignal;
}

export interface AiRequest extends AiCall {
  instruction: string;
  context: AiDatabaseContext;
}

/** Una pregunta sobre el mundo del proyecto (`world.ts`). */
export interface AiQuestion extends AiCall {
  question: string;
  context: AiWorldContext;
}

export interface AiTurn {
  role: 'user' | 'assistant';
  text: string;
}

/** Tokens de entrada y de salida de una llamada, según el proveedor. */
export interface AiUsage {
  inputTokens: number;
  outputTokens: number;
}

export interface AiResult {
  proposal: AiProposal;
  usage: AiUsage;
}

export interface AiAnswerResult {
  answer: AiWorldAnswer;
  usage: AiUsage;
}

export interface AiAssistant {
  propose(request: AiRequest): Promise<AiResult>;
  ask(request: AiQuestion): Promise<AiAnswerResult>;
}

/** Error que se le explica a la persona. `code` es el de la plataforma o uno propio de Nodaria. */
export class AiError extends Error {
  readonly statusCode: number;
  readonly code: string;
  /** Lo que dijo el proveedor (estado y motivo), solo para el registro del servidor; nunca va a la web. */
  readonly detail: string | undefined;
  constructor(statusCode: number, code: string, message: string, detail?: string) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
    this.detail = detail;
  }
}

const PLATFORM_ERRORS: Record<string, { status: number; message: string }> = {
  sin_clave_de_ia: {
    status: 409,
    message: 'No tienes ninguna clave de este proveedor autorizada para Nodaria. Guárdala en tu cuenta de Yosiftware.',
  },
  tope_sin_fijar: { status: 409, message: 'Tu clave de IA no tiene tope de gasto. Fíjalo en tu cuenta de Yosiftware.' },
  tope_de_gasto: {
    status: 429,
    message: 'Tus claves de este proveedor han llegado a su tope del mes o se han quedado sin crédito.',
  },
  modelo_sin_tarifa: { status: 400, message: 'La plataforma no admite este modelo con tope de gasto. Elige otro.' },
  demasiadas_peticiones: {
    status: 429,
    message: 'Demasiadas peticiones a la IA. Espera un momento y vuelve a intentarlo.',
  },
  llamada_demasiado_grande: {
    status: 413,
    message: 'El esquema es demasiado grande para enviarlo entero. Elige una parte.',
  },
  cuenta_no_disponible: { status: 403, message: 'Tu cuenta no está activa en la plataforma.' },
  proveedor_sin_respuesta: {
    status: UPSTREAM_FAILED,
    message: 'El proveedor de IA no ha respondido. Inténtalo de nuevo.',
  },
};

/**
 * Con la clave del grupo (`X-Yosi-Espacio`), los errores hablan del grupo. Sin clave del grupo para ese
 * proveedor no se pasa a la de la persona a sus espaldas: se le ofrece (`sin_clave_del_grupo`).
 */
const GROUP_ERRORS: Record<string, { status: number; code: string; message: string }> = {
  sin_clave_de_ia: {
    status: 409,
    code: 'sin_clave_del_grupo',
    message: 'El grupo no tiene clave de IA de este proveedor. Puedes usar la tuya en este proyecto.',
  },
  tope_sin_fijar: {
    status: 409,
    code: 'tope_del_grupo',
    message: 'La clave de IA del grupo no tiene tope de gasto. Quien tiene la propiedad del grupo debe fijarlo.',
  },
  tope_de_gasto: {
    status: 429,
    code: 'tope_del_grupo',
    message: 'Las claves de IA del grupo han llegado a su tope del mes. Puedes usar la tuya en este proyecto.',
  },
  proveedor_no_permitido: {
    status: 403,
    code: 'proveedor_no_permitido',
    message: 'El grupo no deja usar este proveedor de IA. Elige otro modelo.',
  },
  modelo_no_permitido: {
    status: 403,
    code: 'modelo_no_permitido',
    message: 'El grupo no deja usar este modelo. Elige otro.',
  },
  espacio_no_disponible: {
    status: 403,
    code: 'espacio_no_disponible',
    message: 'No puedes usar la clave de IA de este grupo.',
  },
};

/** Los errores que dependen de la persona (enlazan la gestión de sus claves). */
export const KEY_ERRORS = new Set(['sin_clave_de_ia', 'tope_sin_fijar', 'tope_de_gasto', 'clave_rechazada']);

function gatewayHeaders(request: AiCall): Record<string, string> {
  return {
    'X-Yosi-Cuenta': request.account,
    ...(request.space ? { 'X-Yosi-Espacio': String(request.space) } : {}),
  };
}

/** Una respuesta de error de la plataforma (`{ code, error }`), no la del proveedor. */
function platformError(rejection: PlatformError, space?: number): AiError {
  const group = space ? GROUP_ERRORS[rejection.code] : undefined;
  if (group) return new AiError(group.status, group.code, group.message);
  const known = PLATFORM_ERRORS[rejection.code];
  if (known) return new AiError(known.status, rejection.code, known.message);
  // credencial_no_valida, ruta_no_permitida, solicitud_invalida, claves_ia_*: problema de configuración.
  return new AiError(
    UPSTREAM_FAILED,
    'ia_no_disponible',
    'La asistencia de IA no está disponible ahora. Inténtalo más tarde.',
    `${rejection.status} ${rejection.code}`,
  );
}

/**
 * `fetch` para los SDK que detecta las respuestas de error de la plataforma antes de que el SDK las
 * convierta en las suyas (el de OpenAI pierde el `code`). Los errores del proveedor pasan tal cual.
 */
export function gatewayFetch(base: typeof fetch = fetch): typeof fetch {
  return async (input, init) => {
    const response = await base(input, init);
    if (response.ok) return response;
    const body = (await response
      .clone()
      .json()
      .catch(() => null)) as { error?: unknown; code?: unknown } | null;
    if (body && typeof body.code === 'string' && typeof body.error === 'string')
      throw new PlatformError(response.status, body.code, body.error);
    return response;
  };
}

function unwrap(error: unknown): unknown {
  let current = error;
  for (let i = 0; i < 5 && current instanceof Error; i++) {
    if (current instanceof PlatformError) return current;
    current = current.cause;
  }
  return error;
}

function translate(error: unknown, signal?: AbortSignal, space?: number): AiError {
  if (error instanceof AiError) return error;
  const cause = unwrap(error);
  if (cause instanceof PlatformError) return platformError(cause, space);
  if (signal?.aborted) return new AiError(499, 'ia_cancelada', 'Se canceló la petición.');
  if (error instanceof Anthropic.APIConnectionTimeoutError || error instanceof OpenAI.APIConnectionTimeoutError)
    return new AiError(
      UPSTREAM_FAILED,
      'ia_sin_respuesta',
      'La IA ha tardado demasiado. Prueba con una parte más pequeña.',
    );
  if (error instanceof Anthropic.APIError || error instanceof OpenAI.APIError) {
    const status = typeof error.status === 'number' ? error.status : 0;
    const detail = `${status} ${error.message}`.slice(0, 500);
    if (status === 429)
      return new AiError(429, 'proveedor_ocupado', 'El proveedor de IA está saturado. Inténtalo más tarde.', detail);
    if (status === 401 || status === 403)
      return new AiError(
        UPSTREAM_FAILED,
        'clave_rechazada',
        'El proveedor ha rechazado tu clave de IA. Revísala en tu cuenta de Yosiftware.',
        detail,
      );
    return new AiError(UPSTREAM_FAILED, 'proveedor_error', 'El proveedor de IA ha rechazado la petición.', detail);
  }
  throw error;
}

function parseProposal(raw: string): AiProposal {
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    throw new AiError(
      UPSTREAM_FAILED,
      'propuesta_no_valida',
      'La IA no ha devuelto una propuesta válida. Inténtalo de nuevo.',
    );
  }
  // El modelo responde en el formato plano (`wire.ts`); se traduce y se vuelve a validar el resultado.
  const wire = wireProposalSchema.safeParse(json);
  const parsed = wire.success ? proposalSchema.safeParse(fromWire(wire.data)) : wire;
  if (!parsed.success)
    throw new AiError(
      UPSTREAM_FAILED,
      'propuesta_no_valida',
      'La IA no ha devuelto una propuesta válida. Inténtalo de nuevo.',
    );
  const problem = checkProposalLimits(parsed.data);
  if (problem) throw new AiError(UPSTREAM_FAILED, 'propuesta_no_valida', problem);
  return parsed.data;
}

function parseAnswer(raw: string): AiWorldAnswer {
  const invalid = new AiError(
    UPSTREAM_FAILED,
    'respuesta_no_valida',
    'La IA no ha devuelto una respuesta válida. Inténtalo de nuevo.',
  );
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    throw invalid;
  }
  const parsed = worldAnswerSchema.safeParse(json);
  if (!parsed.success) throw invalid;
  const checked = checkAnswer(parsed.data);
  if ('problem' in checked) throw new AiError(UPSTREAM_FAILED, 'respuesta_no_valida', checked.problem);
  return checked.answer;
}

const INCOMPLETE = new AiError(
  422,
  'propuesta_incompleta',
  'La respuesta se cortó antes de terminar (puede que por el tope de gasto de tu clave). No se ha aplicado nada: prueba con una parte más pequeña o con otro modelo.',
);
const REFUSED = new AiError(422, 'propuesta_rechazada', 'El modelo no ha querido responder a esta petición.');

export interface GatewayOptions {
  /** API de la plataforma del entorno (`config.platform.api`). */
  platformApi: string;
  serviceTokenFile: string;
  fetch?: typeof fetch;
}

export function createGatewayAssistant(options: GatewayOptions): AiAssistant {
  const base = `${options.platformApi}/v1/servicio/ia`;
  const fetchImpl = gatewayFetch(options.fetch);
  let token: Promise<string> | null = null;
  // La credencial se lee al usarla por primera vez; si falta, se vuelve a intentar en la siguiente y la
  // persona ve que la IA no está disponible (`PlatformError` 503 `sin_credencial`).
  const credential = () =>
    (token ??= serviceToken(options.serviceTokenFile).catch(error => {
      token = null;
      throw error;
    }));

  /** Lo que cambia entre propuestas y preguntas: instrucciones, mensaje, formato y tope de salida. */
  interface Prompt {
    system: string;
    user: string;
    format: typeof PROPOSAL_FORMAT | typeof ANSWER_FORMAT;
    maxTokens: number;
  }
  interface Output {
    text: string;
    usage: AiUsage;
  }

  async function anthropic(request: AiCall, prompt: Prompt, apiKey: string): Promise<Output> {
    const client = new Anthropic({
      apiKey,
      baseURL: `${base}/anthropic`,
      fetch: fetchImpl,
      maxRetries: 0,
      timeout: AI_TIMEOUT_MS,
      defaultHeaders: { 'user-agent': USER_AGENT },
    });
    const message = await client.messages
      .stream(
        {
          model: request.model.id,
          max_tokens: prompt.maxTokens,
          system: prompt.system,
          messages: [
            ...(request.history ?? []).map(t => ({ role: t.role, content: t.text })),
            { role: 'user' as const, content: prompt.user },
          ],
          output_config: { effort: request.model.effort, format: prompt.format.anthropic },
        },
        { headers: gatewayHeaders(request), signal: request.signal },
      )
      .finalMessage();
    if (message.stop_reason === 'max_tokens') throw INCOMPLETE;
    if (message.stop_reason === 'refusal') throw REFUSED;
    return {
      text: message.content.flatMap(block => (block.type === 'text' ? [block.text] : [])).join(''),
      usage: { inputTokens: message.usage.input_tokens, outputTokens: message.usage.output_tokens },
    };
  }

  async function openai(request: AiCall, prompt: Prompt, apiKey: string): Promise<Output> {
    const client = new OpenAI({
      apiKey,
      baseURL: `${base}/openai/v1`,
      fetch: fetchImpl,
      maxRetries: 0,
      timeout: AI_TIMEOUT_MS,
      defaultHeaders: { 'user-agent': USER_AGENT },
    });
    const response = await client.responses.create(
      {
        model: request.model.id,
        instructions: prompt.system,
        input: [
          ...(request.history ?? []).map(t => ({ role: t.role, content: t.text })),
          { role: 'user' as const, content: prompt.user },
        ],
        max_output_tokens: prompt.maxTokens,
        reasoning: { effort: request.model.effort },
        text: { format: prompt.format.openai },
        store: false,
      },
      { headers: gatewayHeaders(request), signal: request.signal },
    );
    if (response.status === 'incomplete') throw INCOMPLETE;
    const refused = response.output.some(
      item => item.type === 'message' && item.content.some(part => part.type === 'refusal'),
    );
    if (refused) throw REFUSED;
    return {
      text: response.output_text,
      usage: { inputTokens: response.usage?.input_tokens ?? 0, outputTokens: response.usage?.output_tokens ?? 0 },
    };
  }

  async function call(request: AiCall, prompt: Prompt): Promise<Output> {
    try {
      const apiKey = await credential();
      return request.model.provider === 'anthropic'
        ? await anthropic(request, prompt, apiKey)
        : await openai(request, prompt, apiKey);
    } catch (error) {
      throw translate(error, request.signal, request.space);
    }
  }

  return {
    async propose(request) {
      const output = await call(request, {
        system: DATABASE_SYSTEM_PROMPT,
        user: databaseUserMessage(request.instruction, request.context),
        format: PROPOSAL_FORMAT,
        maxTokens: AI_MAX_OUTPUT_TOKENS,
      });
      // Una respuesta que no cumple el formato no es un fallo del proveedor: se explica tal cual.
      return { proposal: parseProposal(output.text), usage: output.usage };
    },
    async ask(request) {
      const output = await call(request, {
        system: WORLD_SYSTEM_PROMPT,
        user: worldUserMessage(request.question, request.context),
        format: ANSWER_FORMAT,
        maxTokens: AI_MAX_ANSWER_TOKENS,
      });
      return { answer: parseAnswer(output.text), usage: output.usage };
    },
  };
}
