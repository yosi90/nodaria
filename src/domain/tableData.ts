import { dialectOf, type SqlDialect } from './database';
import { db2Name } from './db2Script';
import { uid } from './factories';
import { scriptTables, type ScriptColumn } from './sqlScript';
import type { Node, Project } from './types';

/*
 * Filas de ejemplo de las tablas (docs/roadmaps/ROADMAP_DATOS_BD.md). En una tabla el nodo es la tabla
 * (su título es el nombre y sus atributos, las columnas), así que las filas no son nodos: viven aparte, por
 * nodo tabla, en `Project.tableData`. Cada celda se guarda por el id del atributo (o `atributo:columna`
 * en las partes de una referencia a una clave compuesta), que no cambia al renombrar la columna; la
 * celda de una columna que ya no está se conserva sin mostrarse, por si vuelve.
 *
 * Los valores se guardan como texto ya normalizado (la coma decimal pasa a punto, las fechas a ISO) o
 * como booleano en las columnas bit/BOOLEAN; así un DECIMAL(15,2) no pierde precisión por el camino.
 */

export type CellValue = string | boolean | null;
export interface TableRow {
  id: string;
  cells: Record<string, CellValue>;
}
export interface TableData {
  rows: TableRow[];
}
/** Una consulta SQL guardada sobre las filas. */
export interface SqlQueryDef {
  id: string;
  name: string;
  sql: string;
}

export const MAX_ROWS = 5000;
export const MAX_CELL = 4000;
export const MAX_QUERY = 20000;

// --- Las tablas y sus columnas ---

export interface DataColumn extends ScriptColumn {
  /** Dónde se guarda su celda en la fila. */
  key: string;
  /** Clave foránea: la tabla destino y la columna de su clave a la que apunta. */
  fk: { nodeId: string; key: string } | null;
}
export interface DataTable {
  node: Node;
  name: string;
  dialect: SqlDialect;
  columns: DataColumn[];
}

export const cellKey = (c: Pick<ScriptColumn, 'field' | 'targetKey'>) =>
  c.targetKey ? `${c.field.id}:${c.targetKey}` : c.field.id;

/** Las tablas relacionales del proyecto (SQL Server y Db2 for i), con los nombres de su script. */
export function dataTables(p: Project): DataTable[] {
  const base = [
    ...scriptTables(p, 'sqlserver').map(t => ({ ...t, dialect: 'sqlserver' as const })),
    ...scriptTables(p, 'db2i', db2Name).map(t => ({ ...t, dialect: 'db2i' as const })),
  ];
  const byNode = new Map(base.map(t => [t.node.id, t]));
  return base.map(t => ({
    ...t,
    columns: t.columns.map(c => {
      const targetId = c.reference ? t.node.values[c.field.id] : undefined;
      const target = typeof targetId === 'string' ? byNode.get(targetId) : undefined;
      let fk: DataColumn['fk'] = null;
      if (target && target.dialect === t.dialect) {
        const keys = target.columns.filter(k => k.sql.primaryKey);
        const key = c.targetKey ? target.columns.find(k => k.name === c.targetKey) : keys.length === 1 ? keys[0] : null;
        if (key) fk = { nodeId: target.node.id, key: cellKey(key) };
      }
      return { ...c, key: cellKey(c), fk };
    }),
  }));
}

export const dataTable = (p: Project, nodeId: string) => dataTables(p).find(t => t.node.id === nodeId);
export const rowsOf = (p: Project, nodeId: string): TableRow[] => p.tableData[nodeId]?.rows ?? [];
/** El proyecto tiene tablas donde escribir filas. */
export const hasDataTables = (p: Project) =>
  p.nodes.some(n => {
    const dialect = dialectOf(p, n.typeId);
    return dialect === 'sqlserver' || dialect === 'db2i';
  });

// --- Tipos de valor ---

