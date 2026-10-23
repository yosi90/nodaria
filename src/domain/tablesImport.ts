import { dialectOf, engineOf, type SqlColumn, type SqlDataType } from './database';
import { createField, createSchema, now, uid } from './factories';
import type { ImportedColumn, ImportResult } from './schemaImport';
import { allFields, getSchema, nodeLabel } from './selectors';
import { dataTables, valueKind } from './tableData';
import type { FieldDefinition, FieldType, Node, Project, Schema } from './types';

/*
 * Crear en el proyecto las tablas leídas (`schemaImport.ts`): como en el resto de Nodaria, cada tabla es
 * un tipo (subtipo del que se elija, como «Archivo físico») con sus columnas como atributos y un nodo con
 * el nombre de la tabla. Las claves foráneas de una columna pasan a ser referencias a la tabla destino,
 * esté entre las importadas o ya en el proyecto; una tabla que ya está no se toca.
 */

export interface ImportOptions {
  /** Las tablas que se crean (por nombre). */
  tables: string[];
  /** Tipo del que heredan las tablas nuevas, o ninguno. */
  baseTypeId: string | null;
}

/** Las tablas del proyecto de esa base, por nombre en minúsculas: su nodo. */
function existingTables(p: Project, dialect: ImportResult['dialect']) {
  const map = new Map<string, Node>();
  p.nodes.forEach(n => {
    if (dialectOf(p, n.typeId) === dialect) map.set(nodeLabel(p, n).toLowerCase(), n);
  });
  return map;
}

/** Qué pasará con cada tabla leída: nueva o ya en el proyecto. */
export function importPreview(p: Project, result: ImportResult) {
  const existing = existingTables(p, result.dialect);
  return result.tables.map(t => ({ table: t, exists: existing.has(t.name.toLowerCase()) }));
}

/** El tipo de atributo que mejor cuenta lo que guarda la columna. */
function fieldTypeOf(column: ImportedColumn): FieldType {
  if (column.options.length) return 'select';
  const kind = valueKind({ type: column.type });
  if (kind === 'integer' || kind === 'exact' || kind === 'float') return 'number';
  if (kind === 'bool') return 'boolean';
  if (kind === 'date') return 'date';
  if (kind === 'text' && (column.type.length === 'max' || ['CLOB', 'NCLOB'].includes(column.type.name)))
    return 'longText';
  return 'text';
}

