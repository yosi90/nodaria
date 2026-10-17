import { isFieldLink } from './library';
import { allFields, getSchema, inheritedSchemas } from './selectors';
import type { FieldDefinition, Node, Project, Schema } from './types';

/*
 * Bases de datos. Un tipo de entidad marcado como tabla (`Schema.table`, heredable) dibuja sus nodos
 * como tablas en la disposición «Base de datos»: sus atributos efectivos (propios, preformas y
 * heredados) son las columnas y sus referencias a otra tabla, las claves foráneas. Fuera de esa
 * disposición los nodos siguen siendo nodos normales.
 *
 * Los metadatos SQL de cada atributo viven en `FieldDefinition.sql`; `null` deja que se deduzcan del
 * tipo del atributo, así que marcar un tipo como tabla ya produce columnas sin rellenar nada.
 * Dialecto: SQL Server.
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
export type SqlTypeName = (typeof SQL_TYPES)[number];

export interface SqlDataType {
  name: SqlTypeName;
  /** Longitud de los textos y binarios; `'max'` solo en varchar, nvarchar y varbinary. */
  length: number | 'max' | null;
  precision: number | null;
  scale: number | null;
}

/** Qué hace una clave foránea al borrar o actualizar la fila referenciada (`ON DELETE` / `ON UPDATE`). */
export const FK_ACTIONS = ['NO ACTION', 'CASCADE', 'SET NULL', 'SET DEFAULT'] as const;
export type FkAction = (typeof FK_ACTIONS)[number];

/** Metadatos SQL de un atributo. Se guardan completos en cuanto el usuario cambia alguno. */
export interface SqlColumn {
  /** `null` = se deduce del tipo del atributo (y, en una referencia, de la clave de la tabla destino). */
  type: SqlDataType | null;
  primaryKey: boolean;
  nullable: boolean;
  unique: boolean;
  identity: boolean;
  /** No forma parte de la tabla: documenta el nodo (por defecto, el título, los calculados y las referencias múltiples). */
  excluded: boolean;
  /** Valor por defecto: una expresión de SQL Server (`0`, `N'texto'`, `GETDATE()`); vacío = sin DEFAULT. */
  defaultValue?: string | null;
  /** Índice no único sobre la columna (`CREATE INDEX`). */
  indexed?: boolean;
  /** Nombre de una UNIQUE compuesta: las columnas con el mismo grupo forman una sola restricción. */
  uniqueGroup?: string | null;
  /** En una clave foránea: qué hacer al borrar o actualizar la fila referenciada. */
  onDelete?: FkAction;
  onUpdate?: FkAction;
}

export const hasLength = (name: SqlTypeName) => ['char', 'varchar', 'nchar', 'nvarchar', 'varbinary'].includes(name);
export const allowsMax = (name: SqlTypeName) => ['varchar', 'nvarchar', 'varbinary'].includes(name);
export const hasPrecision = (name: SqlTypeName) => name === 'decimal' || name === 'numeric';
export const hasTimeScale = (name: SqlTypeName) => ['time', 'datetime2'].includes(name);
export const allowsIdentity = (name: SqlTypeName) =>
  ['int', 'bigint', 'smallint', 'tinyint', 'decimal', 'numeric'].includes(name);
const maxLength = (name: SqlTypeName) => (name === 'nchar' || name === 'nvarchar' ? 4000 : 8000);

export function sqlType(name: SqlTypeName, length: number | 'max' | null = null, precision?: number, scale?: number) {
  return {
    name,
    length: hasLength(name) ? (length ?? 50) : null,
    precision: hasPrecision(name) ? (precision ?? 18) : null,
    scale: hasPrecision(name) ? (scale ?? 0) : hasTimeScale(name) ? (scale ?? 7) : null,
  } satisfies SqlDataType;
}

export function sqlTypeText(type: SqlDataType) {
  if (hasLength(type.name)) return `${type.name}(${type.length})`;
  if (hasPrecision(type.name)) return `${type.name}(${type.precision},${type.scale})`;
  if (hasTimeScale(type.name) && type.scale !== 7) return `${type.name}(${type.scale})`;
  return type.name;
}

