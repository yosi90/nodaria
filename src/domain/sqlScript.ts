import { foreignKeyLinks, isTableType, sqlDefaultError, sqlTypeText, tableColumns, type TableColumn } from './database';
import { nodeLabel } from './selectors';
import type { Node, Project } from './types';

/*
 * Script de SQL Server con el esquema de las tablas del proyecto: un CREATE TABLE por nodo tabla con
 * sus columnas (con su DEFAULT), clave primaria, UNIQUE y CHECK de las listas de opciones; después las
 * claves foráneas con ALTER TABLE y sus reglas ON DELETE/ON UPDATE (así valen los ciclos y las
 * autorreferencias) y, al final, los índices. Va dentro de una transacción con XACT_ABORT: o se crea todo o nada.
 * Lo que SQL Server rechazaría se deja comentado con el motivo en lugar de romper el script.
 */

const MAX_NAME = 128;
const TEXT_TYPES = ['char', 'varchar', 'nchar', 'nvarchar'];
export const quoteName = (name: string) => `[${name.slice(0, MAX_NAME).replace(/]/g, ']]')}]`;
const constraintName = (...parts: string[]) => quoteName(parts.join('_').replace(/\s+/g, '_'));

interface ScriptTable {
  node: Node;
  name: string;
  columns: (TableColumn & { name: string })[];
}

/** Nombres únicos, sin distinguir mayúsculas como SQL Server: el segundo «Cliente» pasa a «Cliente_2». */
function uniqueNames<T>(items: T[], nameOf: (item: T) => string) {
  const taken = new Set<string>();
  return items.map(item => {
    const base =
      nameOf(item)
        .trim()
        .slice(0, MAX_NAME - 4) || 'Sin_nombre';
    let name = base;
    for (let i = 2; taken.has(name.toLowerCase()); i++) name = `${base}_${i}`;
    taken.add(name.toLowerCase());
    return name;
  });
}

function scriptTables(p: Project): ScriptTable[] {
  const nodes = p.nodes.filter(n => isTableType(p, n.typeId));
  const names = uniqueNames(nodes, n => nodeLabel(p, n));
  return nodes.map((node, i) => {
    const columns = tableColumns(p, node.typeId);
    const columnNames = uniqueNames(columns, c => c.field.key || c.field.label);
    return { node, name: names[i], columns: columns.map((c, j) => ({ ...c, name: columnNames[j] })) };
  });
}

export function sqlScript(p: Project, generatedAt = new Date()): string {
  const tables = scriptTables(p);
  const byNode = new Map(tables.map(t => [t.node.id, t]));
  const out: string[] = [
    `-- Esquema de «${p.name}» para SQL Server, generado por Nodaria el ${generatedAt.toISOString().slice(0, 10)}.`,
    '-- Ejecútalo sobre la base de datos de destino. Si algo falla, no se crea nada.',
    '',
    'SET XACT_ABORT ON;',
    'BEGIN TRANSACTION;',
    '',
  ];
  tables.forEach(t => {
    const table = `[dbo].${quoteName(t.name)}`;
    if (!t.columns.length) {
      out.push(`-- ${table}: sin columnas, no se crea.`, '');
      return;
    }
    const lines = t.columns.map(
      c =>
        `    ${quoteName(c.name)} ${sqlTypeText(c.type)}${c.sql.identity ? ' IDENTITY(1,1)' : ''} ${
          c.sql.nullable && !c.sql.primaryKey ? 'NULL' : 'NOT NULL'
        }${
          c.sql.defaultValue && !c.sql.identity && !sqlDefaultError(c.sql.defaultValue)
            ? ` CONSTRAINT ${constraintName('DF', t.name, c.name)} DEFAULT (${c.sql.defaultValue})`
            : ''
        }`,
    );
    const keys = t.columns.filter(c => c.sql.primaryKey);
    if (keys.length)
      lines.push(
        `    CONSTRAINT ${constraintName('PK', t.name)} PRIMARY KEY (${keys.map(c => quoteName(c.name)).join(', ')})`,
      );
    t.columns
      .filter(c => c.sql.unique && !(c.sql.primaryKey && keys.length === 1))
      .forEach(c => lines.push(`    CONSTRAINT ${constraintName('UQ', t.name, c.name)} UNIQUE (${quoteName(c.name)})`));
    // Una lista de opciones en una columna de texto limita sus valores: CHECK (columna IN (...)).
    t.columns
      .filter(c => c.field.type === 'select' && c.field.options.length && TEXT_TYPES.includes(c.type.name))
      .forEach(c =>
        lines.push(
          `    CONSTRAINT ${constraintName('CK', t.name, c.name)} CHECK (${quoteName(c.name)} IN (${c.field.options
            .map(option => `N'${option.replace(/'/g, "''")}'`)
            .join(', ')}))`,
        ),
      );
    out.push(`CREATE TABLE ${table} (`, lines.join(',\n'), ');', '');
  });

  const keys = foreignKeyLinks(p);
  if (keys.length) out.push('-- Claves foráneas');
  const used = new Set<string>();
  keys.forEach(k => {
    const source = byNode.get(k.sourceId);
    const target = byNode.get(k.targetId);
    const column = source?.columns.find(c => c.field.id === k.fieldId);
    if (!source || !target || !column) return;
    const label = `[dbo].${quoteName(source.name)}.${quoteName(column.name)} → [dbo].${quoteName(target.name)}`;
    const targetKey = target.columns.find(c => c.field.id === k.targetFieldId);
    if (!targetKey) {
      out.push(`-- Omitida ${label}: la tabla destino no tiene una clave primaria de una sola columna.`);
      return;
    }
    if (sqlTypeText(targetKey.type) !== sqlTypeText(column.type)) {
      out.push(
        `-- Omitida ${label}: la columna es ${sqlTypeText(column.type)} y la clave ${sqlTypeText(targetKey.type)}.`,
      );
      return;
    }
    let name = `FK_${source.name}_${column.name}`;
    for (let i = 2; used.has(name.toLowerCase()); i++) name = `FK_${source.name}_${column.name}_${i}`;
    used.add(name.toLowerCase());
    const actions = [
      column.sql.onDelete && column.sql.onDelete !== 'NO ACTION' ? ` ON DELETE ${column.sql.onDelete}` : '',
      column.sql.onUpdate && column.sql.onUpdate !== 'NO ACTION' ? ` ON UPDATE ${column.sql.onUpdate}` : '',
    ].join('');
    out.push(
      `ALTER TABLE [dbo].${quoteName(source.name)} ADD CONSTRAINT ${constraintName(name)} FOREIGN KEY (${quoteName(
        column.name,
      )}) REFERENCES [dbo].${quoteName(target.name)} (${quoteName(targetKey.name)})${actions};`,
    );
  });

  // Índices de las columnas marcadas (las de una clave primaria de una columna o UNIQUE ya lo tienen).
  const indexes = tables.flatMap(t => {
    const singleKey = t.columns.filter(c => c.sql.primaryKey).length === 1;
    return t.columns
      .filter(c => c.sql.indexed && !c.sql.unique && !(c.sql.primaryKey && singleKey))
      .map(
        c =>
          `CREATE INDEX ${constraintName('IX', t.name, c.name)} ON [dbo].${quoteName(t.name)} (${quoteName(c.name)});`,
      );
  });
  if (indexes.length) out.push('', '-- Índices', ...indexes);
  out.push('', 'COMMIT TRANSACTION;', '');
  return out.join('\n');
}