type ValueKind = 'integer' | 'exact' | 'float' | 'bool' | 'text' | 'date' | 'time' | 'datetime' | 'guid' | 'binary';
const KINDS: Record<string, ValueKind> = {
  int: 'integer',
  bigint: 'integer',
  smallint: 'integer',
  tinyint: 'integer',
  SMALLINT: 'integer',
  INTEGER: 'integer',
  BIGINT: 'integer',
  decimal: 'exact',
  numeric: 'exact',
  money: 'exact',
  DECIMAL: 'exact',
  NUMERIC: 'exact',
  DECFLOAT: 'exact',
  float: 'float',
  REAL: 'float',
  DOUBLE: 'float',
  bit: 'bool',
  BOOLEAN: 'bool',
  date: 'date',
  DATE: 'date',
  time: 'time',
  TIME: 'time',
  datetime: 'datetime',
  datetime2: 'datetime',
  TIMESTAMP: 'datetime',
  uniqueidentifier: 'guid',
  varbinary: 'binary',
  BINARY: 'binary',
  VARBINARY: 'binary',
  BLOB: 'binary',
};
export const valueKind = (c: Pick<ScriptColumn, 'type'>): ValueKind => KINDS[c.type.name] ?? 'text';
export const isNumericKind = (kind: ValueKind) => kind === 'integer' || kind === 'exact' || kind === 'float';

const INTEGER_RANGE: Record<string, [bigint, bigint]> = {
  tinyint: [0n, 255n],
  smallint: [-32768n, 32767n],
  SMALLINT: [-32768n, 32767n],
  int: [-2147483648n, 2147483647n],
  INTEGER: [-2147483648n, 2147483647n],
  bigint: [-9223372036854775808n, 9223372036854775807n],
  BIGINT: [-9223372036854775808n, 9223372036854775807n],
};

const TRUE = new Set(['1', 'true', 'verdadero', 'sí', 'si', 's', 'x', 'yes', 'y']);
const FALSE = new Set(['0', 'false', 'falso', 'no', 'n']);
const pad = (n: string) => n.padStart(2, '0');

/** Fecha española (31/12/2026 o 31-12-2026) a ISO; lo demás se deja como está. */
function isoDate(text: string) {
  const m = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/.exec(text);
  return m ? `${m[3]}-${pad(m[2])}-${pad(m[1])}` : text;
}

/** Lo que se escribe o se pega en una celda, como se guarda. */
export function normalizeCell(column: Pick<ScriptColumn, 'type'>, raw: CellValue | number | undefined): CellValue {
  if (raw === null || raw === undefined) return null;
  const kind = valueKind(column);
  if (kind === 'bool') {
    if (typeof raw === 'boolean') return raw;
    const text = String(raw).trim().toLowerCase();
    if (!text) return null;
    if (TRUE.has(text)) return true;
    if (FALSE.has(text)) return false;
    return String(raw).trim();
  }
  const text = typeof raw === 'boolean' ? (raw ? '1' : '0') : String(raw).slice(0, MAX_CELL);
  if (kind === 'text') return text === '' ? null : text;
  const trimmed = text.trim();
  if (!trimmed) return null;
  if (isNumericKind(kind)) {
    // 1.234,56 (como en una hoja en español) o 1234,56 → 1234.56.
    const spanish = /^[+-]?\d{1,3}(\.\d{3})+(,\d+)?$/.test(trimmed) || /^[+-]?\d+,\d+$/.test(trimmed);
    return spanish ? trimmed.replace(/\./g, '').replace(',', '.') : trimmed;
  }
  if (kind === 'date') return isoDate(trimmed);
  if (kind === 'datetime') {
    const [date, ...time] = trimmed.split(/[ T]/);
    return time.length ? `${isoDate(date)} ${time.join(' ')}` : isoDate(date);
  }
  return trimmed;
}

const validDate = (text: string) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text);
  if (!m) return false;
  const date = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  return date.getUTCFullYear() === +m[1] && date.getUTCMonth() === +m[2] - 1 && date.getUTCDate() === +m[3];
};
const validTime = (text: string) => {
  const m = /^(\d{2}):(\d{2})(?::(\d{2})(?:\.\d{1,7})?)?$/.exec(text);
  return !!m && +m[1] < 24 && +m[2] < 60 && (m[3] === undefined || +m[3] < 60);
};

