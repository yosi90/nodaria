import type { Position, Project } from './types';
import { uid, createSchema, createField } from './factories';
import { addNode } from './operations';
import { allFields } from './selectors';

export const SQL_TYPES = [
  'int',
  'bigint',
  'smallint',
  'tinyint',
  'bit',
  'decimal',
  'numeric',
  'varchar',
  'nvarchar',
  'char',
  'nchar',
  'varbinary',
  'date',
  'datetime2',
  'datetime',
  'time',
  'uniqueidentifier',
] as const;
export type SqlTypeName = (typeof SQL_TYPES)[number];
export interface SqlDataType {
  name: SqlTypeName;
  length: number | 'max' | null;
  precision: number | null;
  scale: number | null;
}
export interface DatabaseColumn {
  id: string;
  name: string;
  type: SqlDataType;
  nullable: boolean;
  identity: boolean;
}
export interface DatabaseUniqueKey {
  id: string;
  name: string;
  columnIds: string[];
}
export interface DatabaseTable {
  /** Id del nodo general que representa esta tabla. Sus columnas SQL son definición, no valores de la ficha. */
  id: string;
  schema: string;
  name: string;
  columns: DatabaseColumn[];
  primaryKey: string[];
  uniqueKeys: DatabaseUniqueKey[];
}
export interface DatabaseForeignKey {
  id: string;
  name: string;
  sourceTableId: string;
  sourceColumnIds: string[];
  targetTableId: string;
  targetColumnIds: string[];
}
export interface DatabaseDesign {
  dialect: 'sqlserver';
  tables: DatabaseTable[];
  foreignKeys: DatabaseForeignKey[];
  positions: Record<string, Position>;
}
export interface DatabaseIssue {
  severity: 'error' | 'warning';
  message: string;
  tableId?: string;
  foreignKeyId?: string;
}
export function createDatabaseTable(): DatabaseTable {
  const id = uid('column');
  return {
    id: uid('node'),
    schema: 'dbo',
    name: 'Nueva_tabla',
    columns: [{ id, name: 'Id', type: defaultSqlType('int'), nullable: false, identity: true }],
    primaryKey: [id],
    uniqueKeys: [],
  };
}
export const emptyDatabaseDesign = (): DatabaseDesign => ({
  dialect: 'sqlserver',
  tables: [],
  foreignKeys: [],
  positions: {},
});
export const tableName = (table: DatabaseTable) => `${table.schema}.${table.name}`;
export const hasLength = (name: SqlTypeName) => ['varchar', 'nvarchar', 'char', 'nchar', 'varbinary'].includes(name);
export const hasPrecision = (name: SqlTypeName) => name === 'decimal' || name === 'numeric';
export const hasTimeScale = (name: SqlTypeName) => name === 'datetime2' || name === 'time';
export const allowsIdentity = (name: SqlTypeName) => ['int', 'bigint', 'smallint', 'tinyint'].includes(name);
export function defaultSqlType(name: SqlTypeName): SqlDataType {
  return {
    name,
    length: hasLength(name) ? 50 : null,
    precision: hasPrecision(name) ? 18 : null,
    scale: hasPrecision(name) ? 2 : hasTimeScale(name) ? 7 : null,
  };
}
export function sqlTypeText(type: SqlDataType) {
  return (
    type.name +
    (hasLength(type.name)
      ? `(${type.length})`
      : hasPrecision(type.name)
        ? `(${type.precision},${type.scale})`
        : hasTimeScale(type.name)
          ? `(${type.scale})`
          : '')
  );
}
const equalIds = (a: string[], b: string[]) => a.length === b.length && a.every((id, i) => id === b[i]);
export function candidateKeys(table: DatabaseTable) {
  return [table.primaryKey, ...table.uniqueKeys.map(k => k.columnIds)].filter(ids => ids.length > 0);
}
/** Colación inicial CI: advierte conflictos sin distinguir mayúsculas. No infiere claves desde nombres. */
const nameKey = (name: string) => name.trim().toLocaleLowerCase('en-US');
function validName(name: string) {
  return name.trim().length > 0 && name.trim().length <= 128 && ![...name].some(char => char.charCodeAt(0) < 32);
}
function typeError(type: SqlDataType): string | null {
  if (hasLength(type.name)) {
    const max = ['nvarchar', 'nchar'].includes(type.name) ? 4000 : 8000;
    if (
      type.length === 'max'
        ? !['varchar', 'nvarchar', 'varbinary'].includes(type.name)
        : !Number.isInteger(type.length) || Number(type.length) < 1 || Number(type.length) > max
    )
      return `Longitud no válida para ${type.name} (1–${max}${['varchar', 'nvarchar', 'varbinary'].includes(type.name) ? ' o max' : ''}).`;
  }
  if (
    hasPrecision(type.name) &&
    (!Number.isInteger(type.precision) ||
      Number(type.precision) < 1 ||
      Number(type.precision) > 38 ||
      !Number.isInteger(type.scale) ||
      Number(type.scale) < 0 ||
      Number(type.scale) > Number(type.precision))
  )
    return 'La precisión debe estar entre 1 y 38, y la escala entre 0 y la precisión.';
  if (hasTimeScale(type.name) && (!Number.isInteger(type.scale) || Number(type.scale) < 0 || Number(type.scale) > 7))
    return 'La precisión temporal debe estar entre 0 y 7.';
  return null;
}
/** SQL Server permite longitudes distintas en cadenas; decimal/numeric requieren precisión y escala iguales. */
export function compatibleSqlTypes(a: SqlDataType, b: SqlDataType) {
  const canonical = (name: SqlTypeName) => (name === 'numeric' ? 'decimal' : name);
  if (canonical(a.name) !== canonical(b.name)) return false;
  if (hasPrecision(a.name)) return a.precision === b.precision && a.scale === b.scale;
  if (hasTimeScale(a.name)) return a.scale === b.scale;
  return true;
}
export function validateDatabaseDesign(design: DatabaseDesign): DatabaseIssue[] {
  const issues: DatabaseIssue[] = [];
  const error = (message: string, tableId?: string, foreignKeyId?: string) =>
    issues.push({ severity: 'error', message, tableId, foreignKeyId });
  const usedTables = new Set<string>();
  const usedIds = new Set<string>();
  const constraintNames = new Set<string>();
  for (const table of design.tables) {
    const title = tableName(table);
    if (usedIds.has(table.id)) error('Hay ids de tabla repetidos.', table.id);
    usedIds.add(table.id);
    const key = JSON.stringify([nameKey(table.schema), nameKey(table.name)]);
    if (!validName(table.name) || !validName(table.schema))
      error(`${title}: el nombre de tabla y esquema debe tener entre 1 y 128 caracteres.`, table.id);
    if (usedTables.has(key)) error(`${title}: nombre de tabla repetido.`, table.id);
    usedTables.add(key);
    const colIds = new Set<string>();
    const colNames = new Set<string>();
    for (const col of table.columns) {
      if (colIds.has(col.id)) error(`${title}: id de columna repetido.`, table.id);
      colIds.add(col.id);
      if (!validName(col.name)) error(`${title}: el nombre de columna debe tener entre 1 y 128 caracteres.`, table.id);
      if (colNames.has(nameKey(col.name))) error(`${title}: columna ${col.name} repetida.`, table.id);
      colNames.add(nameKey(col.name));
      const problem = typeError(col.type);
      if (problem) error(`${title}.${col.name}: ${problem}`, table.id);
      if (col.identity && (!allowsIdentity(col.type.name) || col.nullable))
        error(`${title}.${col.name}: IDENTITY requiere entero y NOT NULL en esta versión.`, table.id);
    }
    if (table.columns.filter(c => c.identity).length > 1)
      error(`${title}: solo se admite una columna IDENTITY.`, table.id);
    if (!table.columns.length)
      issues.push({
        severity: 'warning',
        tableId: table.id,
        message: `${title}: añade columnas para completar la tabla.`,
      });
    if (!table.primaryKey.length)
      issues.push({ severity: 'warning', tableId: table.id, message: `${title}: todavía no tiene clave primaria.` });
    const checkKey = (ids: string[], label: string) => {
      if (!ids.length || new Set(ids).size !== ids.length || ids.some(id => !colIds.has(id)))
        error(`${title}: ${label} debe usar columnas existentes sin repetir.`, table.id);
      if (ids.length > 32) error(`${title}: ${label} no puede superar 32 columnas.`, table.id);
      if (ids.some(id => table.columns.find(c => c.id === id)?.type.length === 'max'))
        error(`${title}: ${label} no admite columnas de longitud max.`, table.id);
    };
    if (table.primaryKey.length) {
      checkKey(table.primaryKey, 'la PK');
      if (table.primaryKey.some(id => table.columns.find(c => c.id === id)?.nullable))
        error(`${title}: las columnas de la PK deben ser NOT NULL.`, table.id);
    }
    const keyIds = new Set<string>();
    for (const unique of table.uniqueKeys) {
      if (keyIds.has(unique.id)) error(`${title}: id de restricción UNIQUE repetido.`, table.id);
      keyIds.add(unique.id);
      checkKey(unique.columnIds, 'UNIQUE');
      const name = JSON.stringify([nameKey(table.schema), nameKey(unique.name)]);
      if (!validName(unique.name) || constraintNames.has(name))
        error(`${title}: nombre de restricción ${unique.name} vacío o repetido en el esquema.`, table.id);
      constraintNames.add(name);
    }
  }
  const fkIds = new Set<string>();
  for (const fk of design.foreignKeys) {
    const source = design.tables.find(t => t.id === fk.sourceTableId);
    const target = design.tables.find(t => t.id === fk.targetTableId);
    const fail = (message: string) => error(`${fk.name || 'FK'}: ${message}`, source?.id, fk.id);
    if (fkIds.has(fk.id)) fail('id de FK repetido.');
    fkIds.add(fk.id);
    if (!source || !target) {
      fail('la tabla de origen o destino no existe.');
      continue;
    }
    const name = JSON.stringify([nameKey(source.schema), nameKey(fk.name)]);
    if (!validName(fk.name) || constraintNames.has(name)) fail('nombre de restricción vacío o repetido en el esquema.');
    constraintNames.add(name);
    if (
      !fk.sourceColumnIds.length ||
      fk.sourceColumnIds.length !== fk.targetColumnIds.length ||
      new Set(fk.sourceColumnIds).size !== fk.sourceColumnIds.length ||
      new Set(fk.targetColumnIds).size !== fk.targetColumnIds.length
    ) {
      fail('debe emparejar el mismo número de columnas, sin repetir.');
      continue;
    }
    if (!candidateKeys(target).some(ids => equalIds(ids, fk.targetColumnIds)))
      fail('el destino debe ser una PK o UNIQUE completa, en su orden declarado.');
    fk.sourceColumnIds.forEach((id, i) => {
      const a = source.columns.find(c => c.id === id);
      const b = target.columns.find(c => c.id === fk.targetColumnIds[i]);
      if (!a || !b) fail('una columna no existe.');
      else if (!compatibleSqlTypes(a.type, b.type))
        fail(`${source.name}.${a.name} y ${target.name}.${b.name} tienen tipos incompatibles.`);
    });
  }
  return issues;
}

