import {
  DB2_TYPES,
  FK_ACTIONS,
  SQL_TYPES,
  hasLength,
  hasPrecision,
  hasTimeScale,
  parseSqlAnnotation,
  sqlType,
  sqlTypeError,
  convertType,
  type FkAction,
  type SqlDataType,
  type SqlDialect,
  type SqlTypeName,
} from './database';

/*
 * Leer tablas que ya existen (docs/roadmaps/ROADMAP_DATOS_BD.md, «Importar tablas»): el SQL que crea las
 * tablas (CREATE TABLE de SQL Server o de Db2, con sus ALTER TABLE, CREATE INDEX, LABEL ON, COMMENT ON y
 * las descripciones de SQL Server) y los fuentes DDS de los archivos físicos y lógicos del AS/400. Aquí
 * solo se lee; `importTables` (tablesImport.ts) crea los tipos y los nodos.
 */

export interface ImportedColumn {
  name: string;
  type: SqlDataType;
  nullable: boolean;
  identity: boolean;
  defaultValue: string | null;
  description: string;
  /** Valores de un CHECK (columna IN (...)): pasa a ser una lista de opciones. */
  options: string[];
}
export interface ImportedForeignKey {
  columns: string[];
  table: string;
  /** Columnas de la tabla destino (vacío = su clave primaria). */
  targetColumns: string[];
  onDelete: FkAction;
  onUpdate: FkAction;
}
export interface ImportedTable {
  name: string;
  description: string;
  columns: ImportedColumn[];
  primaryKey: string[];
  uniques: string[][];
  indexes: string[][];
  foreignKeys: ImportedForeignKey[];
  /** Lo que no se ha podido leer o se ha leído con un parecido. */
  warnings: string[];
}
export interface ImportResult {
  dialect: SqlDialect;
  tables: ImportedTable[];
  /** Avisos que no son de una tabla (sentencias que no se entienden, índices de tablas que no están). */
  warnings: string[];
  /** Un archivo lógico de DDS: un índice sobre la tabla de su PFILE, que se aplica al juntar (`mergeResults`). */
  logical?: LogicalFile;
}

const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();
const findTable = (tables: ImportedTable[], name: string) => tables.find(t => same(t.name, name));
const findColumn = (table: ImportedTable, name: string) => table.columns.find(c => same(c.name, name));

// --- Tipos ---

const DB2_ALIASES: Record<string, string> = {
  INT: 'INTEGER',
  DEC: 'DECIMAL',
  NUM: 'NUMERIC',
  CHARACTER: 'CHAR',
  FLOAT: 'DOUBLE',
  'DOUBLE PRECISION': 'DOUBLE',
  'CHARACTER VARYING': 'VARCHAR',
  'CHAR VARYING': 'VARCHAR',
  'NATIONAL CHARACTER': 'NCHAR',
  'NATIONAL CHAR VARYING': 'NVARCHAR',
  'NATIONAL CHARACTER VARYING': 'NVARCHAR',
  'CHARACTER LARGE OBJECT': 'CLOB',
  'BINARY LARGE OBJECT': 'BLOB',
  'BINARY VARYING': 'VARBINARY',
  DBCLOB: 'NCLOB',
  ROWID: 'VARBINARY',
};
/** Tipos de SQL Server que Nodaria no tiene: su equivalente más cercano. */
const SQLSERVER_ALIASES: Record<string, [SqlTypeName, number | 'max' | null] | SqlTypeName> = {
  integer: 'int',
  smalldatetime: 'datetime',
  datetimeoffset: 'datetime2',
  smallmoney: 'money',
  real: 'float',
  text: ['varchar', 'max'],
  ntext: ['nvarchar', 'max'],
  xml: ['nvarchar', 'max'],
  image: ['varbinary', 'max'],
  binary: 'varbinary',
  rowversion: ['varbinary', 8],
  timestamp: ['varbinary', 8],
  sysname: ['nvarchar', 128],
  sql_variant: ['nvarchar', 'max'],
  hierarchyid: ['varbinary', 'max'],
};

/**
 * Un tipo leído («DECIMAL(9, 2)», «nvarchar(max)», «CHARACTER VARYING(20)») en el dialecto de la base. Si
 * no se reconoce, `null` (y quien llama usa un texto y avisa).
 */