/** Qué tiene mal el valor de una celda para su columna (tipo, longitud, lista de opciones), o `null`. */
export function cellError(column: DataColumn, value: CellValue): string | null {
  if (value === null) return null;
  const kind = valueKind(column);
  const type = column.type;
  if (kind === 'bool') return typeof value === 'boolean' ? null : 'Debe ser sí o no (1 o 0).';
  const text = String(value);
  switch (kind) {
    case 'integer': {
      if (!/^[+-]?\d+$/.test(text)) return 'Debe ser un número entero.';
      const range = INTEGER_RANGE[type.name];
      const n = BigInt(text);
      if (range && (n < range[0] || n > range[1]))
        return `Fuera del rango de ${type.name} (${range[0]} a ${range[1]}).`;
      return null;
    }
    case 'exact': {
      const m = /^[+-]?(\d*)(?:\.(\d*))?$/.exec(text);
      if (!m || !(m[1] + (m[2] ?? '')).length) return 'Debe ser un número (con punto o coma decimal).';
      if (type.name === 'DECFLOAT') return null;
      const [precision, scale] = type.name === 'money' ? [19, 4] : [type.precision ?? 18, type.scale ?? 0];
      const whole = m[1].replace(/^0+/, '').length;
      const fraction = (m[2] ?? '').replace(/0+$/, '').length;
      if (fraction > scale)
        return scale ? `Admite ${scale} decimales como mucho.` : 'No admite decimales (la escala es 0).';
      if (whole > precision - scale) return `Admite ${precision - scale} cifras enteras como mucho.`;
      return null;
    }
    case 'float':
      return /^[+-]?(\d+\.?\d*|\.\d+)(e[+-]?\d+)?$/i.test(text) ? null : 'Debe ser un número.';
    case 'date':
      return validDate(text) ? null : 'Debe ser una fecha: AAAA-MM-DD o DD/MM/AAAA.';
    case 'time':
      return validTime(text) ? null : 'Debe ser una hora: HH:MM o HH:MM:SS.';
    case 'datetime': {
      const [date, time] = text.split(' ');
      return validDate(date) && (time === undefined || validTime(time))
        ? null
        : 'Debe ser una fecha con hora: AAAA-MM-DD HH:MM:SS.';
    }
    case 'guid':
      return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(text)
        ? null
        : 'Debe ser un identificador único (GUID).';
    case 'binary': {
      const hex = text.replace(/^0x/i, '');
      if (!/^([0-9a-f]{2})*$/i.test(hex)) return 'Debe ser hexadecimal, como 0x0A1B.';
      if (typeof type.length === 'number' && hex.length / 2 > type.length)
        return `Admite ${type.length} bytes como mucho.`;
      return null;
    }
    default: {
      if (typeof type.length === 'number' && text.length > type.length)
        return `Admite ${type.length} caracteres como mucho (tiene ${text.length}).`;
      if (column.field.type === 'select' && column.field.options.length && !column.field.options.includes(text))
        return `Debe ser uno de: ${column.field.options.join(', ')}.`;
      return null;
    }
  }
}

// --- Validación de la tabla entera ---

/** Errores de las filas: por fila, por celda, el motivo. */
export type RowIssues = Map<string, Map<string, string>>;

const filled = (value: CellValue | undefined) => value !== null && value !== undefined && value !== '';
const tupleOf = (row: TableRow, columns: DataColumn[]) =>
  columns.every(c => filled(row.cells[c.key])) ? JSON.stringify(columns.map(c => String(row.cells[c.key]))) : null;