export type DatabaseEdit =
  | { kind: 'save-table'; table: DatabaseTable; typeId?: string }
  | { kind: 'delete-table'; id: string }
  | { kind: 'save-fk'; foreignKey: DatabaseForeignKey }
  | { kind: 'delete-fk'; id: string }
  | { kind: 'positions'; positions: Record<string, Position | null> };

/** Borrar una columna retira constraints completos dependientes, nunca los reduce a otra clave. */
export function editDatabaseDesign(design: DatabaseDesign, edit: DatabaseEdit): DatabaseDesign {
  if (edit.kind === 'positions') {
    const positions = { ...design.positions };
    for (const [id, pos] of Object.entries(edit.positions)) {
      if (pos) positions[id] = pos;
      else delete positions[id];
    }
    return { ...design, positions };
  }
  if (edit.kind === 'delete-fk') return { ...design, foreignKeys: design.foreignKeys.filter(fk => fk.id !== edit.id) };
  if (edit.kind === 'save-fk')
    return {
      ...design,
      foreignKeys: [...design.foreignKeys.filter(fk => fk.id !== edit.foreignKey.id), edit.foreignKey],
    };
  if (edit.kind === 'delete-table') {
    const positions = { ...design.positions };
    delete positions[edit.id];
    return {
      ...design,
      tables: design.tables.filter(t => t.id !== edit.id),
      foreignKeys: design.foreignKeys.filter(fk => fk.sourceTableId !== edit.id && fk.targetTableId !== edit.id),
      positions,
    };
  }
  const ids = new Set(edit.table.columns.map(c => c.id));
  const table = {
    ...edit.table,
    primaryKey: edit.table.primaryKey.every(id => ids.has(id)) ? edit.table.primaryKey : [],
    uniqueKeys: edit.table.uniqueKeys.filter(key => key.columnIds.every(id => ids.has(id))),
  };
  return {
    ...design,
    tables: design.tables.some(t => t.id === table.id)
      ? design.tables.map(t => (t.id === table.id ? table : t))
      : [...design.tables, table],
    foreignKeys: design.foreignKeys.filter(
      fk =>
        !(fk.sourceTableId === table.id && fk.sourceColumnIds.some(id => !ids.has(id))) &&
        !(fk.targetTableId === table.id && fk.targetColumnIds.some(id => !ids.has(id))),
    ),
  };
}
export function applyDatabaseEdit(project: Project, edit: DatabaseEdit): Project {
  const design = project.databaseDesign ?? emptyDatabaseDesign();
  const next = editDatabaseDesign(design, edit);
  if (
    edit.kind === 'positions' &&
    Object.entries(edit.positions).some(
      ([id, pos]) =>
        !design.tables.some(t => t.id === id) || (pos !== null && (!Number.isFinite(pos.x) || !Number.isFinite(pos.y))),
    )
  )
    return project;
  if (['save-table', 'save-fk'].includes(edit.kind) && validateDatabaseDesign(next).some(i => i.severity === 'error'))
    return project;
  if (edit.kind === 'save-table' && !project.nodes.some(n => n.id === edit.table.id)) {
    let type = edit.typeId
      ? project.schemas.find(s => s.id === edit.typeId)
      : project.schemas.find(s => s.kind === 'entity' && !s.isAbstract && s.name === 'Tabla');
    if (edit.typeId && (!type || type.kind !== 'entity' || type.isAbstract)) return project;
    if (!type) {
      type = {
        ...createSchema('Tabla', 'entity'),
        icon: 'table-2',
        fields: [{ ...createField(), label: 'Nombre', key: 'nombre', isTitle: true }],
      };
      project = { ...project, schemas: [...project.schemas, type] };
    }
    project = addNode(project, type.id, null, edit.table.id).project;
    const title =
      allFields(project, type.id).find(f => f.isTitle) ?? allFields(project, type.id).find(f => f.type === 'text');
    if (title)
      project = {
        ...project,
        nodes: project.nodes.map(n =>
          n.id === edit.table.id ? { ...n, values: { ...n.values, [title.id]: edit.table.name } } : n,
        ),
      };
  }
  return {
    ...project,
    databaseDesign: next,
    view:
      edit.kind === 'save-table' && !design.tables.length ? { ...project.view, databaseSchema: true } : project.view,
  };
}

