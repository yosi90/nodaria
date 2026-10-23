import { db2Library } from './db2Script';
import { uniqueNames } from './sqlScript';
import { dataTables, rowsOf, valueKind, type DataTable } from './tableData';
import type { Project } from './types';

/*
 * Consultas sobre las filas de ejemplo (docs/roadmaps/ROADMAP_DATOS_BD.md). Se ejecutan en SQLite dentro
 * del navegador: cada vez se crea una base en memoria con todas las tablas (los nombres del script, sin
 * restricciones) y sus filas, se ejecuta la consulta y se tira. Por eso una consulta no puede cambiar los
 * datos; aun así solo se admiten las que leen, para no dar a entender lo contrario.
 *
 * SQLite entiende casi todo lo habitual de SQL Server y de Db2 (JOIN, GROUP BY, subconsultas, CTE,
 * [corchetes] y "comillas"); lo más común que no, se traduce antes (`translateQuery`).
 */

export type SqlValue = string | number | null;

export interface QueryTable {
  name: string;
  columns: { name: string; affinity: 'INTEGER' | 'NUMERIC' | 'REAL' | 'TEXT' }[];
  rows: SqlValue[][];
}

/** Lo que necesita la base en memoria: sus tablas con las filas. */
export interface QuerySetup {
  tables: QueryTable[];
}

const affinityOf = (c: DataTable['columns'][number]): QueryTable['columns'][number]['affinity'] => {
  const kind = valueKind(c);
  return kind === 'integer' || kind === 'bool'
    ? 'INTEGER'
    : kind === 'exact'
      ? 'NUMERIC'
      : kind === 'float'
        ? 'REAL'
        : 'TEXT';
};

/** Las tablas del proyecto como tablas de SQLite (con un nombre único aunque haya de las dos bases). */
export function querySetup(p: Project, tables: DataTable[] = dataTables(p)): QuerySetup {
  const names = uniqueNames(tables, t => t.name);
  return {
    tables: tables.map((t, i) => ({
      name: names[i],
      columns: t.columns.map(c => ({ name: c.name, affinity: affinityOf(c) })),
      rows: rowsOf(p, t.node.id).map(r =>
        t.columns.map(c => {
          const value = r.cells[c.key];
          if (value === undefined || value === null) return null;
          if (typeof value === 'boolean') return value ? 1 : 0;
          return value;
        }),
      ),
    })),
  };
}

export const quoteSqlite = (name: string) => `"${name.replace(/"/g, '""')}"`;

/** Las sentencias que crean las tablas de la base en memoria. */
export const createStatements = (setup: QuerySetup) =>
  setup.tables.map(
    t =>
      `CREATE TABLE ${quoteSqlite(t.name)} (${
        t.columns.length ? t.columns.map(c => `${quoteSqlite(c.name)} ${c.affinity}`).join(', ') : '"_" TEXT'
      })`,
  );

/**
 * Aplica `fn` solo al código, no a los textos entre comillas simples ni a los comentarios: así una
 * traducción no cambia un literal como 'GETDATE()'.
 */
function mapCode(sql: string, fn: (code: string) => string) {
  const parts = sql.split(/('(?:[^']|'')*'|--[^\n]*|\/\*[\s\S]*?\*\/)/);
  return parts.map((part, i) => (i % 2 ? part : fn(part))).join('');
}

/** Sin textos ni comentarios, para mirar qué palabras usa la consulta. */
const codeOnly = (sql: string) => sql.replace(/'(?:[^']|'')*'|--[^\n]*|\/\*[\s\S]*?\*\//g, ' ');

const WRITES =
  /\b(INSERT|UPDATE|DELETE|MERGE|DROP|ALTER|CREATE|TRUNCATE|REPLACE|ATTACH|DETACH|PRAGMA|VACUUM|REINDEX)\b/i;