/** Los errores de cada fila de una tabla: tipos, obligatorias, claves, UNIQUE y claves foráneas. */
export function tableRowIssues(p: Project, table: DataTable, tables: DataTable[] = dataTables(p)): RowIssues {
  const rows = rowsOf(p, table.node.id);
  const issues: RowIssues = new Map();
  const add = (rowId: string, key: string, message: string) => {
    const row = issues.get(rowId) ?? new Map<string, string>();
    if (!row.has(key)) row.set(key, message);
    issues.set(rowId, row);
  };
  const number = new Map(rows.map((r, i) => [r.id, i + 1]));

  rows.forEach(row =>
    table.columns.forEach(c => {
      const value = row.cells[c.key] ?? null;
      const error = cellError(c, value);
      if (error) add(row.id, c.key, error);
      else if (!filled(value) && (c.sql.primaryKey || !c.sql.nullable) && !c.sql.identity && !c.sql.defaultValue)
        add(row.id, c.key, c.sql.primaryKey ? 'Es de la clave primaria: no puede quedar vacía.' : 'No admite nulos.');
    }),
  );

  // Clave primaria y UNIQUE: sin repetidos. En SQL Server una UNIQUE admite un solo NULL (los nulos cuentan
  // como iguales: lo comprobó el script en SQL Server Express); en Db2 for i, las filas con un nulo no cuentan.
  const nullsCount = table.dialect === 'sqlserver';
  const distinct = (columns: DataColumn[], what: string) => {
    if (!columns.length) return;
    const seen = new Map<string, string>();
    rows.forEach(row => {
      const tuple = nullsCount
        ? JSON.stringify(columns.map(c => (filled(row.cells[c.key]) ? String(row.cells[c.key]) : null)))
        : tupleOf(row, columns);
      // Una IDENTITY vacía la numera la base: no es un nulo.
      if (tuple === null || columns.some(c => c.sql.identity && !filled(row.cells[c.key]))) return;
      const first = seen.get(tuple);
      if (first === undefined) return seen.set(tuple, row.id);
      const nulls = columns.some(c => !filled(row.cells[c.key]));
      columns.forEach(c =>
        add(
          row.id,
          c.key,
          `${what}: ya está en la fila ${number.get(first)}${nulls ? ' (en SQL Server, NULL solo cabe una vez)' : ''}.`,
        ),
      );
    });
  };
  distinct(
    table.columns.filter(c => c.sql.primaryKey),
    'Clave repetida',
  );
  const byField = new Map<string, DataColumn[]>();
  table.columns.forEach(c => byField.set(c.field.id, [...(byField.get(c.field.id) ?? []), c]));
  byField.forEach(columns => columns[0].sql.unique && distinct(columns, 'Repetido (es único)'));
  const groups = new Map<string, DataColumn[]>();
  table.columns.forEach(c => {
    const group = c.sql.uniqueGroup?.trim();
    if (group) groups.set(group, [...(groups.get(group) ?? []), c]);
  });
  groups.forEach(columns => distinct(columns, 'Combinación repetida (es única)'));

  // Claves foráneas: el valor (o la combinación, en una compuesta) existe en la tabla destino.
  const byNode = new Map(tables.map(t => [t.node.id, t]));
  byField.forEach(columns => {
    const parts = columns.filter(c => c.fk);
    if (!parts.length || parts.length !== columns.length) return;
    const target = byNode.get(parts[0].fk!.nodeId);
    if (!target) return;
    const targetColumns = parts.map(c => target.columns.find(t => t.key === c.fk!.key)!);
    if (targetColumns.some(c => !c)) return;
    const existing = new Set(
      rowsOf(p, target.node.id)
        .map(r => tupleOf(r, targetColumns))
        .filter(Boolean),
    );
    rows.forEach(row => {
      const tuple = tupleOf(row, parts);
      if (tuple !== null && !existing.has(tuple))
        parts.forEach(c => add(row.id, c.key, `No hay ninguna fila en «${target.name}» con esa clave.`));
    });
  });
  return issues;
}

export const issueCount = (issues: RowIssues) => [...issues.values()].reduce((n, row) => n + row.size, 0);

