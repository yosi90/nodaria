import { describe, expect, it } from 'vitest';
import {
  AI_BODY_LIMIT,
  AI_CONTEXT_BUDGET,
  AI_INSTRUCTION_MAX as API_INSTRUCTION_MAX,
  AI_MAX_COLUMNS as API_MAX_COLUMNS,
  AI_MAX_OPERATIONS as API_MAX_OPERATIONS,
  contextSchema,
  DOC_TYPES as API_DOC_TYPES,
  refsSchema,
  SQL_TYPES as API_SQL_TYPES,
} from '../api/src/ai/schema.ts';
import { worldContextSchema, worldRefsSchema } from '../api/src/ai/world.ts';
import {
  PUBLIC_DESCRIPTION_MAX as API_PUBLIC_DESCRIPTION_MAX,
  REPORT_REASONS as API_REPORT_REASONS,
  REPORT_TEXT_MAX as API_REPORT_TEXT_MAX,
} from '../api/src/community/model.ts';
import { PUBLIC_ID as API_PUBLIC_ID } from '../api/src/community/repository.ts';
import {
  COMMENT_MAX as API_COMMENT_MAX,
  GROUP_NAME_MAX as API_GROUP_NAME_MAX,
  ROLE_LABEL_MAX as API_ROLE_LABEL_MAX,
  ROLES,
  SCHEMA_KEYS as API_SCHEMA_KEYS,
} from '../api/src/groups/model.ts';
import { PROJECT_NAME_MAX as API_PROJECT_NAME_MAX } from '../api/src/routes/projects.ts';
import { AI_INSTRUCTION_MAX, databaseContext, databaseContextProblem } from '../src/domain/aiContext';
import { AI_MAX_COLUMNS, AI_MAX_OPERATIONS } from '../src/domain/aiProposal';
import { AI_BODY_BUDGET, jsonBytes, WORLD_BUDGET, worldContext } from '../src/domain/aiWorld';
import { createAgendaEntry } from '../src/domain/agenda';
import { SQL_TYPES } from '../src/domain/database';
import { DOC_TYPES } from '../src/domain/dbEngines';
import { PROJECT_NAME_MAX } from '../src/domain/factories';
import type { Project } from '../src/domain/types';
import {
  PUBLIC_DESCRIPTION_MAX,
  PUBLIC_ID,
  publicIdFromPath,
  REPORT_REASONS,
  REPORT_TEXT_MAX,
} from '../src/services/community';
import { COMMENT_MAX, GROUP_NAME_MAX, ROLE_LABEL_MAX, ROLE_LABELS, SCHEMA_KEYS } from '../src/services/groups';
import { field, node, project, relation, schema } from '../src/test/fixtures';

/*
 * Lo que la web y la API copian a propósito, porque no comparten paquete (bugs.md, E-01): los contratos de
 * la IA y las constantes de dominio. Si una parte cambia y la otra no, esta prueba falla. La pasa la suite
 * de la raíz (`npm test`).
 */

describe('constantes copiadas entre la web y la API', () => {
  it('coinciden', () => {
    expect(SQL_TYPES).toEqual(API_SQL_TYPES);
    expect(DOC_TYPES.mongodb).toEqual(API_DOC_TYPES.mongodb);
    expect(DOC_TYPES.firestore).toEqual(API_DOC_TYPES.firestore);
    expect([AI_MAX_OPERATIONS, AI_MAX_COLUMNS]).toEqual([API_MAX_OPERATIONS, API_MAX_COLUMNS]);
    expect(WORLD_BUDGET).toBe(AI_CONTEXT_BUDGET);
    expect(AI_INSTRUCTION_MAX).toBe(API_INSTRUCTION_MAX);
    expect(PROJECT_NAME_MAX).toBe(API_PROJECT_NAME_MAX);
    expect(REPORT_REASONS).toEqual(API_REPORT_REASONS);
    expect([PUBLIC_DESCRIPTION_MAX, REPORT_TEXT_MAX]).toEqual([API_PUBLIC_DESCRIPTION_MAX, API_REPORT_TEXT_MAX]);
    expect(PUBLIC_ID.source).toBe(API_PUBLIC_ID.source);
    expect(publicIdFromPath('/p/abcDEF123_-x')).toBe('abcDEF123_-x');
    expect(publicIdFromPath('/p/corto')).toBeNull();
    expect([GROUP_NAME_MAX, ROLE_LABEL_MAX, COMMENT_MAX]).toEqual([
      API_GROUP_NAME_MAX,
      API_ROLE_LABEL_MAX,
      API_COMMENT_MAX,
    ]);
    expect(ROLE_LABELS).toEqual(Object.fromEntries(ROLES.map(r => [r.clave, r.nombre])));
    expect(SCHEMA_KEYS).toEqual(API_SCHEMA_KEYS);
  });

  it('el cuerpo que deja la web cabe en el que admite la API, con la petición más larga', () => {
    // Cada carácter de la petición puede ocupar hasta 3 bytes en UTF-8, y van también el modelo y la conversación.
    expect(AI_BODY_BUDGET + AI_INSTRUCTION_MAX * 3 + 4096).toBeLessThanOrEqual(AI_BODY_LIMIT);
  });
});

const long = (text: string, length: number) => text.repeat(Math.ceil(length / text.length)).slice(0, length);