export function readType(
  name: string,
  args: string[],
  dialect: SqlDialect,
): { type: SqlDataType; note?: string } | null {
  const upper = name.toUpperCase().replace(/\s+/g, ' ');
  const lower = upper.toLowerCase();
  const first = args[0]?.toLowerCase();
  const length = first === 'max' ? 'max' : first ? Number(first) : null;
  const second = args[1] ? Number(args[1]) : undefined;
  const build = (type: SqlTypeName, note?: string) => {
    let t: SqlDataType;
    if (hasLength(type)) t = sqlType(type, length ?? (type === 'char' || type === 'CHAR' ? 1 : null));
    else if (hasPrecision(type)) t = sqlType(type, null, length === 'max' ? undefined : (length ?? undefined), second);
    else if (hasTimeScale(type))
      t = sqlType(type, null, undefined, length === 'max' || length === null ? undefined : length);
    else t = sqlType(type);
    return sqlTypeError(t) ? null : { type: t, note };
  };
  if (dialect === 'db2i') {
    const db2 = DB2_ALIASES[upper] ?? upper;
    if ((DB2_TYPES as readonly string[]).includes(db2)) {
      // FLOAT(n) de 1 a 24 es REAL; DOUBLE, a partir de ahí.
      if (upper === 'FLOAT' && typeof length === 'number' && length <= 24) return build('REAL');
      return build(db2 as SqlTypeName, upper === 'ROWID' ? 'ROWID se lee como VARBINARY(40).' : undefined);
    }
  } else {
    if ((SQL_TYPES as readonly string[]).includes(lower)) return build(lower as SqlTypeName);
    const alias = SQLSERVER_ALIASES[lower];
    if (alias) {
      const [type, fixed] = Array.isArray(alias) ? alias : [alias, undefined];
      if (fixed !== undefined) {
        const t = sqlType(type, fixed);
        return { type: t, note: `${upper} se lee como ${type}(${fixed}).` };
      }
      return build(type, `${upper} se lee como ${type}.`);
    }
  }
  // Lo del otro dialecto (una tabla de Db2 con «nvarchar», o al revés) o los nombres de las anotaciones.
  const annotated = parseSqlAnnotation(args.length ? `${lower}(${args.join(',')})` : lower);
  if (annotated) return { type: convertType(annotated, dialect) };
  return null;
}

// --- SQL ---

type Token = { kind: 'word' | 'ident' | 'string' | 'number' | 'punct'; text: string; value: string };

