import { isFieldLink } from './library';
import { allFields, getSchema, inheritedSchemas } from './selectors';
import { normalizeName } from './text';
import type { DbEngine, FieldDefinition, Node, Project, Schema } from './types';
import { deduceDocType, isDocType, isDocumentEngine, referenceTypeText, type ReferenceKind } from './dbEngines';

export { DB_ENGINES, engineLabel, isDocumentEngine } from './dbEngines';

/*
 * Bases de datos. Un tipo de entidad marcado como tabla (`Schema.table`, heredable) dibuja sus nodos
 * como tablas en la disposición «Base de datos»: sus atributos efectivos (propios, preformas y
 * heredados) son las columnas y sus referencias a otra tabla, las claves foráneas. Fuera de esa
 * disposición los nodos siguen siendo nodos normales.
 *
 * Los metadatos SQL de cada atributo viven en `FieldDefinition.sql`; `null` deja que se deduzcan del
 * tipo del atributo, así que marcar un tipo como tabla ya produce columnas sin rellenar nada.
 *
 * Dos dialectos relacionales: SQL Server y Db2 for i (la base de datos de IBM i, los AS/400). Los tipos de
 * SQL Server van en minúsculas y los de Db2 en mayúsculas, así que un tipo guardado dice de qué dialecto
 * es; en una tabla del otro dialecto se convierte a su equivalente (`convertType`). Así una preforma
 * compartida vale en tablas de las dos bases.
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

/** Tipos de Db2 for i. DECIMAL es decimal empaquetado y NUMERIC, con zona, como en los archivos físicos. */
export const DB2_TYPES = [
  'SMALLINT',
  'INTEGER',
  'BIGINT',
  'DECIMAL',
  'NUMERIC',
  'DECFLOAT',
  'REAL',
  'DOUBLE',
  'BOOLEAN',
  'CHAR',
  'VARCHAR',
  'NCHAR',
  'NVARCHAR',
  'GRAPHIC',
  'VARGRAPHIC',
  'CLOB',
  'NCLOB',
  'BINARY',
  'VARBINARY',
  'BLOB',
  'DATE',
  'TIME',
  'TIMESTAMP',
] as const;

export type SqlServerTypeName = (typeof SQL_TYPES)[number];
export type Db2TypeName = (typeof DB2_TYPES)[number];
export type SqlTypeName = SqlServerTypeName | Db2TypeName;

/** Bases relacionales: sus tipos son tablas con columnas, claves y script (todo lo de SQL). */
export type SqlDialect = 'sqlserver' | 'db2i';
export const isRelationalEngine = (engine: DbEngine | null): engine is SqlDialect =>
  engine === 'sqlserver' || engine === 'db2i';
/** Los tipos de columna que se ofrecen en cada dialecto. */
export const typesOf = (dialect: SqlDialect): readonly SqlTypeName[] => (dialect === 'db2i' ? DB2_TYPES : SQL_TYPES);
const isDb2Name = (name: SqlTypeName): name is Db2TypeName => (DB2_TYPES as readonly string[]).includes(name);
export const dialectOfType = (name: SqlTypeName): SqlDialect => (isDb2Name(name) ? 'db2i' : 'sqlserver');

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
  /**
   * Qué guarda la columna, para el diagrama y el script (`MS_Description`). Sin ella vale la descripción
   * del atributo; en una preforma o un atributo heredado se cambia solo en este tipo, como lo demás.
   */
  description?: string;
  /**
   * En MongoDB, Firestore y Neo4j: el tipo del campo en ese motor (`dbEngines.ts`, `DOC_TYPES`); sin él,
   * o si no vale en el motor del tipo, se deduce del atributo. En SQL Server no se usa.
   */
  docType?: string;
}

/** Hasta dónde se guarda la descripción de una columna. */
export const COLUMN_DESCRIPTION_MAX = 500;