/** Un mundo con todo lo que se recorta: nombres, notas y listas largas, acentos, muchos nodos y la agenda. */
function bigWorld(): Project {
  const nodes = Array.from({ length: 6000 }, (_, i) => ({
    ...node(`n${i}`, 'persona', i > 0 && i % 7 === 0 ? `n${i - 1}` : null, {
      nombre: `Persona ${i} ${long('ñá', 40)}`,
      alias: Array.from({ length: 40 }, (__, j) => long(`alias-${j}-`, 120)),
      pasos: Array.from({ length: 80 }, (__, j) => `paso ${j} ${long('é', 60)}`),
      amigos: [`n${(i + 1) % 6000}`, `n${(i + 2) % 6000}`],
      jefe: `n${(i + 3) % 6000}`,
    }),
    notes: i % 3 ? long('Una nota con acentos: áéíóú. ', 9000) : '',
  }));
  return project({
    name: long('Mundo ', 260),
    schemas: [
      schema('persona', {
        name: long('Persona ', 260),
        description: long('Descripción ', 3000),
        fields: [
          field('nombre', { label: 'Nombre', isTitle: true }),
          field('alias', { label: long('Alias ', 260), type: 'tags' }),
          field('pasos', { label: 'Pasos', type: 'list' }),
          field('amigos', { label: 'Amigos', type: 'nodeRefs' }),
          field('jefe', { label: 'Jefe', type: 'nodeRef' }),
        ],
      }),
      schema('rival', { name: 'Rival de' }, 'relationship'),
    ],
    nodes,
    relations: Array.from({ length: 21_000 }, (_, i) =>
      relation(`r${i}`, 'rival', `n${i % 6000}`, `n${(i * 7 + 1) % 6000}`),
    ),
    agenda: Array.from({ length: 600 }, (_, i) =>
      createAgendaEntry(
        `e${i}`,
        {
          kind: 'task',
          title: long('Tarea ', 600),
          date: '2026-11-15',
          description: long('Hacer [[Persona 1]] ', 1500),
          nodeIds: Array.from({ length: 250 }, (__, j) => `n${j}`),
        },
        'x',
      ),
    ),
  });
}

describe('contexto del mundo para la IA', () => {
  it('lo que manda la web lo acepta la API tal cual, y cabe en el cuerpo', () => {
    const { context, refs } = worldContext(bigWorld(), undefined, { includeAgenda: true });
    expect(context.partial).toBe(true);
    expect(worldContextSchema.parse(context)).toEqual(context);
    expect(worldRefsSchema.parse(refs)).toEqual(refs);
    expect(JSON.stringify(context).length).toBeLessThanOrEqual(AI_CONTEXT_BUDGET);
    expect(jsonBytes({ context, refs })).toBeLessThanOrEqual(AI_BODY_BUDGET);
  });
});

/** Un esquema con tablas, una base, colecciones, un subdocumento y textos largos. */
function bigSchema(): Project {
  const int = {
    type: { name: 'int' as const, length: null, precision: null, scale: null },
    primaryKey: true,
    nullable: false,
    unique: false,
    identity: true,
    excluded: false,
  };
  return project({
    name: 'Tienda',
    fieldLibrary: [
      field('titulo', { isTitle: true }),
      field('id', { type: 'number', sql: int, description: long('Clave ', 3000) }),
      field(long('preforma-larga-', 200), { label: long('Preforma ', 200) }),
    ],
    schemas: [
      schema('base', { isAbstract: true, table: true, fields: [{ ref: 'titulo' }, { ref: 'id' }] }),
      ...Array.from({ length: 30 }, (_, i) =>
        schema(`t${i}`, {
          name: `Tabla ${i}`,
          parentTypeId: 'base',
          description: long('Una tabla con una descripción muy larga. ', 3000),
          fields: [
            field(`ref${i}`, {
              type: 'nodeRef',
              referenceTypeIds: [`t${(i + 1) % 30}`],
              description: long('Ref ', 2500),
            }),
            ...Array.from({ length: 20 }, (__, j) => field(`c${i}_${j}`, { label: `Columna ${j}` })),
          ],
        }),
      ),
      schema('pedidos', {
        name: 'Pedidos',
        table: true,
        dbEngine: 'mongodb',
        description: long('Colección ', 2500),
        fields: [
          field('titulo_p', { isTitle: true }),
          field('lineas', { type: 'nodeRefs', referenceTypeIds: ['linea'] }),
        ],
      }),
      schema('linea', {
        name: 'Línea',
        table: true,
        dbEngine: 'mongodb',
        embedded: true,
        fields: [field('cantidad', { type: 'number' })],
      }),
    ],
    nodes: [
      ...Array.from({ length: 30 }, (_, i) =>
        node(`n${i}`, `t${i}`, null, { titulo: `Tabla ${i}`, [`ref${i}`]: `n${(i + 1) % 30}` }),
      ),
      node('np', 'pedidos', null, { titulo_p: 'Pedidos' }),
    ],
  });
}

describe('contexto del esquema para la IA', () => {
  it('lo que manda la web lo acepta la API tal cual, o la web lo avisa antes', () => {
    const { context, refs } = databaseContext(bigSchema());
    expect(context.tables.length).toBeGreaterThan(30);
    expect(databaseContextProblem(context, refs)).toBeNull();
    expect(contextSchema.parse(context)).toEqual(context);
    expect(refsSchema.parse(refs)).toEqual(refs);
  });

  it('un nombre que la API no admitiría se avisa, no se manda', () => {
    const p = bigSchema();
    const tooLong = {
      ...p,
      nodes: p.nodes.map(n => (n.id === 'n0' ? { ...n, values: { ...n.values, titulo: long('X', 250) } } : n)),
    };
    const { context, refs } = databaseContext(tooLong);
    expect(databaseContextProblem(context, refs)).toMatch(/demasiado largo/);
    expect(contextSchema.safeParse(context).success).toBe(false);
  });
});
