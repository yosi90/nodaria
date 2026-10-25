import { z } from 'zod';

/*
 * Contrato de la asistencia de IA para esquemas de base de datos. Copia del de la web
 * (`src/domain/aiContext.ts` y `src/domain/aiProposal.ts`): si cambia uno, cambia el otro.
 *
 * El contexto es lo que manda el navegador; se limita en tamaño y forma. La propuesta es lo que
 * debe devolver el modelo: se usa como esquema de las salidas estructuradas de cada proveedor, así
 * que no lleva límites numéricos ni de longitud (no se admiten ahí). Los límites se comprueban
 * después (`checkProposalLimits`) y la web vuelve a validar el significado de cada operación.
 */

export const SQL_TYPES = [
  'int',
  'bigint',
  'smallint',
  'tinyint',
  'bit',
  'decimal',
  'numeric',
  'float',
  'money',
  'char',
  'varchar',
  'nchar',
  'nvarchar',
  'varbinary',
  'date',
  'time',
  'datetime',
  'datetime2',
  'uniqueidentifier',
] as const;

/**
 * Tipos de campo de las bases de documentos (los de `src/domain/dbEngines.ts`, `DOC_TYPES`): en una colección o
 * un subdocumento, una columna lleva uno de estos en lugar de un tipo SQL.
 */
export const DOC_TYPES = {
  mongodb: [
    'string',
    'number',
    'int',
    'long',
    'double',
    'decimal',
    'bool',
    'date',
    'objectId',
    'array',
    'object',
    'binData',
  ],
  firestore: ['string', 'number', 'int', 'boolean', 'timestamp', 'reference', 'array', 'map', 'geopoint', 'bytes'],
} as const;
export const ALL_DOC_TYPES = [...new Set([...DOC_TYPES.mongodb, ...DOC_TYPES.firestore])];

const text = (max: number) => z.string().max(max);

const columnContext = z.object({
  name: text(128),
  type: text(40),
  primaryKey: z.boolean(),
  nullable: z.boolean(),
  unique: z.boolean(),
  identity: z.boolean(),
  references: text(16).nullable(),
  /** En una colección o un subdocumento: el subdocumento que lleva dentro (`s1`…) y si es una lista. */
  embeds: text(16).nullable().optional(),
  many: z.boolean().optional(),
  origin: text(200),
  description: text(2000),
});

/** Las bases de cada tabla: las relacionales y las de documentos (colecciones). */
const engine = z.enum(['sqlserver', 'db2i', 'mongodb', 'firestore']);

export const contextSchema = z.object({
  projectName: text(200),
  tables: z
    .array(
      z.object({
        id: z.string().regex(/^t\d{1,4}$/),
        name: text(200),
        typeName: text(200),
        base: text(16).nullable(),
        description: text(2000),
        sharesColumnsWith: z.array(text(16)).max(500),
        partial: z.boolean(),
        /** Sin él, SQL Server (lo que mandaban las versiones anteriores de la web). */
        engine: engine.optional(),
        columns: z.array(columnContext).max(300),
      }),
    )
    .max(500),
  /** Los subdocumentos: van dentro de las colecciones, sin colección propia. */
  subdocuments: z
    .array(
      z.object({
        id: z.string().regex(/^s\d{1,4}$/),
        name: text(200),
        engine: z.enum(['mongodb', 'firestore']),
        description: text(2000),
        columns: z.array(columnContext).max(300),
      }),
    )
    .max(500)
    .optional(),
  bases: z
    .array(
      z.object({
        id: z.string().regex(/^b\d{1,4}$/),
        name: text(200),
        base: text(16).nullable(),
        columns: z.array(columnContext).max(300),
        tables: z.number().int().min(0),
      }),
    )
    .max(200),
  preforms: z
    .array(
      z.object({
        name: text(128),
        type: text(40),
        reference: z.boolean(),
        primaryKey: z.boolean(),
        nullable: z.boolean(),
        description: text(2000),
      }),
    )
    .max(500),
  issues: z.array(text(500)).max(50),
});
export type AiDatabaseContext = z.infer<typeof contextSchema>;