export function importTables(p: Project, result: ImportResult, options: ImportOptions) {
  const dialect = result.dialect;
  const base = options.baseTypeId ? getSchema(p, options.baseTypeId) : undefined;
  const inherited = base ? allFields(p, base.id) : [];
  const titleField = inherited.find(f => f.isTitle);
  const existing = existingTables(p, dialect);
  const chosen = new Set(options.tables.map(t => t.toLowerCase()));
  const tables = result.tables.filter(t => chosen.has(t.name.toLowerCase()) && !existing.has(t.name.toLowerCase()));
  const warnings: string[] = [];

  // Primero los tipos y los nodos (para que las claves foráneas encuentren su destino).
  const created = tables.map(t => {
    const schema: Schema = {
      ...createSchema(t.name, 'entity'),
      parentTypeId: base?.id ?? null,
      table: true,
      // El motor se hereda del tipo base si ya es de esta base.
      dbEngine: base && engineOf(p, base.id) === dialect ? null : dialect,
      description: t.description,
      icon: 'phosphor-database',
    };
    const node: Node = {
      id: uid('node'),
      typeId: schema.id,
      parentId: null,
      values: titleField ? { [titleField.id]: t.name } : {},
      createdAt: now(),
      positions: {},
      notes: '',
    };
    return { table: t, schema, node };
  });
  const byName = new Map<string, { schema: Schema; node: Node }>();
  created.forEach(c => byName.set(c.table.name.toLowerCase(), c));
  /** Las columnas de la clave primaria de una tabla destino, leída o ya en el proyecto. */
  const keysOf = (name: string): string[] => {
    const own = tables.find(t => t.name.toLowerCase() === name.toLowerCase());
    if (own) return own.primaryKey;
    const node = existing.get(name.toLowerCase());
    const table = node && dataTables(p).find(t => t.node.id === node.id);
    return table ? table.columns.filter(c => c.sql.primaryKey).map(c => c.name) : [];
  };
  const targetOf = (name: string) => {
    const own = byName.get(name.toLowerCase());
    if (own) return own;
    const node = existing.get(name.toLowerCase());
    const schema = node && getSchema(p, node.typeId);
    return node && schema ? { schema, node } : undefined;
  };

  created.forEach(({ table, schema, node }) => {
    const simpleKeys = new Map(
      table.foreignKeys.filter(k => k.columns.length === 1).map(k => [k.columns[0].toLowerCase(), k]),
    );
    // Una clave foránea compuesta vuelve a ser una referencia si sus columnas se llaman como las abre el
    // script de Nodaria: «prefijo_columnaDestino» (devuelta_pedido, devuelta_numero → devuelta).
    const composite = new Map<string, { prefix: string; key: (typeof table.foreignKeys)[number]; parts: string[] }>();
    const parts = new Set<string>();
    const sameSet = (a: string[], b: string[]) =>
      a.length === b.length && a.every(x => b.some(y => y.toLowerCase() === x.toLowerCase()));
    table.foreignKeys
      .filter(k => k.columns.length > 1)
      .forEach(k => {
        const targetKeys = k.targetColumns.length ? k.targetColumns : keysOf(k.table);
        const prefixes = k.columns.map((c, i) => {
          const suffix = `_${targetKeys[i] ?? ''}`.toLowerCase();
          return c.toLowerCase().endsWith(suffix) ? c.slice(0, c.length - suffix.length) : null;
        });
        const prefix = prefixes[0];
        if (
          targetOf(k.table) &&
          targetKeys.length === k.columns.length &&
          prefix &&
          prefixes.every(x => x === prefix)
        ) {
          composite.set(k.columns[0].toLowerCase(), { prefix, key: k, parts: k.columns });
          k.columns.slice(1).forEach(c => parts.add(c.toLowerCase()));
        } else
          warnings.push(
            `${table.name}: la clave foránea (${k.columns.join(', ')}) → ${k.table} es compuesta; sus columnas quedan como columnas normales.`,
          );
      });
    // Las UNIQUE de varias columnas: un grupo por cada una (UQ1, UQ2…), como en «Columnas SQL».
    const groups = new Map<string, string>();
    table.uniques
      .filter(u => u.length > 1)
      .forEach((u, i) => u.forEach(c => groups.set(c.toLowerCase(), `UQ${i + 1}`)));
    const fields: FieldDefinition[] = [];
    table.columns.forEach(column => {
      const lower = column.name.toLowerCase();
      if (parts.has(lower)) return;
      const joined = composite.get(lower);
      if (inherited.some(f => f.key.toLowerCase() === lower)) {
        warnings.push(`${table.name}.${column.name}: ya la tiene «${base!.name}»; se usa la heredada.`);
        return;
      }
      const key = joined?.key ?? simpleKeys.get(lower);
      const own = joined?.parts ?? [column.name];
      const target = key && targetOf(key.table);
      if (key && !target)
        warnings.push(`${table.name}.${column.name}: apunta a ${key.table}, que no está; queda como columna normal.`);
      const sql: SqlColumn = {
        type: target ? null : (column.type satisfies SqlDataType),
        primaryKey: own.every(c => table.primaryKey.some(k => k.toLowerCase() === c.toLowerCase())),
        nullable: column.nullable,
        unique: table.uniques.some(u => sameSet(u, own)),
        identity: column.identity,
        excluded: false,
        ...(column.defaultValue ? { defaultValue: column.defaultValue } : {}),
        ...(table.indexes.some(x => sameSet(x, own)) ? { indexed: true } : {}),
        ...(groups.has(lower) ? { uniqueGroup: groups.get(lower) } : {}),
        ...(target && key.onDelete !== 'NO ACTION' ? { onDelete: key.onDelete } : {}),
        ...(target && key.onUpdate !== 'NO ACTION' ? { onUpdate: key.onUpdate } : {}),
      };
      const field: FieldDefinition = {
        ...createField(),
        key: joined?.prefix ?? column.name,
        label: joined?.prefix ?? column.name,
        description: column.description,
        type: target ? 'nodeRef' : fieldTypeOf(column),
        options: column.options,
        referenceTypeIds: target ? [target.schema.id] : [],
        sql,
      };
      if (target) node.values[field.id] = target.node.id;
      fields.push(field);
    });
    // Índices de varias columnas: Nodaria los tiene de una; se avisa.
    table.indexes
      .filter(x => x.length > 1 && ![...composite.values()].some(c => sameSet(c.parts, x)))
      .forEach(x => warnings.push(`${table.name}: el índice (${x.join(', ')}) es de varias columnas; no se importa.`));
    schema.fields = fields;
    schema.fieldOrder = [];
  });

  warnings.push(...tables.flatMap(t => t.warnings.map(w => `${t.name}.${w}`)));
  const project: Project = {
    ...p,
    schemas: [...p.schemas, ...created.map(c => c.schema)],
    nodes: [...p.nodes, ...created.map(c => c.node)],
  };
  return { project, created: created.map(c => c.table.name), warnings };
}
