import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { AiError, createGatewayAssistant, type AiAssistant, type AiRequest } from '../src/ai/assistant.ts';
import { findModel } from '../src/ai/models.ts';
import type { AiDatabaseContext, AiProposal } from '../src/ai/schema.ts';
import { fromWire, parseSqlType, wireProposalSchema, type WireProposal } from '../src/ai/wire.ts';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import { zodTextFormat } from 'openai/helpers/zod';
import { buildApp } from '../src/app.ts';
import { OWNER, platformTokens, testDependencies } from './helpers/fakes.ts';

const context: AiDatabaseContext = {
  projectName: 'Tienda',
  tables: [
    {
      id: 't1',
      name: 'Cliente',
      typeName: 'Cliente',
      description: '',
      sharesColumnsWith: [],
      partial: false,
      columns: [
        {
          name: 'id',
          type: 'int',
          primaryKey: true,
          nullable: false,
          unique: false,
          identity: true,
          references: null,
          origin: 'propia',
          description: '',
        },
      ],
    },
  ],
  issues: [],
};

const proposal: AiProposal = {
  summary: 'Añade los pedidos.',
  operations: [
    {
      op: 'create-table',
      ref: 'n1',
      name: 'Pedido',
      description: '',
      columns: [
        {
          name: 'id',
          type: { name: 'int', length: null, precision: null, scale: null },
          primaryKey: true,
          nullable: false,
          unique: false,
          identity: true,
          description: '',
        },
      ],
      reason: 'Cada cliente hace pedidos.',
    },
    {
      op: 'add-foreign-key',
      table: 'n1',
      column: 'id_cliente',
      references: 't1',
      nullable: false,
      reason: 'Quién pide.',
    },
  ],
  advice: [],
};

const blank = {
  table: '',
  ref: '',
  name: '',
  description: '',
  column: '',
  references: '',
  nullable: false,
  columns: [],
};
const noChanges = { type: '', primaryKey: '', nullable: '', unique: '', identity: '', description: '' };
/** La misma propuesta en el formato plano que devuelve el modelo. */
const wire: WireProposal = {
  summary: proposal.summary,
  operations: [
    {
      ...blank,
      op: 'create-table',
      ref: 'n1',
      name: 'Pedido',
      columns: [
        { name: 'id', type: 'int', primaryKey: true, nullable: false, unique: false, identity: true, description: '' },
      ],
      changes: noChanges,
      reason: 'Cada cliente hace pedidos.',
    },
    {
      ...blank,
      op: 'add-foreign-key',
      table: 'n1',
      column: 'id_cliente',
      references: 't1',
      changes: noChanges,
      reason: 'Quién pide.',
    },
  ],
  advice: [],
};

const body = (patch: Record<string, unknown> = {}) => ({
  provider: 'anthropic',
  model: 'claude-sonnet-5-5',
  scope: 'base-de-datos',
  instruction: 'Añade pedidos de clientes',
  context,
  ...patch,
});

async function appWith(ai: AiAssistant) {
  const tokens = await platformTokens();
  const app = await buildApp(testDependencies({ auth: tokens.provider, ai }));
  return { app, tokens };
}