const sqlDataType = z.object({
  name: z.enum(SQL_TYPES),
  length: z.union([z.number(), z.literal('max')]).nullable(),
  precision: z.number().nullable(),
  scale: z.number().nullable(),
});
export type SqlDataType = z.infer<typeof sqlDataType>;

const columnSpec = z.object({
  name: z.string(),
  /** `null` solo con una preforma: la columna toma el tipo de la preforma. */
  type: sqlDataType.nullable(),
  primaryKey: z.boolean(),
  nullable: z.boolean(),
  unique: z.boolean(),
  identity: z.boolean(),
  description: z.string(),
  preform: z.string().nullable(),
  /** En una colección o un subdocumento: su tipo de documento (`type` va entonces vacío). */
  docType: z.string().nullable(),
});

const columnChanges = z.object({
  type: sqlDataType.nullable(),
  primaryKey: z.boolean().nullable(),
  nullable: z.boolean().nullable(),
  unique: z.boolean().nullable(),
  identity: z.boolean().nullable(),
  description: z.string().nullable(),
  docType: z.string().nullable(),
});

const reason = z.string();

export const operationSchema = z.discriminatedUnion('op', [
  z.object({
    op: z.literal('create-table'),
    ref: z.string(),
    name: z.string(),
    description: z.string(),
    base: z.string().nullable(),
    /** Una colección de documentos (`null` = una tabla como las demás del proyecto). */
    engine: z.enum(['mongodb', 'firestore']).nullable(),
    /** Un subdocumento: va dentro de otra colección (con `embed`), sin colección propia. */
    embedded: z.boolean(),
    columns: z.array(columnSpec),
    reason,
  }),
  z.object({ op: z.literal('rename-table'), table: z.string(), name: z.string(), reason }),
  z.object({ op: z.literal('delete-table'), table: z.string(), reason }),
  z.object({ op: z.literal('add-column'), table: z.string(), column: columnSpec, reason }),
  z.object({ op: z.literal('update-column'), table: z.string(), column: z.string(), changes: columnChanges, reason }),
  z.object({ op: z.literal('rename-column'), table: z.string(), column: z.string(), name: z.string(), reason }),
  z.object({ op: z.literal('delete-column'), table: z.string(), column: z.string(), reason }),
  z.object({
    op: z.literal('add-foreign-key'),
    table: z.string(),
    column: z.string(),
    references: z.string(),
    nullable: z.boolean(),
    primaryKey: z.boolean(),
    reason,
  }),
  /** Lleva un subdocumento dentro de una colección (o de otro subdocumento): un objeto, o una lista con `many`. */
  z.object({
    op: z.literal('embed'),
    table: z.string(),
    column: z.string(),
    references: z.string(),
    many: z.boolean(),
    nullable: z.boolean(),
    reason,
  }),
]);

export const proposalSchema = z.object({
  summary: z.string(),
  operations: z.array(operationSchema),
  advice: z.array(z.string()),
});
export type AiProposal = z.infer<typeof proposalSchema>;

export const AI_MAX_OPERATIONS = 200;
export const AI_MAX_COLUMNS = 150;
const AI_MAX_TEXT = 4000;

/** Límites que el esquema de salida no puede expresar. Devuelve el motivo del rechazo, o `null`. */
export function checkProposalLimits(proposal: AiProposal): string | null {
  if (proposal.operations.length > AI_MAX_OPERATIONS) return `La propuesta pasa de ${AI_MAX_OPERATIONS} operaciones.`;
  if (proposal.advice.length > 50) return 'La propuesta trae demasiadas recomendaciones.';
  const texts = [proposal.summary, ...proposal.advice, ...proposal.operations.map(o => o.reason)];
  if (texts.some(t => t.length > AI_MAX_TEXT)) return 'La propuesta trae textos demasiado largos.';
  if (proposal.operations.some(o => o.op === 'create-table' && o.columns.length > AI_MAX_COLUMNS))
    return `Una tabla nueva pasa de ${AI_MAX_COLUMNS} columnas.`;
  return null;
}