/** Fichas del SQL: palabras, nombres entre comillas o corchetes, textos, números y signos. */
export function tokenize(sql: string): Token[] {
  const out: Token[] = [];
  let i = 0;
  while (i < sql.length) {
    const ch = sql[i];
    if (/\s/.test(ch)) i++;
    else if (ch === '-' && sql[i + 1] === '-') while (i < sql.length && sql[i] !== '\n') i++;
    else if (ch === '/' && sql[i + 1] === '*') {
      const end = sql.indexOf('*/', i + 2);
      i = end < 0 ? sql.length : end + 2;
    } else if (ch === "'" || ((ch === 'N' || ch === 'n' || ch === 'G' || ch === 'g') && sql[i + 1] === "'")) {
      const start = i;
      if (ch !== "'") i++;
      let value = '';
      i++;
      while (i < sql.length) {
        if (sql[i] === "'" && sql[i + 1] === "'") {
          value += "'";
          i += 2;
        } else if (sql[i] === "'") {
          i++;
          break;
        } else value += sql[i++];
      }
      out.push({ kind: 'string', text: sql.slice(start, i), value });
    } else if (ch === '"' || ch === '[' || ch === '`') {
      const close = ch === '[' ? ']' : ch;
      let value = '';
      const start = i++;
      while (i < sql.length) {
        if (sql[i] === close && sql[i + 1] === close) {
          value += close;
          i += 2;
        } else if (sql[i] === close) {
          i++;
          break;
        } else value += sql[i++];
      }
      out.push({ kind: 'ident', text: sql.slice(start, i), value });
    } else if (/[0-9]/.test(ch) || (ch === '.' && /[0-9]/.test(sql[i + 1] ?? ''))) {
      const m = /^[0-9]*\.?[0-9]+(e[+-]?[0-9]+)?/i.exec(sql.slice(i))!;
      out.push({ kind: 'number', text: m[0], value: m[0] });
      i += m[0].length;
    } else if (/[\p{L}_@#$]/u.test(ch)) {
      const m = /^[\p{L}\p{N}_@#$]+/u.exec(sql.slice(i))!;
      out.push({ kind: 'word', text: m[0], value: m[0] });
      i += m[0].length;
    } else {
      out.push({ kind: 'punct', text: ch, value: ch });
      i++;
    }
  }
  return out;
}

/** Las sentencias: separadas por «;» o por GO (los scripts de SQL Server Management Studio). */
function statements(tokens: Token[]) {
  const out: Token[][] = [];
  let current: Token[] = [];
  let depth = 0;
  tokens.forEach(t => {
    if (t.kind === 'punct' && t.text === '(') depth++;
    if (t.kind === 'punct' && t.text === ')') depth--;
    const separator =
      (t.kind === 'punct' && t.text === ';') || (t.kind === 'word' && /^GO$/i.test(t.text) && depth <= 0);
    if (!separator) return current.push(t);
    if (current.length) out.push(current);
    current = [];
    depth = 0;
  });
  if (current.length) out.push(current);
  return out;
}

class Reader {
  i = 0;
  constructor(private tokens: Token[]) {}
  peek(offset = 0) {
    return this.tokens[this.i + offset];
  }
  done() {
    return this.i >= this.tokens.length;
  }
  next() {
    return this.tokens[this.i++];
  }
  is(...words: string[]) {
    return words.every((w, k) => {
      const t = this.peek(k);
      return !!t && (t.kind === 'word' || t.kind === 'punct') && same(t.text, w);
    });
  }
  eat(...words: string[]) {
    if (!this.is(...words)) return false;
    this.i += words.length;
    return true;
  }
  /** Se salta una de esas palabras, si es la siguiente. */
  skip(...words: string[]) {
    words.some(w => this.eat(w));
  }
  /** Un nombre, quizá con su esquema o biblioteca («dbo.Cliente», «TIENDA/CLIENTE»): el último. */
  name() {
    let t = this.next();
    let name = t?.value ?? '';
    while (this.peek() && (this.peek().text === '.' || this.peek().text === '/') && this.peek(1)) {
      this.next();
      t = this.next();
      name = t.value;
    }
    return name;
  }
  /** Lo que va entre paréntesis (con los anidados), como fichas; el cursor queda detrás. */
  group(): Token[] {
    if (!this.eat('(')) return [];
    const out: Token[] = [];
    let depth = 1;
    while (!this.done()) {
      const t = this.next();
      if (t.text === '(' && t.kind === 'punct') depth++;
      if (t.text === ')' && t.kind === 'punct' && --depth === 0) break;
      out.push(t);
    }
    return out;
  }
}

/** Parte una lista por las comas de primer nivel. */
function splitTop(tokens: Token[]) {
  const out: Token[][] = [[]];
  let depth = 0;
  tokens.forEach(t => {
    if (t.kind === 'punct' && t.text === '(') depth++;
    if (t.kind === 'punct' && t.text === ')') depth--;
    if (t.kind === 'punct' && t.text === ',' && depth === 0) out.push([]);
    else out[out.length - 1].push(t);
  });
  return out.filter(part => part.length);
}

/** Los nombres de una lista de columnas: «(a ASC, b DESC)» → [a, b]. */
const columnList = (tokens: Token[]) =>
  splitTop(tokens)
    .map(part => part.find(t => t.kind === 'word' || t.kind === 'ident')?.value ?? '')
    .filter(Boolean);

const asText = (tokens: Token[]) =>
  tokens
    .map((t, k) => {
      const prev = tokens[k - 1];
      const glue =
        !prev || t.text === ')' || t.text === ',' || t.text === '.' || prev.text === '(' || prev.text === '.';
      return `${glue ? '' : ' '}${t.text}`;
    })
    .join('')
    .replace(/\s+\(/g, '(')
    .trim();

function readAction(r: Reader): FkAction {
  for (const action of FK_ACTIONS) if (r.eat(...action.split(' '))) return action;
  if (r.eat('RESTRICT')) return 'NO ACTION';
  r.next();
  return 'NO ACTION';
}

/** REFERENCES tabla [(columnas)] [ON DELETE …] [ON UPDATE …]. */
function readReferences(r: Reader, columns: string[]): ImportedForeignKey {
  const table = r.name();
  const targetColumns = r.is('(') ? columnList(r.group()) : [];
  let onDelete: FkAction = 'NO ACTION';
  let onUpdate: FkAction = 'NO ACTION';
  for (;;) {
    if (r.eat('ON', 'DELETE')) onDelete = readAction(r);
    else if (r.eat('ON', 'UPDATE')) onUpdate = readAction(r);
    else if (r.eat('NOT', 'FOR', 'REPLICATION')) continue;
    else break;
  }
  return { columns, table, targetColumns, onDelete, onUpdate };
}

/** CHECK (col IN ('a', 'b')) → los valores, si es eso. */
function checkOptions(tokens: Token[]): { column: string; options: string[] } | null {
  const r = new Reader(tokens);
  const column = r.next();
  if (!column || (column.kind !== 'word' && column.kind !== 'ident') || !r.eat('IN') || !r.is('(')) return null;
  const values = splitTop(r.group());
  if (!r.done() || !values.every(v => v.length === 1 && v[0].kind === 'string')) return null;
  return { column: column.value, options: values.map(v => v[0].value) };
}

const STOP_WORDS = [
  'NOT',
  'NULL',
  'DEFAULT',
  'CONSTRAINT',
  'PRIMARY',
  'UNIQUE',
  'REFERENCES',
  'CHECK',
  'IDENTITY',
  'GENERATED',
  'COLLATE',
  'FOR',
  'CCSID',
  'WITH',
  'IMPLICITLY',
  'ROWGUIDCOL',
  'SPARSE',
  'FILESTREAM',
  'MASKED',
];

/** Una tabla nueva, todavía vacía. */
const emptyTable = (name: string): ImportedTable => ({
  name,
  description: '',
  columns: [],
  primaryKey: [],
  uniques: [],
  indexes: [],
  foreignKeys: [],
  warnings: [],
});

/** Una restricción de tabla (en el CREATE TABLE o en un ALTER TABLE … ADD). */
function readConstraint(r: Reader, table: ImportedTable) {
  if (r.eat('CONSTRAINT')) r.next();
  if (r.eat('PRIMARY', 'KEY')) {
    r.skip('CLUSTERED', 'NONCLUSTERED');
    table.primaryKey = columnList(r.group());
  } else if (r.eat('UNIQUE')) {
    r.eat('KEY');
    r.skip('CLUSTERED', 'NONCLUSTERED');
    table.uniques.push(columnList(r.group()));
  } else if (r.eat('FOREIGN', 'KEY')) {
    const columns = columnList(r.group());
    if (r.eat('REFERENCES')) table.foreignKeys.push(readReferences(r, columns));
  } else if (r.eat('CHECK')) {
    const check = checkOptions(r.group());
    const column = check && findColumn(table, check.column);
    if (column) column.options = check.options;
  } else return false;
  return true;
}

function readColumn(r: Reader, table: ImportedTable, dialect: SqlDialect) {
  const name = r.next().value;
  // Db2: «nombre FOR COLUMN NOMSISTEMA tipo», con el nombre de sistema delante del tipo.
  if (r.eat('FOR', 'COLUMN')) r.next();
  // El tipo: una o varias palabras («DOUBLE PRECISION», «CHARACTER VARYING») y sus argumentos.
  const words: string[] = [];
  // SQL Server Management Studio escribe el tipo entre corchetes: [nombre] [nvarchar](50).
  if (r.peek()?.kind === 'ident') words.push(r.next().value);
  while (words.length < 3 && r.peek()?.kind === 'word' && !STOP_WORDS.some(w => same(w, r.peek().text)))
    words.push(r.next().text);
  const args = r.is('(') ? splitTop(r.group()).map(asText) : [];
  if (words.length === 1 && (r.is('VARYING') || r.is('PRECISION'))) words.push(r.next().text);
  const typeName = words.join(' ');
  const read = typeName ? readType(typeName, args, dialect) : null;
  const fallback = dialect === 'db2i' ? sqlType('VARCHAR', 50) : sqlType('nvarchar', 50);
  if (!read)
    table.warnings.push(
      `${name}: no se reconoce el tipo «${typeName}${args.length ? `(${args.join(',')})` : ''}»; queda como ${dialect === 'db2i' ? 'VARCHAR(50)' : 'nvarchar(50)'}.`,
    );
  else if (read.note) table.warnings.push(`${name}: ${read.note}`);
  const column: ImportedColumn = {
    name,
    type: read?.type ?? fallback,
    nullable: true,
    identity: false,
    defaultValue: null,
    description: '',
    options: [],
  };
  while (!r.done()) {
    if (r.eat('NOT', 'NULL')) column.nullable = false;
    else if (r.eat('NULL')) column.nullable = true;
    else if (r.eat('IDENTITY')) {
      column.identity = true;
      if (r.is('(')) r.group();
    } else if (r.eat('GENERATED')) {
      if (!r.eat('ALWAYS')) r.eat('BY', 'DEFAULT');
      if (r.eat('AS', 'IDENTITY')) {
        column.identity = true;
        if (r.is('(')) r.group();
      } else if (r.eat('AS')) {
        // Columnas que rellena la base (ROW CHANGE TIMESTAMP, ROW BEGIN…): se leen como columnas normales.
        while (!r.done() && !STOP_WORDS.some(w => r.is(w))) r.next();
      }
    } else if (r.eat('WITH', 'DEFAULT') || r.eat('DEFAULT')) {
      const t = r.peek();
      if (!t || (t.kind === 'word' && STOP_WORDS.some(w => same(w, t.text)))) continue;
      if (r.is('(')) column.defaultValue = asText(r.group());
      else {
        const parts = [r.next()];
        if (r.is('('))
          parts.push({ kind: 'punct', text: '(', value: '(' }, ...r.group(), { kind: 'punct', text: ')', value: ')' });
        column.defaultValue = parts[0].kind === 'string' && parts.length === 1 ? parts[0].text : asText(parts);
      }
    } else if (r.eat('CONSTRAINT')) r.next();
    else if (r.eat('PRIMARY', 'KEY')) {
      r.skip('CLUSTERED', 'NONCLUSTERED');
      table.primaryKey = [name];
    } else if (r.eat('UNIQUE')) {
      r.skip('CLUSTERED', 'NONCLUSTERED');
      table.uniques.push([name]);
    } else if (r.eat('REFERENCES')) table.foreignKeys.push(readReferences(r, [name]));
    else if (r.eat('CHECK')) {
      const check = checkOptions(r.group());
      if (check && same(check.column, name)) column.options = check.options;
    } else if (r.eat('FOR', 'COLUMN') || r.eat('CCSID') || r.eat('COLLATE')) r.next();
    else if (r.eat('FOR', 'BIT', 'DATA') || r.eat('FOR', 'SBCS', 'DATA') || r.eat('FOR', 'MIXED', 'DATA')) continue;
    else r.next();
  }
  if (column.identity) column.nullable = false;
  table.columns.push(column);
}

function createTable(r: Reader, dialect: SqlDialect, tables: ImportedTable[]) {
  r.eat('IF', 'NOT', 'EXISTS');
  const table = emptyTable(r.name());
  if (r.eat('FOR', 'SYSTEM', 'NAME')) r.next();
  if (!r.is('(')) return;
  splitTop(r.group()).forEach(part => {
    const item = new Reader(part);
    if (!readConstraint(item, table)) readColumn(new Reader(part), table, dialect);
  });
  // Una tabla que se crea dos veces (un DROP y CREATE repetido): vale la última.
  const existing = findTable(tables, table.name);
  if (existing) tables.splice(tables.indexOf(existing), 1);
  tables.push(table);
}

/** Lee el SQL que crea las tablas. */
export function parseSqlDdl(sql: string, dialect: SqlDialect): ImportResult {
  const tables: ImportedTable[] = [];
  const warnings: string[] = [];
  let ignored = 0;
  const table = (name: string) => {
    const found = findTable(tables, name);
    if (!found) warnings.push(`«${name}» no está entre las tablas leídas: se ignora lo que dice de ella.`);
    return found;
  };
  for (const statement of statements(tokenize(sql))) {
    const r = new Reader(statement);
    if (r.eat('CREATE')) {
      r.eat('OR', 'REPLACE');
      if (r.eat('TABLE')) {
        createTable(r, dialect, tables);
        continue;
      }
      // CREATE [UNIQUE] [CLUSTERED|NONCLUSTERED] INDEX nombre ON tabla (columnas)
      const unique = r.eat('UNIQUE');
      r.skip('CLUSTERED', 'NONCLUSTERED');
      if (!r.eat('INDEX')) {
        ignored++;
        continue;
      }
      r.name();
      if (!r.eat('ON')) continue;
      const target = table(r.name());
      const columns = columnList(r.group());
      if (target && columns.length) (unique ? target.uniques : target.indexes).push(columns);
    } else if (r.eat('ALTER', 'TABLE')) {
      const target = table(r.name());
      if (!target) continue;
      while (!r.done()) {
        if (r.eat('ADD') || r.eat('WITH', 'CHECK', 'ADD') || r.eat('WITH', 'NOCHECK', 'ADD')) {
          if (!readConstraint(r, target)) ignored++;
        } else r.next();
      }
    } else if (r.eat('LABEL', 'ON') || r.eat('COMMENT', 'ON')) {
      readLabel(r, same(statement[0].text, 'LABEL'), table);
    } else if (r.eat('EXEC') || r.eat('EXECUTE')) {
      if (!readDescription(statement, table)) ignored++;
    } else if (!['SET', 'USE', 'BEGIN', 'COMMIT', 'CL', 'PRINT', 'DECLARE'].some(w => r.is(w))) ignored++;
  }
  if (ignored)
    warnings.push(`${ignored} ${ignored === 1 ? 'sentencia no crea' : 'sentencias no crean'} tablas: se ignoran.`);
  return { dialect, tables, warnings };
}

/**
 * LABEL ON / COMMENT ON de Db2: de una tabla, de una columna («tabla.columna IS '…'») o de varias
 * («tabla (col TEXT IS '…', …)»). El texto (TEXT IS, o COMMENT ON) gana a la cabecera de columna (IS).
 */
function readLabel(r: Reader, isLabel: boolean, table: (name: string) => ImportedTable | undefined) {
  if (r.eat('TABLE')) {
    const target = table(r.name());
    r.eat('IS');
    const text = r.next();
    if (target && text?.kind === 'string' && (!isLabel || !target.description)) target.description = text.value;
    return;
  }
  if (!r.eat('COLUMN')) return;
  const set = (column: ImportedColumn | undefined, value: Token | undefined, isText: boolean) => {
    if (column && value?.kind === 'string' && (isText || !column.description)) column.description = value.value;
  };
  const parts: string[] = [];
  while (!r.done() && !r.is('(') && !r.is('IS') && !r.is('TEXT')) {
    const t = r.next();
    if (t.text !== '.') parts.push(t.value);
  }
  if (r.is('(')) {
    const target = table(parts[parts.length - 1]);
    splitTop(r.group()).forEach(part => {
      const item = new Reader(part);
      const column = target && findColumn(target, item.next().value);
      const isText = item.eat('TEXT', 'IS');
      if (isText || item.eat('IS')) set(column, item.next(), isText);
    });
  } else if (parts.length >= 2) {
    const target = table(parts[parts.length - 2]);
    const column = target && findColumn(target, parts[parts.length - 1]);
    const isText = r.eat('TEXT', 'IS') || !isLabel;
    if (isText || r.eat('IS')) {
      r.eat('IS');
      set(column, r.next(), isText);
    }
  }
}

/**
 * EXEC sys.sp_addextendedproperty @name = N'MS_Description', @value = N'…', … @level1name = N'Tabla',
 * @level2name = N'columna' (o los mismos argumentos sin nombre, por posición). `false` si no es eso.
 */
function readDescription(statement: Token[], table: (name: string) => ImportedTable | undefined) {
  if (!statement.some(t => /sp_addextendedproperty$/i.test(t.value))) return false;
  const named = (name: string) => {
    const k = statement.findIndex(t => same(t.text, `@${name}`));
    return k >= 0 ? statement[k + 2]?.value : undefined;
  };
  const positional = statement.filter(t => t.kind === 'string').map(t => t.value);
  const hasNames = statement.some(t => t.text.startsWith('@'));
  const arg = (name: string, index: number) => (hasNames ? named(name) : positional[index]);
  if (!same(arg('name', 0) ?? '', 'MS_Description')) return true;
  const value = arg('value', 1);
  const target = table(arg('level1name', 5) ?? '');
  const columnName = arg('level2name', 7);
  if (!target || value === undefined) return true;
  if (columnName) {
    const column = findColumn(target, columnName);
    if (column) column.description = value;
  } else target.description = value;
  return true;
}

// --- DDS ---

/** Parece un fuente DDS: la mayoría de las líneas con «A» en la columna 6. */
export function isDds(text: string) {
  const lines = ddsLines(text).filter(l => l.trim());
  return lines.length > 0 && lines.filter(l => l[5] === 'A' || l[5] === 'a').length >= lines.length * 0.6;
}

/** Las líneas del fuente, sin el número de secuencia y la fecha si vienen delante (12 cifras). */
function ddsLines(text: string) {
  return text
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map(l => (/^[0-9 ]{12}/.test(l) && (l[17] === 'A' || l[17] === 'a') ? l.slice(12) : l));
}

interface DdsEntry {
  kind: string;
  name: string;
  ref: boolean;
  length: string;
  type: string;
  decimals: string;
  keywords: string;
}

/** Las entradas del fuente (registro, campos, claves), con las palabras clave de sus líneas de continuación. */
function ddsEntries(text: string): { file: string; entries: DdsEntry[] } {
  const entries: DdsEntry[] = [];
  let file = '';
  let continuing = false;
  ddsLines(text).forEach(raw => {
    const line = raw.padEnd(80, ' ');
    if (line[5].toUpperCase() !== 'A' || line[6] === '*') return;
    const functions = line.slice(44, 80).trimEnd();
    const head = line.slice(16, 44);
    if (continuing && entries.length) {
      // Una continuación pega el texto: «+» sigue desde el primer carácter; «-», desde la columna 45.
      const last = entries[entries.length - 1];
      last.keywords = last.keywords.replace(/[+-]$/, '') + functions.trimStart();
    } else if (!head.trim()) {
      if (entries.length) entries[entries.length - 1].keywords += ` ${functions.trim()}`;
      else file += ` ${functions.trim()}`;
    } else {
      entries.push({
        kind: line[16].toUpperCase(),
        name: line.slice(18, 28).trim(),
        ref: line[28].toUpperCase() === 'R',
        length: line.slice(29, 34).trim(),
        type: line[34].toUpperCase(),
        decimals: line.slice(35, 37).trim(),
        keywords: functions.trim(),
      });
    }
    continuing = /[+-]$/.test(functions);
  });
  return { file: file.trim(), entries };
}

/** El valor de una palabra clave: TEXT('…') → «…»; varias cadenas (COLHDG) se juntan con espacios. */
function keyword(keywords: string, name: string): string | null {
  const m = new RegExp(`\\b${name}\\s*\\(`, 'i').exec(keywords);
  if (!m) return null;
  let i = m.index + m[0].length;
  let depth = 1;
  let quoted = false;
  let value = '';
  for (; i < keywords.length; i++) {
    const ch = keywords[i];
    if (quoted) {
      if (ch === "'" && keywords[i + 1] === "'") {
        value += "''";
        i++;
      } else if (ch === "'") quoted = false;
      value += ch;
    } else if (ch === "'") {
      quoted = true;
      value += ch;
    } else if (ch === '(') {
      depth++;
      value += ch;
    } else if (ch === ')' && --depth === 0) break;
    else value += ch;
  }
  return value.trim();
}
const hasKeyword = (keywords: string, name: string) => new RegExp(`\\b${name}\\b`, 'i').test(keywords);
const unquote = (value: string) =>
  [...value.matchAll(/'((?:[^']|'')*)'/g)].map(m => m[1].replace(/''/g, "'").trim()).join(' ') || value;

function ddsType(e: DdsEntry): { type: SqlDataType; note?: string } {
  const length = e.length ? Number(e.length) : 0;
  const decimals = e.decimals ? Number(e.decimals) : 0;
  const varlen = hasKeyword(e.keywords, 'VARLEN');
  // Sin tipo: con decimales es packed (en un archivo físico); sin ellos, carácter.
  const type = e.type.trim() || (e.decimals ? 'P' : 'A');
  switch (type) {
    case 'P':
      return { type: sqlType('DECIMAL', null, length || 9, decimals) };
    case 'S':
      return { type: sqlType('NUMERIC', null, length || 9, decimals) };
    case 'B':
      if (decimals)
        return {
          type: sqlType('DECIMAL', null, length, decimals),
          note: 'binario con decimales: se lee como DECIMAL.',
        };
      return { type: sqlType(length <= 4 ? 'SMALLINT' : length <= 9 ? 'INTEGER' : 'BIGINT') };
    case 'F':
      return { type: sqlType(length && length <= 9 ? 'REAL' : 'DOUBLE') };
    case 'L':
      return { type: sqlType('DATE') };
    case 'T':
      return { type: sqlType('TIME') };
    case 'Z':
      return { type: sqlType('TIMESTAMP') };
    case 'G':
      return { type: sqlType(varlen ? 'VARGRAPHIC' : 'GRAPHIC', length || 1) };
    case 'H':
      return { type: sqlType(varlen ? 'VARBINARY' : 'BINARY', length || 1) };
    case 'O':
    case 'E':
    case 'J':
      return {
        type: sqlType(varlen ? 'VARCHAR' : 'CHAR', length || 1),
        note: `tipo DBCS ${type}: se lee como carácter.`,
      };
    default:
      return { type: sqlType(varlen ? 'VARCHAR' : 'CHAR', length || 1) };
  }
}

/** DFT('x') o DFT(12) como valor por defecto de SQL. */
function ddsDefault(keywords: string) {
  const value = keyword(keywords, 'DFT');
  if (value === null) return null;
  return /^'.*'$/.test(value) || /^[+-]?\d+(\.\d+)?$/.test(value) ? value : null;
}

/**
 * Lee el fuente DDS de un archivo físico (una tabla) o lógico (un índice sobre su PFILE). `name` es el
 * nombre del archivo (el del miembro): el fuente no lo lleva.
 */
export function parseDds(text: string, name: string): ImportResult {
  const { file, entries } = ddsEntries(text);
  const warnings: string[] = [];
  const record = entries.find(e => e.kind === 'R');
  const pfile = record && keyword(record.keywords, 'PFILE');
  const unique = hasKeyword(file, 'UNIQUE');
  const keys = entries.filter(e => e.kind === 'K').map(e => e.name);
  if (pfile) {
    // Un archivo lógico: su clave es un índice (UNIQUE si lo dice) de la tabla de su PFILE.
    return {
      dialect: 'db2i',
      tables: [],
      warnings: [],
      logical: { name, table: unquote(pfile).split('/').pop()!.trim(), columns: keys, unique },
    };
  }
  const table = emptyTable(name);
  const recordText = record ? keyword(record.keywords, 'TEXT') : null;
  table.description = recordText !== null ? unquote(recordText) : '';
  if (hasKeyword(file, 'REF'))
    warnings.push(`${name}: usa un archivo de referencias (REF): los campos con R toman de él su tipo; revísalos.`);
  entries
    .filter(e => e.kind === ' ' || e.kind === '')
    .forEach(e => {
      const read = ddsType(e);
      if (e.ref && !e.length)
        table.warnings.push(
          `${e.name}: el tipo sale del archivo de referencias; queda como ${read.type.name}(${read.type.length ?? read.type.precision}).`,
        );
      else if (read.note) table.warnings.push(`${e.name}: ${read.note}`);
      const text = keyword(e.keywords, 'TEXT');
      const heading = keyword(e.keywords, 'COLHDG');
      table.columns.push({
        name: e.name,
        type: read.type,
        nullable: hasKeyword(e.keywords, 'ALWNULL'),
        identity: false,
        defaultValue: ddsDefault(e.keywords),
        description: text !== null ? unquote(text) : heading !== null ? unquote(heading) : '',
        options: [],
      });
    });
  if (keys.length) {
    if (unique) table.primaryKey = keys;
    else table.indexes.push(keys);
  }
  // ADDPFCST no está en el fuente: las claves foráneas y CHECK se añaden en el CL, no aquí.
  return { dialect: 'db2i', tables: [table], warnings };
}

/** Un archivo lógico leído: un índice sobre la tabla de su PFILE. */
export interface LogicalFile {
  name: string;
  table: string;
  columns: string[];
  unique: boolean;
}

/** Junta lo leído de varios archivos (un fuente por archivo físico o lógico, o varios scripts). */
export function mergeResults(results: ImportResult[], dialect: SqlDialect): ImportResult {
  const tables: ImportedTable[] = [];
  const warnings: string[] = [];
  results.forEach(r => {
    warnings.push(...r.warnings);
    r.tables.forEach(t => {
      const existing = findTable(tables, t.name);
      if (existing) {
        warnings.push(`«${t.name}» aparece dos veces: se usa la última.`);
        tables.splice(tables.indexOf(existing), 1);
      }
      tables.push(t);
    });
  });
  results.forEach(r => {
    if (!r.logical) return;
    const target = findTable(tables, r.logical.table);
    if (!target)
      return warnings.push(
        `El archivo lógico ${r.logical.name} es de ${r.logical.table}, que no está entre los leídos.`,
      );
    if (r.logical.columns.length) (r.logical.unique ? target.uniques : target.indexes).push(r.logical.columns);
  });
  return { dialect, tables, warnings };
}

/** Qué base parece: DDS o lo propio de Db2 (FOR SYSTEM NAME, GENERATED … AS IDENTITY, LABEL ON) es Db2. */
export function guessDialect(text: string): SqlDialect {
  if (isDds(text)) return 'db2i';
  // Primero lo de Db2: «GENERATED ALWAYS AS IDENTITY (» también lleva un IDENTITY con paréntesis.
  const db2 =
    /\bFOR\s+SYSTEM\s+NAME\b|\bGENERATED\s+(ALWAYS|BY\s+DEFAULT)\s+AS\s+IDENTITY\b|\bLABEL\s+ON\b|\bCCSID\b|\bVARGRAPHIC\b|\bSET\s+SCHEMA\b/i;
  return db2.test(text) ? 'db2i' : 'sqlserver';
}
