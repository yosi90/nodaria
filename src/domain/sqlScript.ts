import { foreignKeyLinks, isTableType, sqlDefaultError, sqlTypeText, tableColumns, type TableColumn } from './database';
import { nodeLabel } from './selectors';
import type { Node, Project } from './types';

/*
 * Script de SQL Server con el esquema de las tablas del proyecto: un CREATE TABLE por nodo tabla con
 * sus columnas (con su DEFAULT), clave primaria, UNIQUE (simples y compuestas por grupo) y CHECK de las
 * listas de opciones; después las claves foráneas con ALTER TABLE y sus reglas ON DELETE/ON UPDATE (así
 * valen los ciclos y las autorreferencias) y, al final, los índices. Va dentro de una transacción con
 * XACT_ABORT: o se crea todo o nada. Lo que SQL Server rechazaría se deja comentado con el motivo en
 * lugar de romper el script.
 *
 * Una referencia a una tabla con clave primaria compuesta se convierte en una columna por cada parte de
 * esa clave («cliente_pais», «cliente_numero») y en una clave foránea de varias columnas.
 */

const MAX_NAME = 128;
const TEXT_TYPES = ['char', 'varchar', 'nchar', 'nvarchar'];
export const quoteName = (name: string) => `[${name.slice(0, MAX_NAME).replace(/]/g, ']]')}]`;
const constraintName = (...parts: string[]) => quoteName(parts.join('_').replace(/\s+/g, '_'));
const list = (columns: { name: string }[]) => columns.map(c => quoteName(c.name)).join(', ');

interface ScriptColumn extends TableColumn {
  name: string;
  /** Parte de una referencia a una clave primaria compuesta: el nombre de la columna destino. */
  targetKey?: string;
}

interface ScriptTable {
  node: Node;
  name: string;
  columns: ScriptColumn[];
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
  const base: ScriptTable[] = nodes.map((node, i) => {
    const columns = tableColumns(p, node.typeId);
    const columnNames = uniqueNames(columns, c => c.field.key || c.field.label);
    return { node, name: names[i], columns: columns.map((c, j) => ({ ...c, name: columnNames[j] })) };
  });
  const byNode = new Map(base.map(t => [t.node.id, t]));
  // Las referencias a una clave primaria compuesta se abren en una columna por cada parte de la clave.
  return base.map(table => {
    const expanded = table.columns.flatMap(column => {
      const targetId = column.field.type === 'nodeRef' ? table.node.values[column.field.id] : undefined;
      const target = typeof targetId === 'string' ? byNode.get(targetId) : undefined;
      const keys = target?.columns.filter(c => c.sql.primaryKey) ?? [];
      if (keys.length < 2) return [column];
      return keys.map(key => ({
        ...column,
        name: `${column.name}_${key.name}`,
        type: key.type,
        sql: { ...column.sql, identity: false, defaultValue: null },
        targetKey: key.name,
      }));
    });
    const finalNames = uniqueNames(expanded, c => c.name);
    return { ...table, columns: expanded.map((c, i) => ({ ...c, name: finalNames[i] })) };
  });
}

/** Las columnas de un atributo en la tabla (una, o varias si es una referencia a una clave compuesta). */
const columnsOf = (table: ScriptTable, fieldId: string) => table.columns.filter(c => c.field.id === fieldId);

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
    if (keys.length) lines.push(`    CONSTRAINT ${constraintName('PK', t.name)} PRIMARY KEY (${list(keys)})`);
    // UNIQUE: la de cada atributo (de una columna, o de todas las suyas si es una referencia compuesta)…
    const fields = [...new Set(t.columns.map(c => c.field.id))];
    fields.forEach(fieldId => {
      const columns = columnsOf(t, fieldId);
      const sameAsKey = columns.length === keys.length && columns.every(c => c.sql.primaryKey);
      if (columns[0].sql.unique && !sameAsKey)
        lines.push(`    CONSTRAINT ${constraintName('UQ', t.name, columns[0].name)} UNIQUE (${list(columns)})`);
    });
    // …y las compuestas: las columnas con el mismo grupo forman una sola UNIQUE.
    const groups = new Map<string, ScriptColumn[]>();
    t.columns.forEach(c => {
      const group = c.sql.uniqueGroup?.trim();
      if (group) groups.set(group, [...(groups.get(group) ?? []), c]);
    });
    groups.forEach((columns, group) =>
      lines.push(`    CONSTRAINT ${constraintName('UQ', t.name, group)} UNIQUE (${list(columns)})`),
    );
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

  const links = foreignKeyLinks(p);
  if (links.length) out.push('-- Claves foráneas');
  const used = new Set<string>();
  links.forEach(k => {
    const source = byNode.get(k.sourceId);
    const target = byNode.get(k.targetId);
    const columns = source ? columnsOf(source, k.fieldId) : [];
    if (!source || !target || !columns.length) return;
    const label = `[dbo].${quoteName(source.name)}.${quoteName(columns[0].name)} → [dbo].${quoteName(target.name)}`;
    let targetKeys: ScriptColumn[];
    if (columns[0].targetKey) {
      targetKeys = columns.map(c => target.columns.find(t => t.name === c.targetKey)!).filter(Boolean);
    } else {
      const targetKey = target.columns.find(c => c.field.id === k.targetFieldId);
      if (!targetKey) {
        out.push(`-- Omitida ${label}: la tabla destino no tiene clave primaria.`);
        return;
      }
      if (sqlTypeText(targetKey.type) !== sqlTypeText(columns[0].type)) {
        out.push(
          `-- Omitida ${label}: la columna es ${sqlTypeText(columns[0].type)} y la clave ${sqlTypeText(targetKey.type)}.`,
        );
        return;
      }
      targetKeys = [targetKey];
    }
    const field = columns[0];
    const stem = field.targetKey ? field.field.key || field.name : field.name;
    let name = `FK_${source.name}_${stem}`;
    for (let i = 2; used.has(name.toLowerCase()); i++) name = `FK_${source.name}_${stem}_${i}`;
    used.add(name.toLowerCase());
    const actions = [
      field.sql.onDelete && field.sql.onDelete !== 'NO ACTION' ? ` ON DELETE ${field.sql.onDelete}` : '',
      field.sql.onUpdate && field.sql.onUpdate !== 'NO ACTION' ? ` ON UPDATE ${field.sql.onUpdate}` : '',
    ].join('');
    out.push(
      `ALTER TABLE [dbo].${quoteName(source.name)} ADD CONSTRAINT ${constraintName(name)} FOREIGN KEY (${list(
        columns,
      )}) REFERENCES [dbo].${quoteName(target.name)} (${list(targetKeys)})${actions};`,
    );
  });

  // Índices de las columnas marcadas (las de la clave primaria entera o UNIQUE ya lo tienen).
  const indexes = tables.flatMap(t => {
    const keys = t.columns.filter(c => c.sql.primaryKey);
    return [...new Set(t.columns.map(c => c.field.id))].flatMap(fieldId => {
      const columns = columnsOf(t, fieldId);
      const sameAsKey = columns.length === keys.length && columns.every(c => c.sql.primaryKey);
      if (!columns[0].sql.indexed || columns[0].sql.unique || sameAsKey) return [];
      return [
        `CREATE INDEX ${constraintName('IX', t.name, columns[0].targetKey ? columns[0].field.key : columns[0].name)} ON [dbo].${quoteName(t.name)} (${list(columns)});`,
      ];
    });
  });
  if (indexes.length) out.push('', '-- Índices', ...indexes);
  out.push('', 'COMMIT TRANSACTION;', '');
  return out.join('\n');
}
