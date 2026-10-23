import type { SqlDialect } from './database';
import { cellKey, dataTables, rowsOf, tableRowIssues, valueKind, type CellValue, type DataTable } from './tableData';
import type { ScriptColumn } from './sqlScript';
import type { Node, Project } from './types';

/*
 * Las filas de ejemplo en los scripts (docs/roadmaps/ROADMAP_DATOS_BD.md): un INSERT por fila, después de
 * crear las tablas y antes de las claves foráneas, para que no importe el orden de las tablas y valgan los
 * ciclos (la base comprueba las claves al crearlas). Una fila con errores (de tipo, una obligatoria vacía,
 * una clave repetida o una clave foránea que no existe) se deja comentada con el motivo: haría fallar el
 * script entero. Las celdas vacías no se escriben, así la columna toma su DEFAULT o NULL.
 */

interface InsertTable {
  node: Node;
  /** Nombre ya escrito como lo pide la base (con corchetes o comillas). */
  quoted: string;
  columns: (ScriptColumn & { quoted: string })[];
}

const TEXT_N = ['nchar', 'nvarchar'];

function literal(c: ScriptColumn, value: CellValue, dialect: SqlDialect) {
  if (value === null) return 'NULL';
  const kind = valueKind(c);
  if (typeof value === 'boolean') return dialect === 'db2i' ? (value ? 'TRUE' : 'FALSE') : value ? '1' : '0';
  if (kind === 'integer' || kind === 'exact' || kind === 'float') return value;
  if (kind === 'binary') {
    const hex = value.replace(/^0x/i, '').toUpperCase();
    return dialect === 'db2i' ? `BX'${hex}'` : `0x${hex}`;
  }
  let text = value;
  // En SQL Server, datetime lee 'AAAA-MM-DD hh:mm' según el idioma de la sesión; con la T es ISO 8601 siempre.
  if (kind === 'datetime' && dialect === 'sqlserver')
    text = value.includes(' ') ? value.replace(' ', 'T') : `${value}T00:00:00`;
  const quoted = `'${text.replace(/'/g, "''")}'`;
  return dialect === 'sqlserver' && TEXT_N.includes(c.type.name) ? `N${quoted}` : quoted;
}

const filled = (value: CellValue | undefined) => value !== null && value !== undefined && value !== '';

/** Las sentencias de una tabla: un INSERT por fila, o un comentario si la fila tiene errores. */
function tableInserts(
  p: Project,
  table: InsertTable,
  data: DataTable,
  tables: DataTable[],
  dialect: SqlDialect,
  identity: (rows: string[]) => string[],
) {
  const rows = rowsOf(p, table.node.id);
  if (!rows.length || !table.columns.length) return [];
  const issues = tableRowIssues(p, data, tables);
  const out: string[] = [`-- ${table.quoted}: ${rows.length} ${rows.length === 1 ? 'fila' : 'filas'}`];
  const plain: string[] = [];
  const withIdentity: string[] = [];
  rows.forEach((row, i) => {
    const problems = issues.get(row.id);
    if (problems?.size) {
      const reasons = [...problems].map(([key, message]) => {
        const column = table.columns.find(c => cellKey(c) === key);
        return `${column?.name ?? key}: ${message}`;
      });
      plain.push(`-- Fila ${i + 1} omitida. ${reasons.join(' ').replace(/\s+/g, ' ')}`);
      return;
    }
    const columns = table.columns.filter(c => filled(row.cells[cellKey(c)]));
    if (!columns.length) return plain.push(`-- Fila ${i + 1} vacía: no se inserta.`);
    const identityGiven = columns.some(c => c.sql.identity);
    const sql =
      `INSERT INTO ${table.quoted} (${columns.map(c => c.quoted).join(', ')})` +
      `${identityGiven && dialect === 'db2i' ? ' OVERRIDING SYSTEM VALUE' : ''} VALUES (${columns
        .map(c => literal(c, row.cells[cellKey(c)] ?? null, dialect))
        .join(', ')});`;
    (identityGiven ? withIdentity : plain).push(sql);
  });
  return [...out, ...identity(withIdentity), ...plain, ''];
}

/** Lo que el script de SQL Server inserta (vacío si no hay filas). */
export function sqlServerInserts(
  p: Project,
  tables: { node: Node; name: string; columns: ScriptColumn[] }[],
  quote: (name: string) => string,
): string[] {
  const data = dataTables(p);
  const lines = tables.flatMap(t => {
    const table = {
      node: t.node,
      quoted: `[dbo].${quote(t.name)}`,
      columns: t.columns.map(c => ({ ...c, quoted: quote(c.name) })),
    };
    const own = data.find(d => d.node.id === t.node.id);
    // Con IDENTITY_INSERT, SQL Server acepta el número y después sigue contando desde el mayor.
    const identity = (rows: string[]) =>
      rows.length
        ? [`SET IDENTITY_INSERT ${table.quoted} ON;`, ...rows, `SET IDENTITY_INSERT ${table.quoted} OFF;`]
        : [];
    return own ? tableInserts(p, table, own, data, 'sqlserver', identity) : [];
  });
  return lines.length ? ['-- Filas de ejemplo', ...lines] : [];
}

/**
 * Lo que inserta el script de Db2 for i. Con `system`, usa los nombres de sistema (los de un archivo
 * creado con DDS, que no tiene IDENTITY ni nombres largos).
 */
export function db2Inserts(
  p: Project,
  tables: { node: Node; name: string; system: string; columns: (ScriptColumn & { system: string })[] }[],
  quote: (name: string) => string,
  system = false,
): string[] {
  const data = dataTables(p);
  const lines = tables.flatMap(t => {
    const table = {
      node: t.node,
      quoted: system ? t.system : quote(t.name),
      columns: t.columns
        .filter(c => !(system && c.sql.identity && false))
        .map(c => ({
          ...c,
          quoted: system ? c.system : quote(c.name),
          sql: system ? { ...c.sql, identity: false } : c.sql,
        })),
    };
    const own = data.find(d => d.node.id === t.node.id);
    // Con OVERRIDING SYSTEM VALUE la identidad no avanza: se reinicia detrás del mayor número insertado.
    const identity = (rows: string[]) => {
      if (!rows.length) return [];
      const restarts = table.columns
        .filter(c => c.sql.identity)
        .map(c => {
          const max = rowsOf(p, t.node.id).reduce((m, r) => {
            const v = r.cells[cellKey(c)];
            return typeof v === 'string' && /^\d+$/.test(v) && BigInt(v) > m ? BigInt(v) : m;
          }, 0n);
          return `ALTER TABLE ${table.quoted} ALTER COLUMN ${c.quoted} RESTART WITH ${max + 1n};`;
        });
      return [...rows, ...restarts];
    };
    return own ? tableInserts(p, table, own, data, 'db2i', identity) : [];
  });
  return lines.length ? ['-- Filas de ejemplo', ...lines] : [];
}

/** Cuántas filas tienen las tablas (para saber si se ofrece incluirlas). */
export const rowCount = (p: Project, nodeIds?: string[]) =>
  (nodeIds ?? Object.keys(p.tableData)).reduce((n, id) => n + rowsOf(p, id).length, 0);