describe('rutas de la IA', () => {
  it('exigen sesión y listan los modelos con la gestión de claves', async () => {
    const { app, tokens } = await appWith({
      propose: async () => ({ proposal, usage: { inputTokens: 0, outputTokens: 0 } }),
    });
    expect((await app.inject({ method: 'GET', url: '/api/ia/modelos' })).statusCode).toBe(401);
    const response = await app.inject({
      method: 'GET',
      url: '/api/ia/modelos',
      headers: { authorization: `Bearer ${await tokens.sign()}` },
    });
    expect(response.json().manageUrl).toBe('https://social.yosiftware.es/?vista=claves-ia');
    expect(response.json().models.map((m: { id: string }) => m.id)).toEqual([
      'claude-sonnet-5-5',
      'claude-haiku-5-5',
      'claude-opus-5-5',
      'gpt-5.6-terra',
      'gpt-5.6-luna',
      'gpt-5.6-sol',
    ]);
  });

  it('pide la propuesta para la cuenta que actúa y la devuelve', async () => {
    const seen: AiRequest[] = [];
    const { app, tokens } = await appWith({
      propose: async request => {
        seen.push(request);
        return { proposal, usage: { inputTokens: 120, outputTokens: 80 } };
      },
    });
    const response = await app.inject({
      method: 'POST',
      url: '/api/ia/propuestas',
      headers: { authorization: `Bearer ${await tokens.sign()}` },
      payload: body(),
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      proposal,
      model: { provider: 'anthropic', id: 'claude-sonnet-5-5', label: 'Claude Sonnet 5.5' },
      usage: { inputTokens: 120, outputTokens: 80 },
    });
    expect(seen[0]).toMatchObject({
      account: OWNER,
      instruction: 'Añade pedidos de clientes',
      model: { effort: 'high' },
    });
  });

  it('rechaza modelos que no ofrece, peticiones vacías y cuentas con la creación limitada', async () => {
    const { app, tokens } = await appWith({
      propose: async () => ({ proposal, usage: { inputTokens: 0, outputTokens: 0 } }),
    });
    const headers = { authorization: `Bearer ${await tokens.sign()}` };
    const post = (payload: object, h = headers) =>
      app.inject({ method: 'POST', url: '/api/ia/propuestas', headers: h, payload });
    expect((await post(body({ model: 'gpt-4o' }))).json()).toMatchObject({ error: 'modelo_no_admitido' });
    expect((await post(body({ instruction: '   ' }))).statusCode).toBe(400);
    expect((await post(body({ provider: 'gemini' }))).statusCode).toBe(400);
    const limited = { authorization: `Bearer ${await tokens.sign({ restricciones: ['creacion'] })}` };
    expect((await post(body(), limited)).json()).toMatchObject({ error: 'creacion_limitada' });
  });

  it('explica los errores de las claves con el enlace a su gestión', async () => {
    const { app, tokens } = await appWith({
      propose: async () => Promise.reject(new AiError(409, 'sin_clave_de_ia', 'No tienes clave.')),
    });
    const response = await app.inject({
      method: 'POST',
      url: '/api/ia/propuestas',
      headers: { authorization: `Bearer ${await tokens.sign()}` },
      payload: body(),
    });
    expect(response.statusCode).toBe(409);
    expect(response.json()).toEqual({
      error: 'sin_clave_de_ia',
      message: 'No tienes clave.',
      manageUrl: 'https://social.yosiftware.es/?vista=claves-ia',
    });
  });
});

/* ---------------- Cliente de la pasarela, con un fetch simulado ---------------- */

const tokenFile = () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'nodaria-ia-'));
  const file = path.join(dir, 'plataforma.token');
  writeFileSync(file, 'ys1.99.secreto-de-prueba\n');
  return file;
};

interface Captured {
  url: string;
  headers: Headers;
  body: Record<string, unknown>;
}

function fakeFetch(respond: (captured: Captured) => Response) {
  const calls: Captured[] = [];
  const impl: typeof fetch = async (input, init) => {
    const captured = {
      url: String(input instanceof Request ? input.url : input),
      headers: new Headers(init?.headers),
      body: JSON.parse(String(init?.body ?? '{}')),
    };
    calls.push(captured);
    return respond(captured);
  };
  return { impl, calls };
}

function anthropicStream(text: string, stopReason = 'end_turn') {
  const events = [
    [
      'message_start',
      {
        type: 'message_start',
        message: {
          id: 'msg_1',
          type: 'message',
          role: 'assistant',
          model: 'claude-sonnet-5-5',
          content: [],
          stop_reason: null,
          stop_sequence: null,
          usage: { input_tokens: 200, output_tokens: 1 },
        },
      },
    ],
    ['content_block_start', { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } }],
    ['content_block_delta', { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text } }],
    ['content_block_stop', { type: 'content_block_stop', index: 0 }],
    [
      'message_delta',
      { type: 'message_delta', delta: { stop_reason: stopReason, stop_sequence: null }, usage: { output_tokens: 90 } },
    ],
    ['message_stop', { type: 'message_stop' }],
  ];
  const sse = events.map(([event, data]) => `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`).join('');
  return new Response(sse, { status: 200, headers: { 'content-type': 'text/event-stream' } });
}

function openaiResponse(text: string, status = 'completed') {
  return Response.json({
    id: 'resp_1',
    object: 'response',
    created_at: 0,
    status,
    model: 'gpt-5.6-terra',
    incomplete_details: status === 'incomplete' ? { reason: 'max_output_tokens' } : null,
    output: [
      {
        type: 'message',
        id: 'msg_1',
        role: 'assistant',
        status,
        content: [{ type: 'output_text', text, annotations: [] }],
      },
    ],
    usage: { input_tokens: 150, output_tokens: 60, total_tokens: 210 },
  });
}

const platformError = (status: number, code: string) =>
  Response.json(
    { error: 'mensaje de la plataforma', code, field: null, debug: { message: code } },
    { status, headers: { 'x-should-retry': 'false' } },
  );