/** Problema de un tipo SQL (longitud, precisión o escala fuera de rango), o `null`. */
export function sqlTypeError(type: SqlDataType): string | null {
  if (hasLength(type.name)) {
    const max = maxLength(type.name);
    if (type.length === 'max') return allowsMax(type.name) ? null : `${type.name} no admite «max».`;
    if (!Number.isInteger(type.length) || Number(type.length) < 1 || Number(type.length) > max)
      return `La longitud de ${type.name} va de 1 a ${max}${allowsMax(type.name) ? ' (o max)' : ''}.`;
  }
  if (hasPrecision(type.name)) {
    const p = Number(type.precision);
    const s = Number(type.scale);
    if (!Number.isInteger(p) || p < 1 || p > 38) return 'La precisión va de 1 a 38.';
    if (!Number.isInteger(s) || s < 0 || s > p) return 'La escala va de 0 a la precisión.';
  }
  if (hasTimeScale(type.name) && (!Number.isInteger(type.scale) || Number(type.scale) < 0 || Number(type.scale) > 7))
    return 'La precisión de fracciones de segundo va de 0 a 7.';
  return null;
}

const ALIASES: Record<string, SqlTypeName> = {
  int: 'int',
  integer: 'int',
  entero: 'int',
  bigint: 'bigint',
  smallint: 'smallint',
  tinyint: 'tinyint',
  bit: 'bit',
  bool: 'bit',
  boolean: 'bit',
  booleano: 'bit',
  decimal: 'decimal',
  numeric: 'numeric',
  numerico: 'numeric',
  float: 'float',
  real: 'float',
  money: 'money',
  char: 'char',
  varchar: 'varchar',
  nchar: 'nchar',
  nvarchar: 'nvarchar',
  text: 'nvarchar',
  texto: 'nvarchar',
  string: 'nvarchar',
  cadena: 'nvarchar',
  varbinary: 'varbinary',
  date: 'date',
  fecha: 'date',
  time: 'time',
  hora: 'time',
  datetime: 'datetime',
  datetime2: 'datetime2',
  uniqueidentifier: 'uniqueidentifier',
  guid: 'uniqueidentifier',
  uuid: 'uniqueidentifier',
};

/**
 * Interpreta una anotación escrita a mano como tipo SQL: «numeric(10,2)», «texto(50)», «Datetime»,
 * «Si/No»… Devuelve `null` si no lo parece (por ejemplo «Lista de opciones»).
 */
export function parseSqlAnnotation(text: unknown): SqlDataType | null {
  if (typeof text !== 'string') return null;
  const clean = text.trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  if (/^si\s*\/\s*no$/.test(clean)) return sqlType('bit');
  const match = clean.match(/^([a-z][a-z0-9]*)\s*(?:\(\s*(max|\d+)\s*(?:,\s*(\d+)\s*)?\))?$/);
  const name = match && ALIASES[match[1]];
  if (!match || !name) return null;
  const [, word, first, second] = match;
  if (hasLength(name)) {
    // «texto» sin longitud es un texto largo; «char» sin longitud mide 1, como en SQL Server.
    let length: number | 'max' = 50;
    if (first) length = first === 'max' ? 'max' : Number(first);
    else if (['text', 'texto', 'string', 'cadena'].includes(word)) length = 'max';
    else if (name === 'char' || name === 'nchar') length = 1;
    const type = sqlType(name, length);
    return sqlTypeError(type) ? null : type;
  }
  if (first === 'max') return null;
  if (hasPrecision(name)) {
    const type = sqlType(name, null, first ? Number(first) : 18, second ? Number(second) : 0);
    return sqlTypeError(type) ? null : type;
  }
  if (hasTimeScale(name)) {
    const type = sqlType(name, null, undefined, first ? Number(first) : 7);
    return sqlTypeError(type) ? null : type;
  }
  return first ? null : sqlType(name);
}