const DB2_LOBS: readonly string[] = ['CLOB', 'NCLOB', 'BLOB'];
const DB2_MAX_LENGTH: Partial<Record<Db2TypeName, number>> = {
  CHAR: 32766,
  VARCHAR: 32740,
  NCHAR: 16383,
  NVARCHAR: 16370,
  GRAPHIC: 16383,
  VARGRAPHIC: 16370,
  BINARY: 32766,
  VARBINARY: 32740,
  CLOB: 2147483647,
  NCLOB: 1073741823,
  BLOB: 2147483647,
};
export const hasLength = (name: SqlTypeName) =>
  ['char', 'varchar', 'nchar', 'nvarchar', 'varbinary'].includes(name) || (isDb2Name(name) && name in DB2_MAX_LENGTH);
export const allowsMax = (name: SqlTypeName) => ['varchar', 'nvarchar', 'varbinary'].includes(name);
export const hasPrecision = (name: SqlTypeName) => ['decimal', 'numeric', 'DECIMAL', 'NUMERIC'].includes(name);
export const hasTimeScale = (name: SqlTypeName) => ['time', 'datetime2', 'TIMESTAMP'].includes(name);
const IDENTITY_TYPES: readonly string[] = [
  'int',
  'bigint',
  'smallint',
  'tinyint',
  'decimal',
  'numeric',
  'SMALLINT',
  'INTEGER',
  'BIGINT',
  'DECIMAL',
  'NUMERIC',
];
export const allowsIdentity = (name: SqlTypeName) => IDENTITY_TYPES.includes(name);
const maxLength = (name: SqlTypeName) =>
  isDb2Name(name) ? (DB2_MAX_LENGTH[name] ?? 0) : name === 'nchar' || name === 'nvarchar' ? 4000 : 8000;
/** Fracciones de segundo por defecto: 7 en SQL Server, 6 en el TIMESTAMP de Db2. */
const defaultTimeScale = (name: SqlTypeName) => (name === 'TIMESTAMP' ? 6 : 7);

export function sqlType(name: SqlTypeName, length: number | 'max' | null = null, precision?: number, scale?: number) {
  return {
    name,
    length: hasLength(name) ? (length ?? (DB2_LOBS.includes(name) ? 1048576 : 50)) : null,
    precision: hasPrecision(name) ? (precision ?? 18) : null,
    scale: hasPrecision(name) ? (scale ?? 0) : hasTimeScale(name) ? (scale ?? defaultTimeScale(name)) : null,
  } satisfies SqlDataType;
}

/** Longitud de un LOB como la escribe Db2: 1M, 64K, 2G (o en bytes si no es un múltiplo exacto). */
function lobLength(length: number) {
  for (const [unit, size] of [
    ['G', 1024 ** 3],
    ['M', 1024 ** 2],
    ['K', 1024],
  ] as const)
    if (length % size === 0) return `${length / size}${unit}`;
  return String(length);
}

export function sqlTypeText(type: SqlDataType) {
  if (DB2_LOBS.includes(type.name) && typeof type.length === 'number') return `${type.name}(${lobLength(type.length)})`;
  if (hasLength(type.name)) return `${type.name}(${type.length})`;
  if (hasPrecision(type.name)) return `${type.name}(${type.precision},${type.scale})`;
  if (hasTimeScale(type.name) && type.scale !== defaultTimeScale(type.name)) return `${type.name}(${type.scale})`;
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
    const maxPrecision = isDb2Name(type.name) ? 63 : 38;
    if (!Number.isInteger(p) || p < 1 || p > maxPrecision) return `La precisión va de 1 a ${maxPrecision}.`;
    if (!Number.isInteger(s) || s < 0 || s > p) return 'La escala va de 0 a la precisión.';
  }
  const maxScale = type.name === 'TIMESTAMP' ? 12 : 7;
  if (
    hasTimeScale(type.name) &&
    (!Number.isInteger(type.scale) || Number(type.scale) < 0 || Number(type.scale) > maxScale)
  )
    return `La precisión de fracciones de segundo va de 0 a ${maxScale}.`;
  return null;
}