// --- Cambios ---

function withRows(p: Project, nodeId: string, rows: TableRow[]): Project {
  const tableData = { ...p.tableData };
  if (rows.length) tableData[nodeId] = { rows };
  else delete tableData[nodeId];
  return { ...p, tableData };
}

/** El siguiente número de las columnas IDENTITY (el mayor + 1, o 1). */
function nextIdentity(rows: TableRow[], key: string) {
  let max = 0n;
  rows.forEach(r => {
    const v = r.cells[key];
    if (typeof v === 'string' && /^[+-]?\d+$/.test(v) && BigInt(v) > max) max = BigInt(v);
  });
  return String(max + 1n);
}

/** Una fila nueva, con sus IDENTITY ya numeradas (para poder apuntarla desde otra tabla). */
function newRow(table: DataTable, rows: TableRow[], cells: Record<string, CellValue> = {}, id = uid('row')): TableRow {
  const row: TableRow = { id, cells: { ...cells } };
  table.columns
    .filter(c => c.sql.identity && !filled(row.cells[c.key]))
    .forEach(c => (row.cells[c.key] = nextIdentity(rows, c.key)));
  return row;
}

/** Añade filas vacías con esos ids (detrás de `afterId`, o al final). */
export function addRows(p: Project, nodeId: string, ids: string[], afterId?: string): Project {
  const table = dataTable(p, nodeId);
  const rows = rowsOf(p, nodeId);
  if (!table) return p;
  const fresh: TableRow[] = [];
  ids.forEach(id => {
    if (rows.length + fresh.length < MAX_ROWS) fresh.push(newRow(table, [...rows, ...fresh], {}, id));
  });
  const after = afterId ? rows.findIndex(r => r.id === afterId) : -1;
  const at = after >= 0 ? after + 1 : rows.length;
  return withRows(p, nodeId, [...rows.slice(0, at), ...fresh, ...rows.slice(at)]);
}

export function setCell(p: Project, nodeId: string, rowId: string, key: string, value: CellValue | number): Project {
  const table = dataTable(p, nodeId);
  const column = table?.columns.find(c => c.key === key);
  const rows = rowsOf(p, nodeId);
  if (!column || !rows.some(r => r.id === rowId)) return p;
  const normalized = normalizeCell(column, value);
  return withRows(
    p,
    nodeId,
    rows.map(r => (r.id === rowId ? { ...r, cells: { ...r.cells, [key]: normalized } } : r)),
  );
}

export function removeRows(p: Project, nodeId: string, rowIds: string[]): Project {
  const ids = new Set(rowIds);
  const rows = rowsOf(p, nodeId);
  return rows.some(r => ids.has(r.id))
    ? withRows(
        p,
        nodeId,
        rows.filter(r => !ids.has(r.id)),
      )
    : p;
}

/** Copia las filas detrás de cada una; las IDENTITY de la copia se vuelven a numerar. */
export function duplicateRows(p: Project, nodeId: string, rowIds: string[]) {
  const table = dataTable(p, nodeId);
  if (!table) return { project: p, rowIds: [] as string[] };
  const ids = new Set(rowIds);
  const next: TableRow[] = [];
  const created: string[] = [];
  const rows = rowsOf(p, nodeId);
  rows.forEach(r => {
    next.push(r);
    if (!ids.has(r.id) || rows.length + created.length >= MAX_ROWS) return;
    const cells = { ...r.cells };
    table.columns.filter(c => c.sql.identity).forEach(c => delete cells[c.key]);
    const copy = newRow(table, [...rows, ...next], cells);
    next.push(copy);
    created.push(copy.id);
  });
  return { project: withRows(p, nodeId, next), rowIds: created };
}

/**
 * Pega una rejilla de valores (de una hoja de cálculo o un CSV) desde una celda hacia la derecha y hacia
 * abajo; crea las filas que falten. Sin `rowId`, empieza en una fila nueva al final.
 */