const request = (provider: 'anthropic' | 'openai', id: string): AiRequest => ({
  model: findModel(provider, id)!,
  account: OWNER,
  instruction: 'Añade pedidos',
  context,
});

describe('cliente de la pasarela', () => {
  const platformApi = 'https://qa-cuentas-api.yosiftware.es';

  it('llama a Anthropic con la credencial de Nodaria y la cuenta, con salida estructurada', async () => {
    const { impl, calls } = fakeFetch(() => anthropicStream(JSON.stringify(wire)));
    const ai = createGatewayAssistant({ platformApi, serviceTokenFile: tokenFile(), fetch: impl });
    const result = await ai.propose(request('anthropic', 'claude-sonnet-5-5'));
    expect(result).toEqual({ proposal, usage: { inputTokens: 200, outputTokens: 90 } });
    const [call] = calls;
    expect(call.url).toBe(`${platformApi}/v1/servicio/ia/anthropic/v1/messages`);
    expect(call.headers.get('x-api-key')).toBe('ys1.99.secreto-de-prueba');
    expect(call.headers.get('x-yosi-cuenta')).toBe(OWNER);
    expect(call.headers.get('user-agent')).toBe('nodaria-api/1.0');
    expect(call.body).toMatchObject({
      model: 'claude-sonnet-5-5',
      stream: true,
      output_config: { effort: 'high', format: { type: 'json_schema' } },
    });
    expect(call.body).not.toHaveProperty('tool_choice');
    expect(JSON.stringify(call.body.messages)).toContain('Añade pedidos');
  });

  it('llama a OpenAI por la ruta de respuestas, sin guardar el contenido en el proveedor', async () => {
    const { impl, calls } = fakeFetch(() => openaiResponse(JSON.stringify(wire)));
    const ai = createGatewayAssistant({ platformApi, serviceTokenFile: tokenFile(), fetch: impl });
    const result = await ai.propose(request('openai', 'gpt-5.6-terra'));
    expect(result).toEqual({ proposal, usage: { inputTokens: 150, outputTokens: 60 } });
    const [call] = calls;
    expect(call.url).toBe(`${platformApi}/v1/servicio/ia/openai/v1/responses`);
    expect(call.headers.get('authorization')).toBe('Bearer ys1.99.secreto-de-prueba');
    expect(call.headers.get('x-yosi-cuenta')).toBe(OWNER);
    expect(call.body).toMatchObject({
      model: 'gpt-5.6-terra',
      store: false,
      text: { format: { type: 'json_schema', strict: true } },
    });
  });

  it('trata la salida cortada como incompleta y no la devuelve', async () => {
    const half = JSON.stringify(wire).slice(0, 40);
    for (const [provider, id, response] of [
      ['anthropic', 'claude-haiku-5-5', () => anthropicStream(half, 'max_tokens')],
      ['openai', 'gpt-5.6-luna', () => openaiResponse(half, 'incomplete')],
    ] as const) {
      const ai = createGatewayAssistant({
        platformApi,
        serviceTokenFile: tokenFile(),
        fetch: fakeFetch(response).impl,
      });
      await expect(ai.propose(request(provider, id))).rejects.toMatchObject({
        code: 'propuesta_incompleta',
        statusCode: 422,
      });
    }
  });

  it('traduce los errores de la plataforma en los dos proveedores, sin reintentar', async () => {
    for (const [status, code, expected] of [
      [409, 'sin_clave_de_ia', { statusCode: 409, code: 'sin_clave_de_ia' }],
      [409, 'tope_sin_fijar', { statusCode: 409, code: 'tope_sin_fijar' }],
      [429, 'tope_de_gasto', { statusCode: 429, code: 'tope_de_gasto' }],
      [400, 'modelo_sin_tarifa', { statusCode: 400, code: 'modelo_sin_tarifa' }],
      [401, 'credencial_no_valida', { statusCode: 424, code: 'ia_no_disponible' }],
    ] as const) {
      for (const [provider, id] of [
        ['anthropic', 'claude-opus-5-5'],
        ['openai', 'gpt-5.6-sol'],
      ] as const) {
        const { impl, calls } = fakeFetch(() => platformError(status, code));
        const ai = createGatewayAssistant({ platformApi, serviceTokenFile: tokenFile(), fetch: impl });
        await expect(ai.propose(request(provider, id))).rejects.toMatchObject(expected);
        expect(calls).toHaveLength(1);
      }
    }
  });

  it('rechaza una respuesta que no cumple el esquema o pasa de los límites', async () => {
    const tooMany = { ...wire, operations: Array(201).fill(wire.operations[1]) };
    for (const text of ['no es json', JSON.stringify({ summary: 'x' }), JSON.stringify(tooMany)]) {
      const ai = createGatewayAssistant({
        platformApi,
        serviceTokenFile: tokenFile(),
        fetch: fakeFetch(() => anthropicStream(text)).impl,
      });
      await expect(ai.propose(request('anthropic', 'claude-sonnet-5-5'))).rejects.toMatchObject({
        code: 'propuesta_no_valida',
      });
    }
  });

  it('un error del propio proveedor no deja ver su detalle', async () => {
    const providerError = () =>
      Response.json(
        { type: 'error', error: { type: 'invalid_request_error', message: 'detalle interno' } },
        { status: 400 },
      );
    const ai = createGatewayAssistant({
      platformApi,
      serviceTokenFile: tokenFile(),
      fetch: fakeFetch(providerError).impl,
    });
    const error = await ai.propose(request('anthropic', 'claude-sonnet-5-5')).catch(e => e);
    expect(error).toBeInstanceOf(AiError);
    expect(error).toMatchObject({ code: 'proveedor_error', statusCode: 424 });
    expect(error.message).not.toContain('detalle interno');
    // El motivo queda para el registro del servidor.
    expect(error.detail).toContain('detalle interno');
  });

  it('una clave rechazada por el proveedor enlaza la gestión de claves', async () => {
    const rejected = () =>
      Response.json(
        { type: 'error', error: { type: 'authentication_error', message: 'invalid x-api-key' } },
        { status: 401 },
      );
    const ai = createGatewayAssistant({ platformApi, serviceTokenFile: tokenFile(), fetch: fakeFetch(rejected).impl });
    await expect(ai.propose(request('anthropic', 'claude-sonnet-5-5'))).rejects.toMatchObject({
      code: 'clave_rechazada',
      statusCode: 424,
    });
  });
});