/** Si el tipo (o alguno de sus ancestros) es una tabla. */
export function isTableType(p: Project, typeId: string) {
  return inheritedSchemas(p, typeId).some(s => s.kind === 'entity' && s.table);
}
/** Ancestro (o el propio tipo) que lo marca como tabla. */
export const tableOrigin = (p: Project, typeId: string): Schema | undefined =>
  inheritedSchemas(p, typeId).find(s => s.kind === 'entity' && s.table);
export const tableTypes = (p: Project) => p.schemas.filter(s => s.kind === 'entity' && isTableType(p, s.id));
export const isTableNode = (p: Project, node: Node) => isTableType(p, node.typeId);

/** Metadatos por defecto de un atributo que aún no los tiene. */
export function defaultSqlColumn(field: FieldDefinition): SqlColumn {
  return {
    type: null,
    primaryKey: false,
    nullable: !field.required,
    unique: false,
    identity: false,
    excluded: field.isTitle || field.type === 'computed' || field.type === 'nodeRefs',
  };
}
export const sqlColumnOf = (field: FieldDefinition): SqlColumn => field.sql ?? defaultSqlColumn(field);

/** Metadatos SQL propios de un tipo, por atributo; descarta los que no se entienden. */
export function readSqlOverrides(raw: unknown): Record<string, SqlColumn> {
  if (!raw || typeof raw !== 'object') return {};
  const result: Record<string, SqlColumn> = {};
  Object.entries(raw as Record<string, unknown>).forEach(([id, value]) => {
    const sql = readSqlColumn(value);
    if (sql) result[id] = sql;
  });
  return result;
}

/** Lee los metadatos SQL de un JSON cargado o importado; lo que no se entiende vuelve a los deducidos. */
export function readSqlColumn(raw: unknown): SqlColumn | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const flag = (key: string) => r[key] === true;
  const column: SqlColumn = {
    type: readSqlType(r.type),
    primaryKey: flag('primaryKey'),
    nullable: flag('primaryKey') ? false : r.nullable !== false,
    unique: flag('unique'),
    identity: flag('identity'),
    excluded: flag('excluded'),
  };
  // Las ampliaciones (2026-10-17) solo se guardan cuando tienen un valor: los datos de antes no cambian.
  if (typeof r.defaultValue === 'string' && r.defaultValue.trim())
    column.defaultValue = r.defaultValue.trim().slice(0, 200);
  if (flag('indexed')) column.indexed = true;
  if (typeof r.uniqueGroup === 'string' && r.uniqueGroup.trim()) column.uniqueGroup = r.uniqueGroup.trim().slice(0, 60);
  const action = (value: unknown) =>
    FK_ACTIONS.includes(value as FkAction) && value !== 'NO ACTION' ? (value as FkAction) : undefined;
  if (action(r.onDelete)) column.onDelete = action(r.onDelete);
  if (action(r.onUpdate)) column.onUpdate = action(r.onUpdate);
  return column;
}

/**
 * Problema de una expresión DEFAULT, o `null`. No se interpreta el SQL: solo se rechaza lo que rompería el
 * script (punto y coma, comentarios, comillas o paréntesis sin cerrar).
 */