export function pasteCells(p: Project, nodeId: string, rowId: string | null, key: string, grid: string[][]) {
  const table = dataTable(p, nodeId);
  if (!table || !grid.length) return { project: p, rows: 0 };
  const start = table.columns.findIndex(c => c.key === key);
  if (start < 0) return { project: p, rows: 0 };
  const rows = [...rowsOf(p, nodeId)];
  let index = rowId ? rows.findIndex(r => r.id === rowId) : rows.length;
  if (index < 0) index = rows.length;
  let touched = 0;
  grid.forEach((line, i) => {
    const at = index + i;
    if (at >= MAX_ROWS) return;
    // La fila nueva se numera cuando ya lleva lo pegado, por si trae su propia IDENTITY.
    const pasted: Record<string, CellValue> = {};
    line.forEach((raw, j) => {
      const column = table.columns[start + j];
      if (column) pasted[column.key] = normalizeCell(column, raw);
    });
    rows[at] = rows[at] ? { ...rows[at], cells: { ...rows[at].cells, ...pasted } } : newRow(table, rows, pasted);
    touched++;
  });
  return { project: withRows(p, nodeId, rows), rows: touched };
}

/** Texto copiado de una hoja de cálculo (tabuladores) o un CSV (comas o punto y coma), con comillas. */
export function parseGrid(text: string): string[][] {
  const clean = text.replace(/\r\n?/g, '\n').replace(/\n$/, '');
  if (!clean) return [];
  const first = clean.split('\n')[0];
  const separator = first.includes('\t') ? '\t' : first.includes(';') ? ';' : first.includes(',') ? ',' : '\t';
  const out: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < clean.length; i++) {
    const ch = clean[i];
    if (quoted) {
      if (ch === '"' && clean[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"' && cell === '') quoted = true;
    else if (ch === separator || ch === '\n') {
      row.push(cell);
      cell = '';
      if (ch === '\n') {
        out.push(row);
        row = [];
      }
    } else cell += ch;
  }
  row.push(cell);
  out.push(row);
  return out;
}

/** Quita las filas de nodos que ya no existen o que ya no son tablas. */
export function withoutStaleTableData(p: Project): { project: Project; removed: number } {
  const tables = new Set(dataTables(p).map(t => t.node.id));
  const stale = Object.keys(p.tableData).filter(id => !tables.has(id));
  if (!stale.length) return { project: p, removed: 0 };
  const tableData = { ...p.tableData };
  stale.forEach(id => delete tableData[id]);
  return { project: { ...p, tableData }, removed: stale.length };
}

/** Las filas y consultas guardadas leídas de un archivo; lo que no se entiende se descarta. */
export function readTableData(raw: unknown): Record<string, TableData> {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const out: Record<string, TableData> = {};
  Object.entries(raw as Record<string, unknown>).forEach(([nodeId, data]) => {
    const rows = (data as { rows?: unknown })?.rows;
    if (!Array.isArray(rows)) return;
    const clean = rows
      .filter(r => r && typeof r === 'object' && typeof (r as TableRow).id === 'string')
      .slice(0, MAX_ROWS)
      .map(r => {
        const cells: Record<string, CellValue> = {};
        Object.entries((r as TableRow).cells ?? {}).forEach(([key, value]) => {
          if (value === null || typeof value === 'boolean') cells[key] = value;
          else if (typeof value === 'string') cells[key] = value.slice(0, MAX_CELL);
          else if (typeof value === 'number' && Number.isFinite(value)) cells[key] = String(value);
        });
        return { id: (r as TableRow).id, cells };
      });
    if (clean.length) out[nodeId] = { rows: clean };
  });
  return out;
}

export function readSqlQueries(raw: unknown): SqlQueryDef[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter(q => q && typeof q === 'object' && typeof q.id === 'string' && typeof q.sql === 'string')
    .map(q => ({
      id: q.id,
      name: typeof q.name === 'string' ? q.name.slice(0, 200) : '',
      sql: q.sql.slice(0, MAX_QUERY),
    }));
}
