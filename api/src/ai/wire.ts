import { z } from 'zod';
import { ALL_DOC_TYPES, SQL_TYPES, type AiProposal } from './schema.ts';

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
    'embed',
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
  /** En una tabla nueva: «mongodb» o «firestore» para una colección; vacío, una tabla como las demás. */
  engine: z.string(),
  /** En una tabla nueva de documentos: es un subdocumento (va dentro de otra, con «embed»). */
  embedded: z.boolean(),
  /** En «embed»: el subdocumento va en una lista. */
  many: z.boolean(),
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

/** Un tipo de documento escrito como texto («string», «objectId»…), o `null` si no lo es. */
export function parseDocType(text: string): string | null {
  const clean = text.trim();
  return (ALL_DOC_TYPES as readonly string[]).find(t => t.toLowerCase() === clean.toLowerCase()) ?? null;
}

const documentEngine = (text: string) => {
  const clean = text.trim().toLowerCase();
  return clean === 'mongodb' || clean === 'firestore' ? clean : null;
};

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

type WireColumn = WireOperation['columns'][number];

const column = (c: WireColumn) => {
  const preform = c.preform.trim() || null;
  // En una colección o un subdocumento, el tipo es de documento: la web comprueba que vale en su base.
  const docType = parseSqlType(c.type) ? null : parseDocType(c.type);
  return {
    name: c.name,
    // Una columna de preforma toma el tipo de la preforma: el modelo suele dejarlo vacío.
    // «int» o «date» valen en los dos: el tipo SQL va si lo es, y el de documento, aparte.
    type: preform && !c.type.trim() ? null : (parseSqlType(c.type) ?? (docType ? null : sqlType(c.type))),
    docType,
    primaryKey: c.primaryKey,
    nullable: c.nullable,
    unique: c.unique,
    identity: c.identity,
    description: c.description,
    preform,
  };
};

/**
 * Las columnas que se pueden traducir. Una que no (sin tipo o con un tipo que no es de SQL Server) se
 * quita sola, sin perder la tabla: si una clave foránea posterior de la misma propuesta crea esa
 * columna (`fks`), sobra sin más; si no, se avisa en `advice`.
 */
function columnsOf(o: WireOperation, fks: Set<string>, advice: string[]) {
  return o.columns.flatMap(c => {
    try {
      return [column(c)];
    } catch (error) {
      if (!(error instanceof Untranslatable)) throw error;
      if (!fks.has(fkKey(o.ref || o.table, c.name)))
        advice.push(`Se ha quitado la columna «${c.name}» de «${o.name || o.table}»: ${error.message}.`);
      return [];
    }
  });
}

const fkKey = (table: string, column: string) => `${table.trim()}|${column.trim().toLowerCase()}`;

function translate(o: WireOperation, fks: Set<string>, advice: string[]): Operation {
  const { table, reason } = o;
  switch (o.op) {
    case 'create-table':
      return {
        op: o.op,
        ref: o.ref,
        name: o.name,
        description: o.description,
        base: o.base.trim() || null,
        engine: documentEngine(o.engine),
        embedded: o.embedded,
        columns: columnsOf(o, fks, advice),
        reason,
      };
    case 'rename-table':
      return { op: o.op, table, name: o.name, reason };
    case 'delete-table':
      return { op: o.op, table, reason };
    case 'add-column':
      if (o.columns.length !== 1) throw new Untranslatable('añadir columna necesita exactamente una columna');
      // Sin un tipo válido (y sin preforma) la columna no se puede añadir: se descarta la operación.
      return { op: o.op, table, column: column(o.columns[0]), reason };
    case 'update-column':
      return {
        op: o.op,
        table,
        column: o.column,
        changes: {
          type: o.changes.type.trim()
            ? (parseSqlType(o.changes.type) ?? (parseDocType(o.changes.type) ? null : sqlType(o.changes.type)))
            : null,
          docType: parseSqlType(o.changes.type) ? null : parseDocType(o.changes.type),
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
    case 'embed':
      return {
        op: o.op,
        table,
        column: o.column,
        references: o.references,
        many: o.many,
        nullable: o.nullable,
        reason,
      };
  }
}

/** Traduce la respuesta del modelo a la propuesta que recibe la web. */
export function fromWire(wire: WireProposal): AiProposal {
  const advice = [...wire.advice];
  const operations: Operation[] = [];
  const fks = new Set(wire.operations.filter(o => o.op === 'add-foreign-key').map(o => fkKey(o.table, o.column)));
  wire.operations.forEach((o, i) => {
    try {
      operations.push(translate(o, fks, advice));
    } catch (error) {
      if (!(error instanceof Untranslatable)) throw error;
      advice.push(`Se ha descartado la operación ${i + 1} (${o.op}): ${error.message}.`);
    }
  });
  return { summary: wire.summary, operations, advice };
}
