import { readFile } from 'node:fs/promises';
import Anthropic from '@anthropic-ai/sdk';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import OpenAI from 'openai';
import { zodTextFormat } from 'openai/helpers/zod';
import type { AppConfig } from '../config.ts';
import { USER_AGENT } from '../platform/feed.ts';
import type { AiModel } from './models.ts';
import { DATABASE_SYSTEM_PROMPT, databaseUserMessage } from './prompt.ts';
import { checkProposalLimits, proposalSchema, type AiDatabaseContext, type AiProposal } from './schema.ts';
import { fromWire, wireProposalSchema } from './wire.ts';

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
// Solo el esquema: con el formato «auto-parseable» el SDK interpretaría la salida por su cuenta
// antes de poder mirar si se cortó. Se valida aquí, igual para los dos proveedores.
const ANTHROPIC_FORMAT = { type: 'json_schema' as const, schema: zodOutputFormat(wireProposalSchema).schema };
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

export interface AiRequest {
  model: AiModel;
  /** `sub` validado de la cuenta que actúa. */
  account: string;
  instruction: string;
  context: AiDatabaseContext;
  signal?: AbortSignal;
}

export interface AiResult {
  proposal: AiProposal;
  usage: { inputTokens: number; outputTokens: number };
}

export interface AiAssistant {
  propose(request: AiRequest): Promise<AiResult>;
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

/** Respuesta de error con el formato común de la plataforma (`{ error, code, … }`), no la del proveedor. */
class PlatformRejection extends Error {
  readonly status: number;
  readonly code: string;
  readonly detail: string;
  constructor(status: number, code: string, detail: string) {
    super(code);
    this.status = status;
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

/** Los errores que dependen de la persona (enlazan la gestión de sus claves). */
export const KEY_ERRORS = new Set(['sin_clave_de_ia', 'tope_sin_fijar', 'tope_de_gasto', 'clave_rechazada']);

function platformError(rejection: PlatformRejection): AiError {
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
      throw new PlatformRejection(response.status, body.code, body.error);
    return response;
  };
}

function unwrap(error: unknown): unknown {
  let current = error;
  for (let i = 0; i < 5 && current instanceof Error; i++) {
    if (current instanceof PlatformRejection) return current;
    current = current.cause;
  }
  return error;
}

function translate(error: unknown, signal?: AbortSignal): AiError {
  if (error instanceof AiError) return error;
  const cause = unwrap(error);
  if (cause instanceof PlatformRejection) return platformError(cause);
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
  // La credencial se lee al usarla por primera vez; si falla, se vuelve a intentar en la siguiente.
  const credential = () =>
    (token ??= readFile(options.serviceTokenFile, 'utf8')
      .then(t => t.trim())
      .catch(error => {
        token = null;
        throw error;
      }));

  async function anthropic(request: AiRequest, apiKey: string): Promise<AiResult> {
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
          max_tokens: AI_MAX_OUTPUT_TOKENS,
          system: DATABASE_SYSTEM_PROMPT,
          messages: [{ role: 'user', content: databaseUserMessage(request.instruction, request.context) }],
          output_config: { effort: request.model.effort, format: ANTHROPIC_FORMAT },
        },
        { headers: { 'X-Yosi-Cuenta': request.account }, signal: request.signal },
      )
      .finalMessage();
    if (message.stop_reason === 'max_tokens') throw INCOMPLETE;
    if (message.stop_reason === 'refusal') throw REFUSED;
    const text = message.content.flatMap(block => (block.type === 'text' ? [block.text] : [])).join('');
    return {
      proposal: parseProposal(text),
      usage: { inputTokens: message.usage.input_tokens, outputTokens: message.usage.output_tokens },
    };
  }

  async function openai(request: AiRequest, apiKey: string): Promise<AiResult> {
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
        instructions: DATABASE_SYSTEM_PROMPT,
        input: databaseUserMessage(request.instruction, request.context),
        max_output_tokens: AI_MAX_OUTPUT_TOKENS,
        reasoning: { effort: request.model.effort },
        text: { format: zodTextFormat(wireProposalSchema, 'propuesta') },
        store: false,
      },
      { headers: { 'X-Yosi-Cuenta': request.account }, signal: request.signal },
    );
    if (response.status === 'incomplete') throw INCOMPLETE;
    const refused = response.output.some(
      item => item.type === 'message' && item.content.some(part => part.type === 'refusal'),
    );
    if (refused) throw REFUSED;
    return {
      proposal: parseProposal(response.output_text),
      usage: { inputTokens: response.usage?.input_tokens ?? 0, outputTokens: response.usage?.output_tokens ?? 0 },
    };
  }

  return {
    async propose(request) {
      try {
        const apiKey = await credential();
        return request.model.provider === 'anthropic'
          ? await anthropic(request, apiKey)
          : await openai(request, apiKey);
      } catch (error) {
        throw translate(error, request.signal);
      }
    },
  };
}