export { reconcileDatabaseNodes } from './databaseNodes';

/** Datos estructuralmente dañados se rechazan para que la capa de almacenamiento rescate el original. */
export function readDatabaseDesign(raw: unknown): DatabaseDesign | undefined {
  if (raw === undefined) return undefined;
  const object = (value: unknown): Record<string, unknown> => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Esquema BD no válido');
    return value as Record<string, unknown>;
  };
  const string = (v: unknown) => {
    if (typeof v !== 'string') throw new Error('Texto de esquema BD no válido');
    return v;
  };
  const bool = (v: unknown) => {
    if (typeof v !== 'boolean') throw new Error('Booleano de esquema BD no válido');
    return v;
  };
  const array = (v: unknown): unknown[] => {
    if (!Array.isArray(v)) throw new Error('Lista de esquema BD no válida');
    return v;
  };
  const ids = (v: unknown) => array(v).map(string);
  const numberOrNull = (v: unknown): number | null => {
    if (v === null) return null;
    if (typeof v !== 'number' || !Number.isFinite(v)) throw new Error('Número de esquema BD no válido');
    return v;
  };
  const d = object(raw);
  if (d.dialect !== 'sqlserver') throw new Error('Motor de esquema BD no admitido');
  const tables = array(d.tables).map(value => {
    const t = object(value);
    return {
      id: string(t.id),
      schema: string(t.schema),
      name: string(t.name),
      primaryKey: ids(t.primaryKey),
      uniqueKeys: array(t.uniqueKeys).map(value => {
        const k = object(value);
        return { id: string(k.id), name: string(k.name), columnIds: ids(k.columnIds) };
      }),
      columns: array(t.columns).map(value => {
        const c = object(value);
        const type = object(c.type);
        const name = string(type.name);
        if (!(SQL_TYPES as readonly string[]).includes(name)) throw new Error('Tipo SQL no admitido');
        return {
          id: string(c.id),
          name: string(c.name),
          nullable: bool(c.nullable),
          identity: bool(c.identity),
          type: {
            name: name as SqlTypeName,
            length: type.length === 'max' ? ('max' as const) : numberOrNull(type.length),
            precision: numberOrNull(type.precision),
            scale: numberOrNull(type.scale),
          },
        };
      }),
    };
  });
  const foreignKeys = array(d.foreignKeys).map(value => {
    const fk = object(value);
    return {
      id: string(fk.id),
      name: string(fk.name),
      sourceTableId: string(fk.sourceTableId),
      targetTableId: string(fk.targetTableId),
      sourceColumnIds: ids(fk.sourceColumnIds),
      targetColumnIds: ids(fk.targetColumnIds),
    };
  });
  const positions = Object.fromEntries(
    Object.entries(object(d.positions)).map(([id, value]) => {
      const p = object(value);
      const x = numberOrNull(p.x);
      const y = numberOrNull(p.y);
      if (x === null || y === null) throw new Error('Posición BD no válida');
      return [id, { x, y }];
    }),
  );
  return { dialect: 'sqlserver', tables, foreignKeys, positions };
}