const MB = 1024 * 1024;
/** El equivalente de un tipo de SQL Server en Db2 for i. El texto sin longitud máxima pasa a CLOB. */
function toDb2(type: SqlDataType): SqlDataType {
  const length = type.length === 'max' ? null : type.length;
  switch (type.name) {
    case 'int':
      return sqlType('INTEGER');
    case 'bigint':
      return sqlType('BIGINT');
    case 'smallint':
    case 'tinyint':
    case 'bit':
      // BOOLEAN solo existe desde IBM i 7.5: SMALLINT (0 o 1) vale en todas las versiones.
      return sqlType('SMALLINT');
    case 'decimal':
      return sqlType('DECIMAL', null, type.precision ?? 18, type.scale ?? 0);
    case 'numeric':
      return sqlType('NUMERIC', null, type.precision ?? 18, type.scale ?? 0);
    case 'money':
      return sqlType('DECIMAL', null, 19, 4);
    case 'float':
      return sqlType('DOUBLE');
    case 'char':
      return sqlType('CHAR', length);
    case 'nchar':
      return sqlType('NCHAR', length);
    case 'varchar':
    case 'nvarchar':
      return length === null ? sqlType('CLOB', MB) : sqlType('VARCHAR', length);
    case 'varbinary':
      return length === null ? sqlType('BLOB', MB) : sqlType('VARBINARY', length);
    case 'date':
      return sqlType('DATE');
    case 'time':
      return sqlType('TIME');
    case 'datetime':
    case 'datetime2':
      return sqlType('TIMESTAMP');
    case 'uniqueidentifier':
      return sqlType('CHAR', 36);
    default:
      return type;
  }
}

/** El equivalente de un tipo de Db2 for i en SQL Server. */
function toSqlServer(type: SqlDataType): SqlDataType {
  const length = typeof type.length === 'number' ? type.length : null;
  const text = (name: 'varchar' | 'nvarchar' | 'varbinary', max: number) =>
    sqlType(name, length === null || length > max ? 'max' : length);
  switch (type.name) {
    case 'SMALLINT':
      return sqlType('smallint');
    case 'INTEGER':
      return sqlType('int');
    case 'BIGINT':
      return sqlType('bigint');
    case 'DECIMAL':
    case 'NUMERIC': {
      const precision = Math.min(type.precision ?? 18, 38);
      const scale = Math.min(type.scale ?? 0, precision);
      return sqlType(type.name === 'DECIMAL' ? 'decimal' : 'numeric', null, precision, scale);
    }
    case 'DECFLOAT':
    case 'REAL':
    case 'DOUBLE':
      return sqlType('float');
    case 'BOOLEAN':
      return sqlType('bit');
    case 'CHAR':
      return length !== null && length <= 8000 ? sqlType('char', length) : sqlType('varchar', 'max');
    case 'NCHAR':
    case 'GRAPHIC':
      return length !== null && length <= 4000 ? sqlType('nchar', length) : sqlType('nvarchar', 'max');
    case 'VARCHAR':
      return text('varchar', 8000);
    case 'NVARCHAR':
    case 'VARGRAPHIC':
      return text('nvarchar', 4000);
    case 'CLOB':
      return sqlType('varchar', 'max');
    case 'NCLOB':
      return sqlType('nvarchar', 'max');
    case 'BINARY':
    case 'VARBINARY':
      return text('varbinary', 8000);
    case 'BLOB':
      return sqlType('varbinary', 'max');
    case 'DATE':
      return sqlType('date');
    case 'TIME':
      return sqlType('time');
    case 'TIMESTAMP':
      return sqlType('datetime2');
    default:
      return type;
  }
}