export function sqlDefaultError(expression: string): string | null {
  const text = expression.trim();
  if (!text) return null;
  if (/;|--|\/\*/.test(text)) return 'el valor por defecto no admite «;» ni comentarios.';
  if ((text.match(/'/g) ?? []).length % 2) return 'el valor por defecto tiene comillas sin cerrar.';
  let depth = 0;
  for (const char of text.replace(/'[^']*'/g, '')) {
    depth += char === '(' ? 1 : char === ')' ? -1 : 0;
    if (depth < 0) break;
  }
  return depth === 0 ? null : 'el valor por defecto tiene paréntesis sin cerrar.';
}
function readSqlType(raw: unknown): SqlDataType | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  if (!SQL_TYPES.includes(r.name as SqlTypeName)) return null;
  const name = r.name as SqlTypeName;
  const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : undefined);
  return sqlType(name, r.length === 'max' ? 'max' : (num(r.length) ?? null), num(r.precision), num(r.scale));
}

/** Tipo deducido del tipo de atributo, sin mirar referencias. */
function deducedType(field: FieldDefinition): SqlDataType {
  switch (field.type) {
    case 'longText':
    case 'tags':
      return sqlType('nvarchar', 'max');
    case 'number':
      return sqlType('int');
    case 'boolean':
      return sqlType('bit');
    case 'date':
      return sqlType('date');
    case 'url':
      return sqlType('nvarchar', 2048);
    case 'color':
      return sqlType('char', 7);
    case 'scale':
      return sqlType('tinyint');
    case 'gender':
      return sqlType('char', 1);
    case 'image':
      return sqlType('varbinary', 'max');
    default:
      return sqlType('nvarchar', 50);
  }
}

export type ColumnOrigin = { kind: 'own' } | { kind: 'library' } | { kind: 'inherited'; from: Schema };

export interface TableColumn {
  field: FieldDefinition;
  sql: SqlColumn;
  /** Tipo efectivo: el explícito o el deducido. */
  type: SqlDataType;
  /** Se deduce (no hay tipo explícito). */
  deduced: boolean;
  /** Es una referencia a un nodo: clave foránea cuando el destino es una tabla. */
  reference: boolean;
  origin: ColumnOrigin;
}

/** Tipo tabla al que apuntaría una referencia: el primero admitido que sea tabla, o el del nodo del valor inicial. */
export function referencedTable(p: Project, field: FieldDefinition): Schema | undefined {
  const admitted = field.referenceTypeIds.map(id => getSchema(p, id)).find(s => s && isTableType(p, s.id));
  if (admitted) return admitted;
  const node = typeof field.defaultValue === 'string' ? p.nodes.find(n => n.id === field.defaultValue) : undefined;
  return node && isTableType(p, node.typeId) ? getSchema(p, node.typeId) : undefined;
}

function columnType(p: Project, field: FieldDefinition, sql: SqlColumn, seen: Set<string>): SqlDataType {
  if (sql.type) return sql.type;
  if (field.type === 'nodeRef' && !seen.has(field.id)) {
    const target = referencedTable(p, field);
    const keys = target ? primaryKey(p, target.id, new Set([...seen, field.id])) : [];
    if (keys.length === 1) return keys[0].type;
    return sqlType('int');
  }
  return deducedType(field);
}

function originOf(p: Project, typeId: string, field: FieldDefinition): ColumnOrigin {
  const chain = inheritedSchemas(p, typeId);
  const own = chain[chain.length - 1];
  const declares = (s: Schema) => s.fields.some(f => (isFieldLink(f) ? f.ref : f.id) === field.id);
  if (own && declares(own))
    return own.fields.some(f => isFieldLink(f) && f.ref === field.id) ? { kind: 'library' } : { kind: 'own' };
  const from = [...chain].reverse().find(declares);
  return from ? { kind: 'inherited', from } : { kind: 'own' };
}

/**
 * Metadatos SQL de un atributo en un tipo: los del atributo, sustituidos por los que fije el ancestro
 * más cercano (o el propio tipo) en `sqlOverrides`. Así un hijo cambia una columna heredada o una
 * preforma sin tocar al padre ni a los demás tipos que la usan.
 */
export function columnSqlIn(p: Project, typeId: string, field: FieldDefinition): SqlColumn {
  const chain = inheritedSchemas(p, typeId);
  for (let i = chain.length - 1; i >= 0; i--) {
    const override = chain[i].sqlOverrides?.[field.id];
    if (override) return override;
  }
  return sqlColumnOf(field);
}
/** Tipo que fija los metadatos SQL de un atributo en `typeId` (él mismo o un ancestro), si lo hay. */
export function sqlOverrideOwner(p: Project, typeId: string, fieldId: string): Schema | undefined {
  return [...inheritedSchemas(p, typeId)].reverse().find(s => s.sqlOverrides?.[fieldId]);
}

function columnsOf(p: Project, typeId: string, seen: Set<string>): TableColumn[] {
  return allFields(p, typeId).map(field => {
    const sql = columnSqlIn(p, typeId, field);
    return {
      field,
      sql,
      type: columnType(p, field, sql, seen),
      deduced: !sql.type,
      reference: field.type === 'nodeRef' || field.type === 'nodeRefs',
      origin: originOf(p, typeId, field),
    };
  });
}
function primaryKey(p: Project, typeId: string, seen: Set<string>) {
  return columnsOf(p, typeId, seen).filter(c => !c.sql.excluded && c.sql.primaryKey);
}

/** Todos los atributos efectivos del tipo con sus metadatos SQL, incluidos los excluidos de la tabla. */
export const tableFields = (p: Project, typeId: string) => columnsOf(p, typeId, new Set());
/** Columnas de la tabla, en el orden de los atributos. */
export const tableColumns = (p: Project, typeId: string) => tableFields(p, typeId).filter(c => !c.sql.excluded);

/** Texto de una columna: «int IDENTITY · PK», «nvarchar(50) · NOT NULL», «date». */
export function columnText(c: TableColumn) {
  const type = sqlTypeText(c.type) + (c.sql.identity ? ' IDENTITY' : '');
  return c.sql.primaryKey ? `${type} · PK` : c.sql.nullable ? type : `${type} · NOT NULL`;
}

const definitionCache = new WeakMap<Project, Map<string, Map<string, string>>>();
/**
 * En un nodo tabla, cada columna que no es una referencia es definición, no un dato de la ficha: su
 * «valor» es su tipo SQL, que se deduce del tipo y no se escribe en el nodo (así no se desfasa al
 * cambiarlo). Las referencias siguen siendo valores: dicen a qué tabla apunta cada clave foránea.
 * Devuelve, por id de atributo, el texto que ocupa su sitio; vacío si el tipo no es una tabla.
 */
export function columnDefinitions(p: Project, typeId: string): Map<string, string> {
  let byType = definitionCache.get(p);
  if (!byType) definitionCache.set(p, (byType = new Map()));
  let result = byType.get(typeId);
  if (!result) {
    result = new Map(
      isTableType(p, typeId)
        ? tableColumns(p, typeId)
            .filter(c => !c.reference)
            .map(c => [c.field.id, columnText(c)])
        : [],
    );
    byType.set(typeId, result);
  }
  return result;
}

/** Una clave foránea dibujada: una columna de referencia de un nodo tabla que apunta a otro nodo tabla. */
export interface ForeignKeyLink {
  sourceId: string;
  fieldId: string;
  targetId: string;
  /** Columna de la clave primaria destino cuando es simple; `null` si es compuesta o no la hay. */
  targetFieldId: string | null;
}

/** Claves foráneas que se dibujan, a partir de los valores de las referencias de cada nodo tabla. */
export function foreignKeyLinks(p: Project): ForeignKeyLink[] {
  const columns = new Map<string, TableColumn[]>();
  const columnsFor = (typeId: string) => {
    if (!columns.has(typeId)) columns.set(typeId, isTableType(p, typeId) ? tableColumns(p, typeId) : []);
    return columns.get(typeId)!;
  };
  const nodes = new Map(p.nodes.map(n => [n.id, n]));
  const result: ForeignKeyLink[] = [];
  p.nodes.forEach(node => {
    columnsFor(node.typeId)
      .filter(c => c.reference)
      .forEach(c => {
        const raw = node.values[c.field.id];
        const ids = typeof raw === 'string' ? [raw] : Array.isArray(raw) ? raw : [];
        ids.forEach(targetId => {
          const target = nodes.get(targetId);
          if (!target || !isTableType(p, target.typeId)) return;
          const keys = columnsFor(target.typeId).filter(k => k.sql.primaryKey);
          result.push({
            sourceId: node.id,
            fieldId: c.field.id,
            targetId,
            targetFieldId: keys.length === 1 ? keys[0].field.id : null,
          });
        });
      });
  });
  return result;
}

export interface TableIssue {
  severity: 'error' | 'warning';
  message: string;
  fieldId?: string;
}

/** Avisos del diseño de una tabla. No bloquean: se enseñan en el editor del tipo. */
export function tableIssues(p: Project, typeId: string): TableIssue[] {
  const issues: TableIssue[] = [];
  const columns = tableColumns(p, typeId);
  const keys = columns.filter(c => c.sql.primaryKey);
  if (!columns.length) issues.push({ severity: 'warning', message: 'La tabla no tiene columnas.' });
  else if (!keys.length)
    issues.push({
      severity: 'warning',
      message: 'Sin clave primaria: marca la columna (o columnas) que identifican cada fila.',
    });
  const names = new Map<string, number>();
  columns.forEach(c => names.set(c.field.key.toLowerCase(), (names.get(c.field.key.toLowerCase()) ?? 0) + 1));
  names.forEach((count, name) => {
    if (count > 1) issues.push({ severity: 'error', message: `Hay ${count} columnas llamadas «${name}».` });
  });
  if (columns.filter(c => c.sql.identity).length > 1)
    issues.push({ severity: 'error', message: 'Solo puede haber una columna IDENTITY por tabla.' });
  columns.forEach(c => {
    const error = sqlTypeError(c.type);
    if (error) issues.push({ severity: 'error', message: `${c.field.label}: ${error}`, fieldId: c.field.id });
    if (c.sql.primaryKey && c.sql.nullable)
      issues.push({
        severity: 'error',
        message: `${c.field.label}: una clave primaria no admite nulos.`,
        fieldId: c.field.id,
      });
    if (c.sql.identity && !allowsIdentity(c.type.name))
      issues.push({
        severity: 'error',
        message: `${c.field.label}: IDENTITY solo vale en enteros o decimales sin escala.`,
        fieldId: c.field.id,
      });
    const defaultError = c.sql.defaultValue ? sqlDefaultError(c.sql.defaultValue) : null;
    if (defaultError)
      issues.push({ severity: 'error', message: `${c.field.label}: ${defaultError}`, fieldId: c.field.id });
    if (c.sql.defaultValue && c.sql.identity)
      issues.push({
        severity: 'error',
        message: `${c.field.label}: una columna IDENTITY no admite valor por defecto.`,
        fieldId: c.field.id,
      });
    if (c.field.type === 'nodeRef') {
      for (const [rule, action] of [
        ['Al borrar', c.sql.onDelete],
        ['Al actualizar', c.sql.onUpdate],
      ] as const) {
        if (action === 'SET NULL' && (!c.sql.nullable || c.sql.primaryKey))
          issues.push({
            severity: 'error',
            message: `${c.field.label}: «${rule}: SET NULL» necesita que la columna admita nulos.`,
            fieldId: c.field.id,
          });
        if (action === 'SET DEFAULT' && !c.sql.defaultValue)
          issues.push({
            severity: 'error',
            message: `${c.field.label}: «${rule}: SET DEFAULT» necesita un valor por defecto.`,
            fieldId: c.field.id,
          });
      }
    }
    const group = c.sql.uniqueGroup?.trim();
    if (group && columns.filter(o => o.sql.uniqueGroup?.trim() === group).length === 1)
      issues.push({
        severity: 'warning',
        message: `${c.field.label}: el grupo único «${group}» solo tiene esta columna; para eso basta «Único».`,
        fieldId: c.field.id,
      });
    if (c.field.type === 'nodeRefs')
      issues.push({
        severity: 'warning',
        message: `${c.field.label}: una referencia múltiple no cabe en una columna; usa una tabla intermedia.`,
        fieldId: c.field.id,
      });
    if (c.field.type === 'nodeRef') {
      const target = referencedTable(p, c.field);
      const targetKeys = target ? tableColumns(p, target.id).filter(k => k.sql.primaryKey) : [];
      // Hacia una clave primaria compuesta, el script abre la referencia en una columna por cada parte.
      if (target && targetKeys.length === 1 && !c.deduced && sqlTypeText(targetKeys[0].type) !== sqlTypeText(c.type))
        issues.push({
          severity: 'warning',
          message: `${c.field.label}: es ${sqlTypeText(c.type)}, pero la clave de «${target.name}» es ${sqlTypeText(targetKeys[0].type)}.`,
          fieldId: c.field.id,
        });
    }
  });
  return issues;
}

/**
 * Atributos de las tablas (de un tipo o de todas) cuyo valor inicial es una anotación de tipo SQL que
 * aún no se usa. Cada atributo aparece una vez aunque lo compartan varias tablas.
 */
export function sqlAnnotations(p: Project, typeId?: string) {
  const seen = new Set<string>();
  return (typeId ? [typeId] : tableTypes(p).map(s => s.id)).flatMap(id =>
    tableFields(p, id).flatMap(c => {
      if (c.field.sql?.type || c.reference || seen.has(c.field.id)) return [];
      seen.add(c.field.id);
      const type = parseSqlAnnotation(c.field.defaultValue);
      return type ? [{ field: c.field, type, text: String(c.field.defaultValue) }] : [];
    }),
  );
}

/** Cambia un atributo allí donde esté definido: en un tipo (propio o heredado) o en la biblioteca. */
export function replaceField(p: Project, field: FieldDefinition): Project {
  if (p.fieldLibrary.some(f => f.id === field.id))
    return { ...p, fieldLibrary: p.fieldLibrary.map(f => (f.id === field.id ? field : f)) };
  const schemas = p.schemas.map(s =>
    s.fields.some(f => !isFieldLink(f) && f.id === field.id)
      ? { ...s, fields: s.fields.map(f => (!isFieldLink(f) && f.id === field.id ? field : f)) }
      : s,
  );
  return { ...p, schemas };
}

const findField = (p: Project, id: string) =>
  p.fieldLibrary.find(f => f.id === id) ??
  p.schemas.flatMap(s => s.fields).find((f): f is FieldDefinition => !isFieldLink(f) && f.id === id);

// Una clave primaria nunca admite nulos; IDENTITY solo tiene sentido en una columna incluida.
const consistent = (sql: SqlColumn): SqlColumn => ({
  ...sql,
  nullable: sql.primaryKey ? false : sql.nullable,
  identity: sql.identity && !sql.excluded,
});

/** Fija los metadatos SQL de un atributo en su definición (vale para todos sus tipos); `null` = deducidos. */
export function setFieldSql(p: Project, fieldId: string, sql: SqlColumn | null): Project {
  const field = findField(p, fieldId);
  if (!field) return p;
  return replaceField(p, { ...field, sql: sql && consistent(sql) });
}

/**
 * Cambia una columna desde el editor de un tipo. Si el atributo es propio del tipo, se cambia su
 * definición; si es heredado o una preforma, el cambio se guarda solo en este tipo (y sus subtipos).
 * `null` quita el ajuste propio del tipo (o, en un atributo propio, vuelve a los deducidos).
 */
export function setColumnSql(p: Project, typeId: string, fieldId: string, sql: SqlColumn | null): Project {
  const schema = getSchema(p, typeId);
  if (!schema) return p;
  if (schema.fields.some(f => !isFieldLink(f) && f.id === fieldId)) return setFieldSql(p, fieldId, sql);
  const sqlOverrides = { ...schema.sqlOverrides };
  if (sql) sqlOverrides[fieldId] = consistent(sql);
  else delete sqlOverrides[fieldId];
  return { ...p, schemas: p.schemas.map(s => (s.id === typeId ? { ...s, sqlOverrides } : s)) };
}

/**
 * Convierte las anotaciones de tipo SQL escritas como valor inicial («numeric(10,2)», «Datetime»…)
 * en el tipo SQL de la columna. Quita el valor inicial y los valores de las fichas que solo repetían
 * la anotación; los demás valores se conservan.
 */
export function applySqlAnnotations(p: Project, typeId?: string): Project {
  const found = sqlAnnotations(p, typeId);
  let next = p;
  found.forEach(({ field, type }) => {
    next = replaceField(next, { ...field, defaultValue: '', sql: { ...sqlColumnOf(field), type } });
  });
  const annotated = new Map(found.map(f => [f.field.id, f.text]));
  if (!annotated.size) return p;
  const nodes = next.nodes.map(n => {
    const stale = Object.entries(n.values).filter(([id, v]) => annotated.get(id) === v);
    if (!stale.length) return n;
    const values = { ...n.values };
    stale.forEach(([id]) => delete values[id]);
    return { ...n, values };
  });
  return { ...next, nodes };
}