describe('formato plano de la respuesta del modelo', () => {
  it('no lleva uniones, para que el proveedor pueda compilar su gramática', () => {
    // Anthropic rechazó la versión con uniones: «The compiled grammar is too large».
    expect(JSON.stringify(zodOutputFormat(wireProposalSchema).schema)).not.toMatch(/anyOf|oneOf/);
    expect(JSON.stringify(zodTextFormat(wireProposalSchema, 'propuesta'))).not.toMatch(/anyOf|oneOf/);
  });

  it('lee los tipos de SQL Server escritos como texto', () => {
    expect(parseSqlType('NVARCHAR(50)')).toEqual({ name: 'nvarchar', length: 50, precision: null, scale: null });
    expect(parseSqlType('varchar(max)')).toEqual({ name: 'varchar', length: 'max', precision: null, scale: null });
    expect(parseSqlType('decimal(10, 2)')).toEqual({ name: 'decimal', length: null, precision: 10, scale: 2 });
    expect(parseSqlType('datetime2(3)')).toEqual({ name: 'datetime2', length: null, precision: null, scale: 3 });
    expect(parseSqlType('int')).toEqual({ name: 'int', length: null, precision: null, scale: null });
    expect(parseSqlType('text')).toBeNull();
    expect(parseSqlType('int(4)')).toBeNull();
  });

  it('traduce cambios de columna y descarta, avisando, lo que no se puede traducir', () => {
    const result = fromWire({
      summary: '',
      operations: [
        {
          ...blank,
          op: 'update-column',
          table: 't1',
          column: 'email',
          changes: { ...noChanges, type: 'nvarchar(320)', nullable: 'no', description: 'Correo' },
          reason: '',
        },
        {
          ...blank,
          op: 'add-column',
          table: 't1',
          columns: [{ ...wire.operations[0].columns[0], type: 'texto' }],
          changes: noChanges,
          reason: '',
        },
        { ...blank, op: 'add-column', table: 't1', changes: noChanges, reason: '' },
      ],
      advice: [],
    });
    expect(result.operations).toEqual([
      {
        op: 'update-column',
        table: 't1',
        column: 'email',
        changes: {
          type: { name: 'nvarchar', length: 320, precision: null, scale: null },
          primaryKey: null,
          nullable: false,
          unique: null,
          identity: null,
          description: 'Correo',
        },
        reason: '',
      },
    ]);
    expect(result.advice).toEqual([
      'Se ha descartado la operación 2 (add-column): el tipo «texto» no es de SQL Server.',
      'Se ha descartado la operación 3 (add-column): añadir columna necesita exactamente una columna.',
    ]);
  });
});