/** El tipo en el dialecto de la tabla: el mismo si ya es suyo, o su equivalente si viene del otro. */
export function convertType(type: SqlDataType, dialect: SqlDialect): SqlDataType {
  if (dialectOfType(type.name) === dialect) return type;
  return dialect === 'db2i' ? toDb2(type) : toSqlServer(type);
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
  // Como se llaman en IBM i (los archivos físicos y el DDS): en una tabla de Db2 pasan a DECIMAL y NUMERIC.
  packed: 'decimal',
  empaquetado: 'decimal',
  zoned: 'numeric',
  zonado: 'numeric',
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
  const clean = normalizeName(text);
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

/**
 * Si el tipo (o alguno de sus ancestros) es de base de datos, de cualquier motor: el check de siempre
 * (`Schema.table`). Sus nodos se dibujan en la disposición «Base de datos».
 */
export function isDatabaseType(p: Project, typeId: string) {
  return inheritedSchemas(p, typeId).some(s => s.kind === 'entity' && s.table);
}
/** Motor de un tipo de base de datos: el del tipo o el ancestro más cercano que lo fije; si ninguno, SQL Server. */
export function engineOf(p: Project, typeId: string): DbEngine | null {
  if (!isDatabaseType(p, typeId)) return null;
  const chain = inheritedSchemas(p, typeId);
  for (let i = chain.length - 1; i >= 0; i--) if (chain[i].dbEngine) return chain[i].dbEngine;
  return 'sqlserver';
}
/** Tipo (él mismo o un ancestro) que fija el motor, si alguno lo fija. */
export const engineOrigin = (p: Project, typeId: string): Schema | undefined =>
  [...inheritedSchemas(p, typeId)].reverse().find(s => s.dbEngine);
/** Si el tipo es una tabla de una base relacional (todo lo de SQL: columnas, claves, script, la IA de tablas). */
export function isTableType(p: Project, typeId: string) {
  return isRelationalEngine(engineOf(p, typeId));
}
/** El dialecto de un tipo tabla, o `null` si no lo es. */
export function dialectOf(p: Project, typeId: string): SqlDialect | null {
  const engine = engineOf(p, typeId);
  return isRelationalEngine(engine) ? engine : null;
}
/** Subdocumento de MongoDB o Firestore: se incrusta en otros, sin colección propia. */
export function isEmbeddedType(p: Project, typeId: string) {
  return isDocumentEngine(engineOf(p, typeId)) && inheritedSchemas(p, typeId).some(s => s.embedded);
}
/** Ancestro (o el propio tipo) que lo marca como de base de datos. */
export const tableOrigin = (p: Project, typeId: string): Schema | undefined =>
  inheritedSchemas(p, typeId).find(s => s.kind === 'entity' && s.table);
/** Tablas de las bases relacionales (las de un dialecto, si se pide). */
export const tableTypes = (p: Project, dialect?: SqlDialect) =>
  p.schemas.filter(s => s.kind === 'entity' && (dialect ? dialectOf(p, s.id) === dialect : isTableType(p, s.id)));
/** Tipos de base de datos de cualquier motor. */
export const databaseTypes = (p: Project) => p.schemas.filter(s => s.kind === 'entity' && isDatabaseType(p, s.id));
/** Los motores que usa el proyecto. */
export const projectEngines = (p: Project) =>
  new Set(
    databaseTypes(p)
      .map(s => engineOf(p, s.id)!)
      .filter(Boolean),
  );
export const isTableNode = (p: Project, node: Node) => isTableType(p, node.typeId);

/**
 * Metadatos por defecto de un atributo que aún no los tiene. En SQL una referencia múltiple no es una
 * columna (necesita una tabla intermedia); en un documento es una lista y sí cuenta.
 */
export function defaultSqlColumn(field: FieldDefinition, engine: DbEngine = 'sqlserver'): SqlColumn {
  return {
    type: null,
    primaryKey: false,
    nullable: !field.required,
    unique: false,
    identity: false,
    excluded: field.isTitle || field.type === 'computed' || (field.type === 'nodeRefs' && isRelationalEngine(engine)),
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
  if (typeof r.description === 'string' && r.description.trim())
    column.description = r.description.trim().slice(0, COLUMN_DESCRIPTION_MAX);
  if (typeof r.docType === 'string' && r.docType.trim()) column.docType = r.docType.trim().slice(0, 40);
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
  if (![...SQL_TYPES, ...DB2_TYPES].includes(r.name as SqlTypeName)) return null;
  const name = r.name as SqlTypeName;
  const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : undefined);
  return sqlType(name, r.length === 'max' ? 'max' : (num(r.length) ?? null), num(r.precision), num(r.scale));
}

/** Tipo deducido del tipo de atributo, sin mirar referencias (en SQL Server; Db2 lo convierte). */
function deducedType(field: FieldDefinition): SqlDataType {
  switch (field.type) {
    case 'longText':
    case 'tags':
    case 'list':
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
  /** Motores que no son SQL: tipo del campo en ese motor y si se deduce. */
  docType?: string;
  docDeduced?: boolean;
  /** Referencias en motores que no son SQL: el tipo destino y si se incrusta o guarda su id. */
  target?: Schema;
  refKind?: ReferenceKind | null;
  /** La referencia apunta a otro motor: guarda el id como texto y la mantiene la aplicación. */
  crossEngine?: boolean;
  /** Texto del tipo en la tarjeta («string», «objectId → Cliente», «[Dirección]»). */
  typeText?: string;
}

/**
 * Tipo tabla al que apuntaría una referencia: el primero admitido que sea tabla, o el del nodo del valor
 * inicial. Con `dialect`, solo una tabla de esa base: hacia otra no hay clave foránea.
 */
export function referencedTable(p: Project, field: FieldDefinition, dialect?: SqlDialect): Schema | undefined {
  const fits = (typeId: string) => (dialect ? dialectOf(p, typeId) === dialect : isTableType(p, typeId));
  const admitted = field.referenceTypeIds.map(id => getSchema(p, id)).find(s => s && fits(s.id));
  if (admitted) return admitted;
  const node = typeof field.defaultValue === 'string' ? p.nodes.find(n => n.id === field.defaultValue) : undefined;
  return node && fits(node.typeId) ? getSchema(p, node.typeId) : undefined;
}

function columnType(
  p: Project,
  field: FieldDefinition,
  sql: SqlColumn,
  seen: Set<string>,
  dialect: SqlDialect,
): SqlDataType {
  if (sql.type) return convertType(sql.type, dialect);
  if (field.type === 'nodeRef' && !seen.has(field.id)) {
    const target = referencedTable(p, field, dialect);
    const keys = target ? primaryKey(p, target.id, new Set([...seen, field.id])) : [];
    if (keys.length === 1) return keys[0].type;
    return convertType(sqlType('int'), dialect);
  }
  return convertType(deducedType(field), dialect);
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
  return field.sql ?? defaultSqlColumn(field, engineOf(p, typeId) ?? 'sqlserver');
}

/** El tipo de base de datos al que apunta una referencia (el primero admitido que lo sea, o el del valor inicial). */
export function referencedDatabaseType(p: Project, field: FieldDefinition): Schema | undefined {
  const admitted = field.referenceTypeIds.map(id => getSchema(p, id)).find(s => s && isDatabaseType(p, s.id));
  if (admitted) return admitted;
  const node = typeof field.defaultValue === 'string' ? p.nodes.find(n => n.id === field.defaultValue) : undefined;
  return node && isDatabaseType(p, node.typeId) ? getSchema(p, node.typeId) : undefined;
}
/** Tipo que fija los metadatos SQL de un atributo en `typeId` (él mismo o un ancestro), si lo hay. */
export function sqlOverrideOwner(p: Project, typeId: string, fieldId: string): Schema | undefined {
  return [...inheritedSchemas(p, typeId)].reverse().find(s => s.sqlOverrides?.[fieldId]);
}

function columnsOf(p: Project, typeId: string, seen: Set<string>): TableColumn[] {
  const engine = engineOf(p, typeId);
  return allFields(p, typeId).map(field => {
    const sql = columnSqlIn(p, typeId, field);
    const reference = field.type === 'nodeRef' || field.type === 'nodeRefs';
    const column: TableColumn = {
      field,
      sql,
      type: columnType(p, field, sql, seen, isRelationalEngine(engine) ? engine : 'sqlserver'),
      deduced: !sql.type,
      reference,
      origin: originOf(p, typeId, field),
    };
    // En los motores que no son SQL, el tipo del campo en ese motor y, en las referencias, a qué apuntan.
    if (engine && !isRelationalEngine(engine)) {
      const target = reference ? referencedDatabaseType(p, field) : undefined;
      const kind: ReferenceKind | null = !target ? null : isEmbeddedType(p, target.id) ? 'embedded' : 'reference';
      // Una referencia a otra base guarda su id como texto: ni objectId ni referencia de Firestore la entienden.
      const cross = kind === 'reference' && engineOf(p, target!.id) !== engine;
      const many = field.type === 'nodeRefs';
      column.docType = isDocType(engine, sql.docType)
        ? sql.docType
        : cross
          ? engine === 'neo4j'
            ? many
              ? 'List<String>'
              : 'String'
            : many
              ? 'array'
              : 'string'
          : deduceDocType(engine, field, kind);
      column.docDeduced = !isDocType(engine, sql.docType);
      column.target = target;
      column.refKind = kind;
      column.crossEngine = cross;
      column.typeText = !reference
        ? column.docType
        : cross
          ? `${many ? `[${engine === 'neo4j' ? 'String' : 'string'}]` : engine === 'neo4j' ? 'String' : 'string'} → ${target!.name} (otra base)`
          : referenceTypeText(engine, kind, target?.name, many);
    }
    return column;
  });
}
function primaryKey(p: Project, typeId: string, seen: Set<string>) {
  return columnsOf(p, typeId, seen).filter(c => !c.sql.excluded && c.sql.primaryKey);
}

/** Todos los atributos efectivos del tipo con sus metadatos SQL, incluidos los excluidos de la tabla. */
export const tableFields = (p: Project, typeId: string) => columnsOf(p, typeId, new Set());
/** Columnas de la tabla, en el orden de los atributos. */
export const tableColumns = (p: Project, typeId: string) => tableFields(p, typeId).filter(c => !c.sql.excluded);

/** La descripción de una columna: la suya o, si no tiene, la del atributo. Vacía si no hay ninguna. */
export const columnDescription = (c: TableColumn) => (c.sql.description ?? c.field.description ?? '').trim();

/** Si alguna columna de la tabla tiene descripción: entonces el diagrama le añade su columna. */
export const tableHasDescriptions = (p: Project, typeId: string) =>
  tableColumns(p, typeId).some(c => columnDescription(c) !== '');

/** Texto de una columna: «int IDENTITY · PK», «nvarchar(50) · NOT NULL», «date»; en documentos, «string · obligatorio». */
/**
 * Cómo se llama cada tipo de Db2 for i en IBM i: el nombre de los archivos físicos y la letra del DDS
 * (R3-04: en producción se habla de *packed* y *zoned*, no de DECIMAL y NUMERIC).
 */
export const DB2_TYPE_HINTS: Partial<Record<Db2TypeName, string>> = {
  DECIMAL: 'packed (P)',
  NUMERIC: 'zoned (S)',
  SMALLINT: 'binario de 4 (B)',
  INTEGER: 'binario de 9 (B)',
  BIGINT: 'binario de 18 (B)',
  REAL: 'coma flotante (F)',
  DOUBLE: 'coma flotante (F)',
  CHAR: 'carácter (A)',
  VARCHAR: 'carácter VARLEN (A)',
  GRAPHIC: 'gráfico (G)',
  VARGRAPHIC: 'gráfico VARLEN (G)',
  BINARY: 'hexadecimal (H)',
  VARBINARY: 'hexadecimal VARLEN (H)',
  DATE: 'fecha (L)',
  TIME: 'hora (T)',
  TIMESTAMP: 'fecha y hora (Z)',
  BOOLEAN: 'IBM i 7.5',
};

/** El nombre de un tipo en el selector: el de SQL y, en Db2, el de IBM i («DECIMAL · packed (P)»). */
export const typeOptionLabel = (name: SqlTypeName) =>
  isDb2Name(name) && DB2_TYPE_HINTS[name] ? `${name} · ${DB2_TYPE_HINTS[name]}` : name;

/** El tipo en el diagrama y la ficha; en Db2, packed y zoned como se dicen en IBM i: «DECIMAL(9,2) packed». */
export function columnTypeText(type: SqlDataType) {
  const text = sqlTypeText(type);
  return type.name === 'DECIMAL' ? `${text} packed` : type.name === 'NUMERIC' ? `${text} zoned` : text;
}

export function columnText(c: TableColumn) {
  if (c.typeText !== undefined) return c.sql.nullable ? c.typeText : `${c.typeText} · obligatorio`;
  const type = columnTypeText(c.type) + (c.sql.identity ? ' IDENTITY' : '');
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
    // Las referencias a otra tabla o colección son valores (a cuál apunta); un subdocumento incrustado, no.
    result = new Map(
      isDatabaseType(p, typeId)
        ? tableColumns(p, typeId)
            .filter(c => !c.reference || c.refKind === 'embedded')
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
          // Una clave foránea une tablas de la misma base: entre SQL Server y Db2 es una referencia entre motores.
          if (!target || !isTableType(p, target.typeId) || engineOf(p, target.typeId) !== engineOf(p, node.typeId))
            return;
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

/** Una referencia dibujada entre nodos de base de datos de cualquier motor (también entre motores distintos). */
export interface DatabaseLink extends ForeignKeyLink {
  /** Los dos nodos son de motores distintos: la referencia la mantiene la aplicación, no una base. */
  crossEngine: boolean;
}

/**
 * Las referencias que se dibujan en la disposición «Base de datos», de cualquier motor: las claves foráneas
 * de SQL y las referencias por id de los documentos y de Neo4j, a partir de los valores de cada nodo. Un
 * subdocumento incrustado no es una línea: va dentro de la tarjeta.
 */
export function databaseLinks(p: Project): DatabaseLink[] {
  const columns = new Map<string, TableColumn[]>();
  const columnsFor = (typeId: string) => {
    if (!columns.has(typeId)) columns.set(typeId, isDatabaseType(p, typeId) ? tableColumns(p, typeId) : []);
    return columns.get(typeId)!;
  };
  const nodes = new Map(p.nodes.map(n => [n.id, n]));
  const result: DatabaseLink[] = [];
  p.nodes.forEach(node => {
    const engine = engineOf(p, node.typeId);
    columnsFor(node.typeId)
      .filter(c => c.reference && c.refKind !== 'embedded')
      .forEach(c => {
        const raw = node.values[c.field.id];
        const ids = typeof raw === 'string' ? [raw] : Array.isArray(raw) ? raw : [];
        ids.forEach(targetId => {
          const target = nodes.get(targetId);
          if (!target || !isDatabaseType(p, target.typeId) || isEmbeddedType(p, target.typeId)) return;
          const keys =
            isTableType(p, target.typeId) && engineOf(p, target.typeId) === engine
              ? columnsFor(target.typeId).filter(k => k.sql.primaryKey)
              : [];
          result.push({
            sourceId: node.id,
            fieldId: c.field.id,
            targetId,
            targetFieldId: keys.length === 1 ? keys[0].field.id : null,
            crossEngine: engineOf(p, target.typeId) !== engine,
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
  const dialect = dialectOf(p, typeId);
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
    if (dialect === 'db2i') {
      if (c.type.name === 'BOOLEAN')
        issues.push({
          severity: 'warning',
          message: `${c.field.label}: BOOLEAN solo existe desde IBM i 7.5; en versiones anteriores usa SMALLINT o CHAR(1).`,
          fieldId: c.field.id,
        });
      if (c.sql.defaultValue && /\bGETDATE\b|\bNEWID\b|\bSYSDATETIME\b|(^|[^A-Za-z])N'/i.test(c.sql.defaultValue))
        issues.push({
          severity: 'warning',
          message: `${c.field.label}: el valor por defecto es de SQL Server; en Db2 for i, CURRENT_DATE, CURRENT_TIMESTAMP o 'texto'.`,
          fieldId: c.field.id,
        });
      if (c.field.type === 'nodeRef' && c.sql.onUpdate && c.sql.onUpdate !== 'NO ACTION')
        issues.push({
          severity: 'warning',
          message: `${c.field.label}: Db2 for i solo admite NO ACTION al actualizar la fila referenciada.`,
          fieldId: c.field.id,
        });
    }
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
      const target = referencedTable(p, c.field, dialectOf(p, typeId) ?? undefined);
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
  // Una descripción vacía no se guarda: vuelve a valer la del atributo.
  description: sql.description?.trim() ? sql.description.slice(0, COLUMN_DESCRIPTION_MAX) : undefined,
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