/** Por qué no se ejecuta una consulta (no lee, o está vacía), o `null`. */
export function queryError(sql: string): string | null {
  const code = codeOnly(sql).trim();
  if (!code.replace(/;/g, '').trim()) return 'Escribe una consulta, como SELECT * FROM Cliente.';
  const first = /^\(*\s*(\w+)/.exec(code)?.[1]?.toUpperCase();
  if (!first || !['SELECT', 'WITH', 'VALUES'].includes(first) || WRITES.test(code))
    return 'Aquí solo se consultan las filas (SELECT). Para cambiarlas, edítalas en la hoja de su tabla.';
  return null;
}

/**
 * Lo más habitual de SQL Server y Db2 que SQLite escribe de otra forma: TOP y FETCH FIRST (LIMIT),
 * GETDATE() y CURRENT TIMESTAMP, ISNULL, LEN, SUBSTRING y el prefijo de esquema o biblioteca.
 */
export function translateQuery(sql: string, qualifiers: string[] = []): string {
  const names = ['dbo', ...qualifiers].map(q => q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  const prefix = new RegExp(
    `(?:\\[(?:${names.join('|')})\\]|"(?:${names.join('|')})"|\\b(?:${names.join('|')}))\\s*\\.\\s*(?=[\\w"[])`,
    'gi',
  );
  let out = mapCode(sql, code =>
    code
      .replace(prefix, '')
      .replace(/\bOFFSET\s+(\d+)\s+ROWS?\s+FETCH\s+(?:FIRST|NEXT)\s+(\d+)\s+ROWS?\s+ONLY\b/gi, 'LIMIT $2 OFFSET $1')
      .replace(/\bFETCH\s+(?:FIRST|NEXT)\s+(\d+)\s+ROWS?\s+ONLY\b/gi, 'LIMIT $1')
      .replace(/\bFETCH\s+(?:FIRST|NEXT)\s+ROWS?\s+ONLY\b/gi, 'LIMIT 1')
      .replace(/\bOFFSET\s+(\d+)\s+ROWS?\b/gi, 'LIMIT -1 OFFSET $1')
      .replace(/\b(GETDATE|SYSDATETIME|CURRENT_TIMESTAMP)\s*\(\s*\)/gi, 'CURRENT_TIMESTAMP')
      .replace(/\bCURRENT\s+(TIMESTAMP|DATE|TIME)\b/gi, 'CURRENT_$1')
      .replace(/\bISNULL\s*\(/gi, 'IFNULL(')
      .replace(/\bLEN\s*\(/gi, 'LENGTH(')
      .replace(/\bSUBSTRING\s*\(/gi, 'SUBSTR(')
      .replace(/\b(UCASE)\s*\(/gi, 'UPPER(')
      .replace(/\b(LCASE)\s*\(/gi, 'LOWER('),
  );
  // TOP n (o TOP (n)) al principio de la consulta: LIMIT n al final, si no lleva ya uno.
  const top = /^(\s*SELECT\s+(?:DISTINCT\s+)?)TOP\s*\(?\s*(\d+)\s*\)?\s*/i;
  const statements = out.split(/;(?=(?:[^']*'[^']*')*[^']*$)/);
  out = statements
    .map(statement => {
      const m = top.exec(statement);
      if (!m) return statement;
      const rest = statement.replace(top, m[1]);
      return /\bLIMIT\s+\d+/i.test(codeOnly(rest)) ? rest : `${rest.trimEnd()} LIMIT ${m[2]}`;
    })
    .join(';');
  return out;
}

/** Los prefijos que se quitan de los nombres: la biblioteca de Db2 del proyecto. */
export const queryQualifiers = (p: Project) => [db2Library(p)].filter(Boolean);

export interface QueryResult {
  columns: string[];
  rows: SqlValue[][];
  /** Filas que devolvió la consulta (puede haber más que `rows`, que se corta). */
  total: number;
  /** Se dejó de contar: hay más de `total`. */
  more: boolean;
  ms: number;
}
/** Filas que se enseñan y hasta dónde se cuentan. */
export const RESULT_ROWS = 1000;
export const COUNT_ROWS = 100000;

/** Un resultado en CSV (punto y coma, para la hoja de cálculo en español) con BOM. */
export function resultCsv(result: Pick<QueryResult, 'columns' | 'rows'>) {
  const cell = (value: SqlValue) => {
    const text = value === null ? '' : String(value);
    return /[;"\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  };
  return `\ufeff${[result.columns, ...result.rows].map(r => r.map(cell).join(';')).join('\r\n')}\r\n`;
}
