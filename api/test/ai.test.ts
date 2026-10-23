import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  AiError,
  createGatewayAssistant,
  type AiAssistant,
  type AiQuestion,
  type AiRequest,
} from '../src/ai/assistant.ts';
import { createMemoryConversationStore } from '../src/ai/conversations.ts';
import { conversationTurns } from '../src/ai/history.ts';
import { findModel } from '../src/ai/models.ts';
import type { AiDatabaseContext, AiProposal } from '../src/ai/schema.ts';
import { worldUserMessage, type AiWorldContext } from '../src/ai/world.ts';
import { fromWire, parseSqlType, wireProposalSchema, type WireProposal } from '../src/ai/wire.ts';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import { zodTextFormat } from 'openai/helpers/zod';
import { buildApp } from '../src/app.ts';
import { OTHER, OWNER, platformTokens, testDependencies } from './helpers/fakes.ts';

const context: AiDatabaseContext = {
  projectName: 'Tienda',
  tables: [
    {
      id: 't1',
      name: 'Cliente',
      typeName: 'Cliente',
      base: null,
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
  bases: [],
  preforms: [],
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
      base: null,
      engine: null,
      embedded: false,
      columns: [
        {
          name: 'id',
          type: { name: 'int', length: null, precision: null, scale: null },
          primaryKey: true,
          nullable: false,
          unique: false,
          identity: true,
          description: '',
          preform: null,
          docType: null,
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
      primaryKey: false,
      reason: 'Quién pide.',
    },
  ],
  advice: [],
};

const blank = {
  engine: '',
  embedded: false,
  many: false,
  table: '',
  ref: '',
  base: '',
  primaryKey: false,
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
        {
          name: 'id',
          type: 'int',
          primaryKey: true,
          nullable: false,
          unique: false,
          identity: true,
          description: '',
          preform: '',
        },
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
  projectId: 'project_tienda',
  refs: { tables: { t1: 'node_cliente' }, bases: {} },
  ...patch,
});

async function appWith(fake: Partial<AiAssistant>) {
  const tokens = await platformTokens();
  const conversations = createMemoryConversationStore();
  const unused = async () => Promise.reject(new Error('No se esperaba esta llamada a la IA'));
  const ai: AiAssistant = { propose: unused, ask: unused, ...fake };
  const deps = testDependencies({ auth: tokens.provider, ai, conversations });
  const app = await buildApp(deps);
  return { app, tokens, conversations, groups: deps.groups };
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
      keySource: 'personal',
      conversationId: 1,
      userMessageId: 1,
      messageId: 2,
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
      conversationId: 1,
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

describe('clave de IA del grupo', () => {
  it('en un proyecto del grupo usa su clave, salvo que la persona pida la suya', async () => {
    const seen: AiRequest[] = [];
    const { app, tokens, groups } = await appWith({
      propose: async request => {
        seen.push(request);
        return { proposal, usage: { inputTokens: 1, outputTokens: 1 } };
      },
    });
    const external = 'grupo-a1b2c3d4-0000-4000-8000-000000000009';
    await groups.beginCreate({ externalId: external, name: 'Equipo', createdBy: OWNER });
    await groups.completeCreate(
      external,
      { id: 321, idExterno: external, nombre: 'Equipo', entrada: 'invitacion', dosPasos: false, propietario: OWNER },
      'responsable',
    );
    const document = JSON.stringify({ id: 'p1', name: 'P', updatedAt: '2026-10-17T10:00:00.000Z' });
    await groups.attachProject(external, 1, {
      projectId: 'p1',
      name: 'P',
      document,
      updatedAt: '2026-10-17T10:00:00.000Z',
      by: OWNER,
    });
    const ask = async (patch: Record<string, unknown>, who = OWNER) =>
      app.inject({
        method: 'POST',
        url: '/api/ia/propuestas',
        headers: { authorization: `Bearer ${await tokens.sign({ sub: who })}` },
        payload: body({ projectId: 'p1', ...patch }),
      });
    expect((await ask({})).json()).toMatchObject({ keySource: 'grupo' });
    expect(seen[0].space).toBe(321);
    expect((await ask({ keySource: 'personal' })).json()).toMatchObject({ keySource: 'personal' });
    expect(seen[1].space).toBeUndefined();
    // Quien no es del grupo nunca usa su clave.
    await ask({}, OTHER);
    expect(seen[2].space).toBeUndefined();
  });

  it('llama con X-Yosi-Espacio y explica los errores del grupo', async () => {
    const { impl, calls } = fakeFetch(() => platformError(409, 'sin_clave_de_ia'));
    const ai = createGatewayAssistant({
      platformApi: 'https://qa-cuentas-api.yosiftware.es',
      serviceTokenFile: tokenFile(),
      fetch: impl,
    });
    await expect(ai.propose({ ...request('anthropic', 'claude-sonnet-5-5'), space: 321 })).rejects.toMatchObject({
      statusCode: 409,
      code: 'sin_clave_del_grupo',
    });
    expect(calls[0].headers.get('x-yosi-espacio')).toBe('321');
  });
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
          docType: null,
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

describe('historial de conversaciones', () => {
  async function setup() {
    const seen: AiRequest[] = [];
    let fail = false;
    const env = await appWith({
      propose: async request => {
        seen.push(request);
        if (fail) throw new AiError(429, 'tope_de_gasto', 'Tope alcanzado.');
        return { proposal, usage: { inputTokens: 10, outputTokens: 5 } };
      },
    });
    const owner = { authorization: `Bearer ${await env.tokens.sign()}` };
    const other = { authorization: `Bearer ${await env.tokens.sign({ sub: OTHER })}` };
    const inject = (
      method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE',
      url: string,
      headers = owner,
      payload?: object,
    ) => env.app.inject({ method, url, headers, ...(payload ? { payload } : {}) });
    return { ...env, seen, owner, other, inject, failNext: () => (fail = true) };
  }

  it('guarda la conversación y la sigue con los turnos anteriores resumidos', async () => {
    const t = await setup();
    const first = (await t.inject('POST', '/api/ia/propuestas', t.owner, body())).json();
    expect(t.seen[0].history).toEqual([]);
    expect(
      (await t.inject('PATCH', `/api/ia/mensajes/${first.messageId}`, t.owner, { applied: [0, 1] })).statusCode,
    ).toBe(200);
    await t.inject(
      'POST',
      '/api/ia/propuestas',
      t.owner,
      body({ conversationId: first.conversationId, instruction: 'Ahora añade el precio' }),
    );
    expect(t.seen[1].history).toEqual([
      { role: 'user', text: 'Añade pedidos de clientes' },
      {
        role: 'assistant',
        text: 'Propuse: Añade los pedidos.\nOperaciones: 1. crear la tabla Pedido (n1); 2. FK n1.id_cliente → t1\nLa persona aplicó las operaciones 1, 2; el esquema actual ya las incluye.',
      },
    ]);
    const list = (await t.inject('GET', '/api/ia/conversaciones?proyecto=project_tienda')).json();
    expect(list.conversations).toMatchObject([{ id: first.conversationId, title: 'Añade pedidos de clientes' }]);
    const full = (await t.inject('GET', `/api/ia/conversaciones/${first.conversationId}`)).json();
    expect(full.messages.map((m: { role: string }) => m.role)).toEqual(['user', 'assistant', 'user', 'assistant']);
    expect(full.messages[1].content).toMatchObject({
      proposal,
      applied: [0, 1],
      refs: { tables: { t1: 'node_cliente' } },
    });
  });

  it('guarda los errores y no los manda al modelo como turnos', async () => {
    const t = await setup();
    t.failNext();
    const failed = (await t.inject('POST', '/api/ia/propuestas', t.owner, body())).json();
    expect(failed).toMatchObject({ error: 'tope_de_gasto', conversationId: 1 });
    const full = (await t.inject('GET', '/api/ia/conversaciones/1')).json();
    expect(full.messages.map((m: { role: string; content: unknown }) => [m.role, m.content])).toEqual([
      ['user', { instruction: 'Añade pedidos de clientes' }],
      ['error', { code: 'tope_de_gasto', message: 'Tope alcanzado.' }],
    ]);
    expect(conversationTurns(full.messages)).toEqual([]);
  });

  it('cada cuenta solo ve, sigue y borra sus conversaciones', async () => {
    const t = await setup();
    const first = (await t.inject('POST', '/api/ia/propuestas', t.owner, body())).json();
    expect((await t.inject('GET', `/api/ia/conversaciones/${first.conversationId}`, t.other)).statusCode).toBe(404);
    expect((await t.inject('GET', '/api/ia/conversaciones?proyecto=project_tienda', t.other)).json()).toEqual({
      conversations: [],
    });
    expect((await t.inject('PATCH', `/api/ia/mensajes/${first.messageId}`, t.other, { applied: [] })).statusCode).toBe(
      404,
    );
    expect(
      (await t.inject('POST', '/api/ia/propuestas', t.other, body({ conversationId: first.conversationId })))
        .statusCode,
    ).toBe(404);
    // Otra conversación no se puede seguir desde otro proyecto.
    expect(
      (
        await t.inject(
          'POST',
          '/api/ia/propuestas',
          t.owner,
          body({ conversationId: first.conversationId, projectId: 'project_otro' }),
        )
      ).statusCode,
    ).toBe(404);
    expect((await t.inject('DELETE', `/api/ia/conversaciones/${first.conversationId}`, t.other)).statusCode).toBe(404);
    expect((await t.inject('DELETE', `/api/ia/conversaciones/${first.conversationId}`)).statusCode).toBe(200);
    expect((await t.inject('GET', `/api/ia/conversaciones/${first.conversationId}`)).statusCode).toBe(404);
  });

  it('borrar el proyecto borra sus conversaciones', async () => {
    const t = await setup();
    await t.inject('POST', '/api/ia/propuestas', t.owner, body());
    const document = {
      id: 'project_tienda',
      name: 'Tienda',
      updatedAt: '2026-10-16T10:00:00.000Z',
      schemas: [],
      nodes: [],
      relations: [],
    };
    expect(
      (await t.inject('PUT', '/api/projects/project_tienda', t.owner, { document, baseVersion: 0 })).statusCode,
    ).toBe(200);
    expect((await t.inject('DELETE', '/api/projects/project_tienda')).statusCode).toBe(200);
    expect(await t.conversations.list(1, 'project_tienda')).toEqual([]);
  });
});

/* ---------------- Preguntas sobre el mundo ---------------- */

const world: AiWorldContext = {
  projectName: 'Novela',
  today: '17 de octubre de 2026',
  partial: false,
  types: [{ name: 'Persona', kind: 'entidad', description: '', attributes: ['Nombre', 'Motivación'] }],
  nodes: [
    { id: 'n1', type: 'Persona', title: 'Ana', parent: null, values: { Motivación: 'Venganza' }, notes: '' },
    { id: 'n2', type: 'Persona', title: 'Luis', parent: null, values: {}, notes: 'Debe dinero a [[Ana]].' },
  ],
  relations: [{ type: 'Rival de', from: 'n1', to: 'n2', fromRole: '', toRole: '', values: {} }],
};
const answer = { answer: '[[n2]] no tiene motivación clara; [[n1]] sí.', cited: ['n2', 'n1'] };
const questionBody = (patch: Record<string, unknown> = {}) => ({
  provider: 'openai',
  model: 'gpt-5.6-terra',
  question: '¿Quién no tiene motivación clara?',
  context: world,
  projectId: 'project_novela',
  refs: { nodes: { n1: 'node_ana', n2: 'node_luis', n3: 'node_otro' } },
  ...patch,
});

describe('preguntas sobre el mundo', () => {
  it('responde, guarda la respuesta con los nodos citados y la recuerda en la conversación', async () => {
    const seen: AiQuestion[] = [];
    const t = await appWith({
      ask: async request => {
        seen.push(request);
        return { answer, usage: { inputTokens: 300, outputTokens: 40 } };
      },
    });
    const headers = { authorization: `Bearer ${await t.tokens.sign()}` };
    const first = await t.app.inject({ method: 'POST', url: '/api/ia/preguntas', headers, payload: questionBody() });
    expect(first.statusCode).toBe(200);
    expect(first.json()).toEqual({
      keySource: 'personal',
      conversationId: 1,
      userMessageId: 1,
      messageId: 2,
      answer,
      model: { provider: 'openai', id: 'gpt-5.6-terra', label: 'GPT-5.6 Terra' },
      usage: { inputTokens: 300, outputTokens: 40 },
      refs: { nodes: { n2: 'node_luis', n1: 'node_ana' } },
    });
    expect(seen[0]).toMatchObject({ account: OWNER, question: '¿Quién no tiene motivación clara?', history: [] });
    await t.app.inject({
      method: 'POST',
      url: '/api/ia/preguntas',
      headers,
      payload: questionBody({ conversationId: 1, question: '¿Y por qué?' }),
    });
    expect(seen[1].history).toEqual([
      { role: 'user', text: '¿Quién no tiene motivación clara?' },
      { role: 'assistant', text: answer.answer },
    ]);
    const full = (await t.app.inject({ method: 'GET', url: '/api/ia/conversaciones/1', headers })).json();
    expect(full.messages[0].content).toEqual({ instruction: '¿Quién no tiene motivación clara?', kind: 'pregunta' });
  });

  it('valida el contexto y la pregunta', async () => {
    const t = await appWith({ ask: async () => ({ answer, usage: { inputTokens: 0, outputTokens: 0 } }) });
    const headers = { authorization: `Bearer ${await t.tokens.sign()}` };
    const post = (payload: object) => t.app.inject({ method: 'POST', url: '/api/ia/preguntas', headers, payload });
    expect((await post(questionBody({ question: ' ' }))).statusCode).toBe(400);
    expect(
      (await post(questionBody({ context: { ...world, nodes: [{ ...world.nodes[0], id: 'Ana' }] } }))).statusCode,
    ).toBe(400);
    expect((await post(questionBody({ model: 'gpt-4o' }))).json()).toMatchObject({ error: 'modelo_no_admitido' });
  });

  it('acepta la agenda cuando la persona la permite y la pasa al modelo', async () => {
    const seen: AiQuestion[] = [];
    const t = await appWith({
      ask: async request => {
        seen.push(request);
        return { answer, usage: { inputTokens: 0, outputTokens: 0 } };
      },
    });
    const headers = { authorization: `Bearer ${await t.tokens.sign()}` };
    const post = (payload: object) => t.app.inject({ method: 'POST', url: '/api/ia/preguntas', headers, payload });
    const entry = {
      kind: 'Entrega',
      title: 'Capítulo 3',
      date: '2026-11-15',
      endDate: null,
      time: null,
      done: false,
      description: 'Revisar con [[Ana]]',
      nodes: ['n1'],
    };
    const agenda = { today: '2026-10-22', entries: [entry] };
    expect((await post(questionBody({ context: { ...world, agenda } }))).statusCode).toBe(200);
    expect(seen[0].context.agenda).toEqual(agenda);
    expect(worldUserMessage('¿Qué vence?', seen[0].context)).toContain('Capítulo 3');
    const broken = { ...agenda, entries: [{ ...entry, nodes: ['Ana'] }] };
    expect((await post(questionBody({ context: { ...world, agenda: broken } }))).statusCode).toBe(400);
  });

  it('pide a la pasarela la respuesta con salida estructurada y descarta citas mal formadas', async () => {
    const platformApi = 'https://qa-cuentas-api.yosiftware.es';
    const raw = JSON.stringify({ answer: ' Ana. ', cited: ['n1', 'n1', 'Ana'] });
    const base = {
      model: findModel('anthropic', 'claude-haiku-5-5')!,
      account: OWNER,
      question: '¿Quién?',
      context: world,
    };
    const anthropicCall = fakeFetch(() => anthropicStream(raw));
    const fromAnthropic = await createGatewayAssistant({
      platformApi,
      serviceTokenFile: tokenFile(),
      fetch: anthropicCall.impl,
    }).ask(base);
    expect(fromAnthropic.answer).toEqual({ answer: 'Ana.', cited: ['n1'] });
    expect(anthropicCall.calls[0].body).toMatchObject({
      max_tokens: 12000,
      output_config: { format: { type: 'json_schema' } },
    });
    expect(JSON.stringify(anthropicCall.calls[0].body.messages)).toContain('Debe dinero');
    const openaiCall = fakeFetch(() => openaiResponse(raw));
    await createGatewayAssistant({ platformApi, serviceTokenFile: tokenFile(), fetch: openaiCall.impl }).ask({
      ...base,
      model: findModel('openai', 'gpt-5.6-luna')!,
    });
    expect(openaiCall.calls[0].body).toMatchObject({
      store: false,
      text: { format: { name: 'respuesta', strict: true } },
    });
    const empty = fakeFetch(() => openaiResponse(JSON.stringify({ answer: '  ', cited: [] })));
    await expect(
      createGatewayAssistant({ platformApi, serviceTokenFile: tokenFile(), fetch: empty.impl }).ask({
        ...base,
        model: findModel('openai', 'gpt-5.6-luna')!,
      }),
    ).rejects.toMatchObject({ code: 'respuesta_no_valida' });
  });
});

describe('columnas sin tipo en la respuesta del modelo', () => {
  it('quitan solo la columna, no la tabla: sobra si una FK la crea y una preforma toma su tipo', () => {
    const col = wire.operations[0].columns[0];
    const result = fromWire({
      summary: '',
      operations: [
        {
          ...blank,
          op: 'create-table',
          ref: 'n1',
          name: 'Marca',
          columns: [col, { ...col, name: 'nombre', type: '', preform: 'nombre', primaryKey: false, identity: false }],
          changes: noChanges,
          reason: '',
        },
        {
          ...blank,
          op: 'create-table',
          ref: 'n2',
          name: 'Modelo',
          columns: [
            col,
            { ...col, name: 'id_marca', type: '', primaryKey: false, identity: false },
            { ...col, name: 'notas', type: 'texto', primaryKey: false, identity: false },
          ],
          changes: noChanges,
          reason: '',
        },
        {
          ...blank,
          op: 'add-foreign-key',
          table: 'n2',
          column: 'id_marca',
          references: 'n1',
          changes: noChanges,
          reason: '',
        },
      ],
      advice: [],
    });
    expect(result.operations.map(o => o.op)).toEqual(['create-table', 'create-table', 'add-foreign-key']);
    const [marca, modelo] = result.operations as Extract<AiProposal['operations'][number], { op: 'create-table' }>[];
    expect(marca.columns.map(c => [c.name, c.type?.name ?? null, c.preform])).toEqual([
      ['id', 'int', null],
      ['nombre', null, 'nombre'],
    ]);
    expect(modelo.columns.map(c => c.name)).toEqual(['id']);
    expect(result.advice).toEqual([
      'Se ha quitado la columna «notas» de «Modelo»: el tipo «texto» no es de SQL Server.',
    ]);
  });
});

describe('colecciones de documentos en la propuesta', () => {
  const col = {
    name: '',
    type: '',
    primaryKey: false,
    nullable: false,
    unique: false,
    identity: false,
    description: '',
    preform: '',
  };
  it('traduce una colección, un subdocumento y llevarlo dentro', () => {
    const result = fromWire({
      summary: 'Pedidos con sus líneas.',
      operations: [
        {
          ...blank,
          op: 'create-table',
          ref: 'n1',
          name: 'pedidos',
          engine: 'MongoDB',
          columns: [
            { ...col, name: 'fecha', type: 'date' },
            { ...col, name: 'total', type: 'decimal' },
            { ...col, name: 'estado', type: 'string' },
          ],
          changes: noChanges,
          reason: '',
        },
        {
          ...blank,
          op: 'create-table',
          ref: 'n2',
          name: 'linea',
          engine: 'mongodb',
          embedded: true,
          columns: [{ ...col, name: 'cantidad', type: 'int' }],
          changes: noChanges,
          reason: '',
        },
        {
          ...blank,
          op: 'embed',
          table: 'n1',
          column: 'lineas',
          references: 'n2',
          many: true,
          changes: noChanges,
          reason: '',
        },
      ],
      advice: [],
    });
    expect(result.advice).toEqual([]);
    const [pedidos, linea, embed] = result.operations as never[] as Record<string, unknown>[];
    expect(pedidos).toMatchObject({ engine: 'mongodb', embedded: false });
    // «date» y «decimal» son también de SQL Server: van como tipo SQL, y «string», como tipo de documento.
    expect(
      (pedidos.columns as Record<string, unknown>[]).map(c => [
        c.name,
        (c.type as { name: string } | null)?.name ?? null,
        c.docType,
      ]),
    ).toEqual([
      ['fecha', 'date', null],
      ['total', 'decimal', null],
      ['estado', null, 'string'],
    ]);
    expect(linea).toMatchObject({ engine: 'mongodb', embedded: true });
    expect(embed).toEqual({
      op: 'embed',
      table: 'n1',
      column: 'lineas',
      references: 'n2',
      many: true,
      nullable: false,
      reason: '',
    });
  });

  it('el contexto admite colecciones y subdocumentos, y el de antes sigue valiendo', async () => {
    const { contextSchema } = await import('../src/ai/schema.ts');
    expect(contextSchema.safeParse(context).success).toBe(true);
    const withDocs = {
      ...context,
      tables: context.tables.map(t => ({ ...t, engine: 'mongodb' as const })),
      subdocuments: [{ id: 's1', name: 'linea', engine: 'mongodb' as const, description: '', columns: [] }],
    };
    expect(contextSchema.safeParse(withDocs).success).toBe(true);
  });
});
