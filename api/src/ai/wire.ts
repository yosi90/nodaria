import { z } from 'zod';
import { SQL_TYPES, type AiProposal } from './schema.ts';

/*
 * Formato que se pide al modelo. Es plano a propósito: una sola forma de operación con todos sus
 * campos (los que no usa su `op` van vacíos) y el tipo SQL como texto. Con una unión de operaciones
 * y campos que admiten null, Anthropic rechaza el esquema de la salida estructurada («The compiled
 * grammar is too large»). Aquí se traduce a la propuesta de siempre (`schema.ts`), que es la que
 * recibe la web; lo que no se puede traducir se descarta y se avisa en las recomendaciones.
 */

const wireColumn = z.object({
  name: z.string(),
  /** «int», «nvarchar(50)», «nvarchar(max)», «decimal(10,2)», «datetime2(3)». */
  type: z.string(),
  primaryKey: z.boolean(),
  nullable: z.boolean(),
  unique: z.boolean(),
  identity: z.boolean(),
  description: z.string(),
  /** Preforma que se vincula en lugar de crear la columna; vacío = columna nueva. */
  preform: z.string(),
});

/** «si», «no» o vacío (no cambia). */
const flag = z.string();

export const wireOperationSchema = z.object({
  op: z.enum([
    'create-table',
    'rename-table',
    'delete-table',
    'add-column',
    'update-column',
    'rename-column',
    'delete-column',
    'add-foreign-key',
  ]),
  table: z.string(),
  ref: z.string(),
  /** Base de la que hereda una tabla nueva (`b1`…); vacío = ninguna. */
  base: z.string(),
  name: z.string(),
  description: z.string(),
  column: z.string(),
  references: z.string(),
  nullable: z.boolean(),
  /** En una clave foránea, si forma parte de la clave primaria (tablas intermedias). */
  primaryKey: z.boolean(),
  columns: z.array(wireColumn),
  changes: z.object({
    type: z.string(),
    primaryKey: flag,
    nullable: flag,
    unique: flag,
    identity: flag,
    description: z.string(),
  }),
  reason: z.string(),
});

export const wireProposalSchema = z.object({
  summary: z.string(),
  operations: z.array(wireOperationSchema),
  advice: z.array(z.string()),
});
export type WireProposal = z.infer<typeof wireProposalSchema>;
type WireOperation = WireProposal['operations'][number];
type SqlType = {
  name: (typeof SQL_TYPES)[number];
  length: number | 'max' | null;
  precision: number | null;
  scale: number | null;
};
type Operation = AiProposal['operations'][number];

const LENGTH = new Set(['char', 'varchar', 'nchar', 'nvarchar', 'varbinary']);
const PRECISION = new Set(['decimal', 'numeric']);
const TIME_SCALE = new Set(['time', 'datetime2']);

/** Tipo SQL Server escrito como texto, o `null` si no lo es. La web comprueba después los rangos. */
export function parseSqlType(text: string): SqlType | null {
  const match = text
    .trim()
    .toLowerCase()
    .match(/^([a-z][a-z0-9]*)\s*(?:\(\s*(max|\d+)\s*(?:,\s*(\d+)\s*)?\))?$/);
  if (!match || !(SQL_TYPES as readonly string[]).includes(match[1])) return null;
  const name = match[1] as SqlType['name'];
  const first = match[2];
  const second = match[3] === undefined ? null : Number(match[3]);
  if (LENGTH.has(name)) {
    if (second !== null) return null;
    return { name, length: first === 'max' ? 'max' : first ? Number(first) : null, precision: null, scale: null };
  }
  if (first === 'max') return null;
  if (PRECISION.has(name))
    return { name, length: null, precision: first ? Number(first) : null, scale: first ? (second ?? 0) : null };
  if (TIME_SCALE.has(name)) {
    if (second !== null) return null;
    return { name, length: null, precision: null, scale: first ? Number(first) : null };
  }
  return first ? null : { name, length: null, precision: null, scale: null };
}

class Untranslatable extends Error {}

function sqlType(text: string): SqlType {
  const type = parseSqlType(text);
  if (!type) throw new Untranslatable(`el tipo «${text}» no es de SQL Server`);
  return type;
}

function flagValue(value: string): boolean | null {
  const clean = value.trim().toLowerCase();
  if (clean === 'si' || clean === 'sí' || clean === 'true') return true;
  if (clean === 'no' || clean === 'false') return false;
  return null;
}

const column = (c: WireOperation['columns'][number]) => ({
  name: c.name,
  type: sqlType(c.type),
  primaryKey: c.primaryKey,
  nullable: c.nullable,
  unique: c.unique,
  identity: c.identity,
  description: c.description,
  preform: c.preform.trim() || null,
});

function translate(o: WireOperation): Operation {
  const { table, reason } = o;
  switch (o.op) {
    case 'create-table':
      return {
        op: o.op,
        ref: o.ref,
        name: o.name,
        description: o.description,
        base: o.base.trim() || null,
        columns: o.columns.map(column),
        reason,
      };
    case 'rename-table':
      return { op: o.op, table, name: o.name, reason };
    case 'delete-table':
      return { op: o.op, table, reason };
    case 'add-column':
      if (o.columns.length !== 1) throw new Untranslatable('añadir columna necesita exactamente una columna');
      return { op: o.op, table, column: column(o.columns[0]), reason };
    case 'update-column':
      return {
        op: o.op,
        table,
        column: o.column,
        changes: {
          type: o.changes.type.trim() ? sqlType(o.changes.type) : null,
          primaryKey: flagValue(o.changes.primaryKey),
          nullable: flagValue(o.changes.nullable),
          unique: flagValue(o.changes.unique),
          identity: flagValue(o.changes.identity),
          description: o.changes.description.trim() ? o.changes.description : null,
        },
        reason,
      };
    case 'rename-column':
      return { op: o.op, table, column: o.column, name: o.name, reason };
    case 'delete-column':
      return { op: o.op, table, column: o.column, reason };
    case 'add-foreign-key':
      return {
        op: o.op,
        table,
        column: o.column,
        references: o.references,
        nullable: o.nullable,
        primaryKey: o.primaryKey,
        reason,
      };
  }
}

/** Traduce la respuesta del modelo a la propuesta que recibe la web. */
export function fromWire(wire: WireProposal): AiProposal {
  const advice = [...wire.advice];
  const operations: Operation[] = [];
  wire.operations.forEach((o, i) => {
    try {
      operations.push(translate(o));
    } catch (error) {
      if (!(error instanceof Untranslatable)) throw error;
      advice.push(`Se ha descartado la operación ${i + 1} (${o.op}): ${error.message}.`);
    }
  });
  return { summary: wire.summary, operations, advice };
}
