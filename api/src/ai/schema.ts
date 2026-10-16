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

const text = (max: number) => z.string().max(max);

const columnContext = z.object({
  name: text(128),
  type: text(40),
  primaryKey: z.boolean(),
  nullable: z.boolean(),
  unique: z.boolean(),
  identity: z.boolean(),
  references: text(16).nullable(),
  origin: text(200),
  description: text(2000),
});

export const contextSchema = z.object({
  projectName: text(200),
  tables: z
    .array(
      z.object({
        id: z.string().regex(/^t\d{1,4}$/),
        name: text(200),
        typeName: text(200),
        description: text(2000),
        sharesColumnsWith: z.array(text(16)).max(500),
        partial: z.boolean(),
        columns: z.array(columnContext).max(300),
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

const columnSpec = z.object({
  name: z.string(),
  type: sqlDataType,
  primaryKey: z.boolean(),
  nullable: z.boolean(),
  unique: z.boolean(),
  identity: z.boolean(),
  description: z.string(),
});

const columnChanges = z.object({
  type: sqlDataType.nullable(),
  primaryKey: z.boolean().nullable(),
  nullable: z.boolean().nullable(),
  unique: z.boolean().nullable(),
  identity: z.boolean().nullable(),
  description: z.string().nullable(),
});

const reason = z.string();

export const operationSchema = z.discriminatedUnion('op', [
  z.object({
    op: z.literal('create-table'),
    ref: z.string(),
    name: z.string(),
    description: z.string(),
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
