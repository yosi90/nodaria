import { columnDescription, foreignKeyLinks, sqlDefaultError, sqlTypeText, type FkAction } from './database';
import { db2Inserts } from './rowsScript';
import { nodeLabel } from './selectors';
import { scriptTables, type ScriptColumn, type ScriptTable } from './sqlScript';
import { stripAccents } from './text';
import type { Project } from './types';

/*
 * Db2 for i (la base de datos de IBM i, los AS/400): el esquema de las tablas del proyecto que usan ese
 * motor, como el de SQL Server (`sqlScript.ts`), en tres formas que salen del mismo modelo (`db2Model`):
 *
 * - un script único para «Ejecutar scripts SQL» de IBM i Access Client Solutions o RUNSQLSTM;
 * - miembros fuente SQL para QSQLSRC (uno por tabla, otro con las claves foráneas y otro con los índices) y
 *   un CL que los ejecuta en orden con RUNSQLSTM;
 * - miembros DDS para QDDSSRC (un archivo físico por tabla y un lógico por índice) y un CL que los crea con
 *   CRTPF y CRTLF y añade las restricciones con ADDPFCST.
 *
 * Se eligen las tablas que se crean: las demás ya existen en la biblioteca. Las claves foráneas de una tabla
 * elegida hacia otra que ya existe se crean igual; nunca se cambia una tabla que no se ha elegido.
 *
 * Lo propio de IBM i:
 * - Los nombres son identificadores ordinarios (mayúsculas, sin acentos ni espacios); una palabra reservada
 *   va entre comillas. El nombre de la ficha se conserva como etiqueta (`LABEL ON … TEXT IS`, 50 caracteres).
 * - Las tablas y columnas de más de 10 caracteres llevan además un nombre de sistema de hasta 10
 *   (`FOR SYSTEM NAME`, `FOR COLUMN`), el que ven los programas RPG, los mandatos CL y los DDS.
 * - IDENTITY es `GENERATED ALWAYS AS IDENTITY`; al actualizar la fila referenciada solo vale NO ACTION.
 * - Los miembros fuente tienen 80 columnas útiles (archivos fuente de RCDLEN 92).
 * - No hay transacción: en IBM i necesitaría diario. Si una sentencia falla, las anteriores se quedan.
 */

const MAX_NAME = 128;
const MAX_SYSTEM = 10;
const SOURCE_WIDTH = 80;
const TEXT_TYPES = ['CHAR', 'VARCHAR', 'NCHAR', 'NVARCHAR', 'GRAPHIC', 'VARGRAPHIC'];

/** Palabras reservadas de Db2 for i que suelen salir como nombres: van entre comillas. */
const RESERVED = new Set(
  (
    'ADD ALL ALTER AND ANY AS BEGIN BETWEEN BY CALL CASE CAST CHECK COLUMN COMMIT CONSTRAINT CREATE CURRENT ' +
    'DATE DAY DEFAULT DELETE DESC DISTINCT DROP ELSE END EXISTS FETCH FOR FOREIGN FROM FULL GRANT GROUP HAVING ' +
    'HOUR IN INDEX INNER INSERT INTO IS JOIN KEY LEFT LIKE MINUTE MONTH NOT NULL OF ON OR ORDER OUTER PRIMARY ' +
    'REFERENCES RIGHT ROW ROWS SECOND SELECT SET TABLE THEN TIME TIMESTAMP TO UNION UNIQUE UPDATE USER VALUE ' +
    'VALUES VIEW WHEN WHERE WITH YEAR'
  ).split(' '),
);

/** Un nombre como identificador ordinario de Db2: «Fecha de alta» → FECHA_DE_ALTA, «Año» → ANO. */
export function db2Name(name: string) {
  const ascii = stripAccents(name)
    .toUpperCase()
    .replace(/[^A-Z0-9_]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '');
  if (!ascii) return 'SIN_NOMBRE';
  return (/^[A-Z]/.test(ascii) ? ascii : `T_${ascii}`).slice(0, MAX_NAME);
}

/** El nombre en una sentencia: tal cual o, si es una palabra reservada, entre comillas. */
export const db2Quote = (name: string) => (RESERVED.has(name) ? `"${name}"` : name);

/**
 * Nombres de sistema únicos de hasta 10 caracteres. Uno corto se queda igual; uno largo pierde los guiones
 * bajos y se corta («NOMBRE_COMPLETO» → NOMBRECOMP), y si choca, termina en un número (NOMBRECO01).
 */
export function systemNames(names: string[], taken = new Set<string>()) {
  return names.map(name => {
    let base = name.length <= MAX_SYSTEM ? name : name.replace(/_/g, '').slice(0, MAX_SYSTEM);
    if (!/^[A-Z]/.test(base)) base = `T${base}`.slice(0, MAX_SYSTEM);
    let system = base;
    for (let i = 1; taken.has(system); i++) {
      const suffix = String(i).padStart(2, '0');
      system = `${base.slice(0, MAX_SYSTEM - suffix.length)}${suffix}`;
    }
    taken.add(system);
    return system;
  });
}

/** Si un nombre vale como biblioteca o nombre de sistema de IBM i. */
export const isSystemName = (name: string) => /^[A-Z@#$][A-Z0-9@#$_]{0,9}$/.test(name);

/** La biblioteca por defecto: la que sale del nombre del proyecto, de hasta 10 caracteres. */
export function db2Library(p: Project) {
  return systemNames([db2Name(p.name)])[0];
}

const text = (value: string) => `'${value.replace(/'/g, "''")}'`;
const list = (columns: { name: string }[]) => columns.map(c => db2Quote(c.name)).join(', ');
const constraint = (...parts: string[]) => db2Quote(db2Name(parts.join('_')));

// --- El modelo: lo que se crea de cada tabla, con sus nombres de sistema ---

export interface Db2Column extends ScriptColumn {
  system: string;
}

export interface Db2ForeignKey {
  name: string;
  columns: Db2Column[];
  target: Db2Table;
  targetKeys: Db2Column[];
  onDelete: FkAction;
  /** Lo que Db2 no admite al actualizar (se deja en NO ACTION y se avisa). */
  ignoredOnUpdate: FkAction | null;
}

export interface Db2Index {
  name: string;
  columns: Db2Column[];
}

export interface Db2Table extends Omit<ScriptTable, 'columns'> {
  system: string;
  /** Etiqueta: el nombre de la ficha, como lo escribió la persona. */
  label: string;
  columns: Db2Column[];
  /** Se crea (la persona la ha elegido) o ya existe en la biblioteca. */
  created: boolean;
  keys: Db2Column[];
  uniques: { name: string; columns: Db2Column[] }[];
  checks: { name: string; column: Db2Column; options: string[] }[];
  foreignKeys: Db2ForeignKey[];
  /** Claves foráneas que no se pueden crear, con el motivo. */
  skipped: string[];
  indexes: Db2Index[];
}

export interface Db2Options {
  /** Biblioteca donde se crean las tablas. */
  library?: string;
  /** Nodos tabla que se crean; sin lista, todos los de Db2 for i. */
  tableIds?: string[];
  /** Las filas de ejemplo de las tablas que se crean (por defecto, sí). */
  rows?: boolean;
}

/** Las tablas de Db2 for i del proyecto, con lo que se crea de cada una. */
export function db2Model(p: Project, options: Db2Options = {}): Db2Table[] {
  const selected = options.tableIds ? new Set(options.tableIds) : null;
  const base = scriptTables(p, 'db2i', db2Name);
  // Los nombres de sistema se calculan con todas las tablas, para que no cambien según lo que se elija.
  const tableSystem = systemNames(base.map(t => t.name));
  const indexNames = new Set(tableSystem);
  const tables: Db2Table[] = base.map((t, i) => {
    const systems = systemNames(t.columns.map(c => c.name));
    const columns = t.columns.map((c, j) => ({ ...c, system: systems[j] }));
    const keys = columns.filter(c => c.sql.primaryKey);
    const fieldIds = [...new Set(columns.map(c => c.field.id))];
    const ofField = (fieldId: string) => columns.filter(c => c.field.id === fieldId);
    const sameAsKey = (cs: Db2Column[]) => cs.length === keys.length && cs.every(c => c.sql.primaryKey);
    const uniques = fieldIds
      .map(ofField)
      .filter(cs => cs[0].sql.unique && !sameAsKey(cs))
      .map(cs => ({ name: constraint('UQ', t.name, cs[0].name), columns: cs }));
    const groups = new Map<string, Db2Column[]>();
    columns.forEach(c => {
      const group = c.sql.uniqueGroup?.trim();
      if (group) groups.set(group, [...(groups.get(group) ?? []), c]);
    });
    groups.forEach((cs, group) => uniques.push({ name: constraint('UQ', t.name, group), columns: cs }));
    const checks = columns
      .filter(c => c.field.type === 'select' && c.field.options.length && TEXT_TYPES.includes(c.type.name))
      .map(c => ({ name: constraint('CK', t.name, c.name), column: c, options: c.field.options }));
    const indexes = fieldIds
      .map(ofField)
      .filter(cs => cs[0].sql.indexed && !cs[0].sql.unique && !sameAsKey(cs))
      .map(cs => ({
        name: systemNames([`${tableSystem[i].slice(0, MAX_SYSTEM - 3)}_IX`], indexNames)[0],
        columns: cs,
      }));
    return {
      ...t,
      system: tableSystem[i],
      label: nodeLabel(p, t.node),
      columns,
      created: !selected || selected.has(t.node.id),
      keys,
      uniques,
      checks,
      foreignKeys: [],
      skipped: [],
      indexes,
    };
  });

  const byNode = new Map(tables.map(t => [t.node.id, t]));
  const used = new Set<string>();
  foreignKeyLinks(p).forEach(k => {
    const source = byNode.get(k.sourceId);
    const target = byNode.get(k.targetId);
    const columns = source ? source.columns.filter(c => c.field.id === k.fieldId) : [];
    if (!source || !target || !columns.length) return;
    const label = `${source.name}.${columns[0].name} → ${target.name}`;
    let targetKeys: Db2Column[];
    if (columns[0].targetKey) {
      targetKeys = columns.map(c => target.columns.find(t => t.name === c.targetKey)!).filter(Boolean);
    } else {
      const targetKey = target.columns.find(c => c.field.id === k.targetFieldId);
      if (!targetKey) {
        source.skipped.push(`${label}: la tabla destino no tiene clave primaria.`);
        return;
      }
      if (sqlTypeText(targetKey.type) !== sqlTypeText(columns[0].type)) {
        source.skipped.push(
          `${label}: la columna es ${sqlTypeText(columns[0].type)} y la clave ${sqlTypeText(targetKey.type)}.`,
        );
        return;
      }
      targetKeys = [targetKey];
    }
    const field = columns[0];
    const stem = field.targetKey ? db2Name(field.field.key || field.name) : field.name;
    let name = db2Name(`FK_${source.name}_${stem}`);
    for (let i = 2; used.has(name); i++) name = db2Name(`FK_${source.name}_${stem}_${i}`);
    used.add(name);
    source.foreignKeys.push({
      name,
      columns,
      target,
      targetKeys,
      onDelete: field.sql.onDelete ?? 'NO ACTION',
      ignoredOnUpdate: field.sql.onUpdate && field.sql.onUpdate !== 'NO ACTION' ? field.sql.onUpdate : null,
    });
  });
  return tables;
}

// --- SQL ---

function columnSql(c: Db2Column) {
  const forColumn = c.name.length > MAX_SYSTEM ? ` FOR COLUMN ${c.system}` : '';
  const identity = c.sql.identity ? ' GENERATED ALWAYS AS IDENTITY (START WITH 1 INCREMENT BY 1)' : '';
  const nulls = c.sql.nullable && !c.sql.primaryKey ? '' : ' NOT NULL';
  const fallback =
    c.sql.defaultValue && !c.sql.identity && !sqlDefaultError(c.sql.defaultValue)
      ? ` DEFAULT ${c.sql.defaultValue}`
      : '';
  return `${db2Quote(c.name)}${forColumn} ${sqlTypeText(c.type)}${identity}${nulls}${fallback}`;
}

/** El CREATE TABLE de una tabla, o `null` si no tiene columnas. */
function createTable(t: Db2Table) {
  if (!t.columns.length) return null;
  const lines = t.columns.map(columnSql);
  if (t.keys.length) lines.push(`CONSTRAINT ${constraint('PK', t.name)} PRIMARY KEY (${list(t.keys)})`);
  t.uniques.forEach(u => lines.push(`CONSTRAINT ${u.name} UNIQUE (${list(u.columns)})`));
  t.checks.forEach(c =>
    lines.push(`CONSTRAINT ${c.name} CHECK (${db2Quote(c.column.name)} IN (${c.options.map(text).join(', ')}))`),
  );
  const system = t.name.length > MAX_SYSTEM ? ` FOR SYSTEM NAME ${t.system}` : '';
  return [
    `CREATE TABLE ${db2Quote(t.name)}${system} (`,
    ...lines.map((l, i) => `    ${l}${i < lines.length - 1 ? ',' : ''}`),
    ');',
  ];
}

/** Etiquetas (lo que enseñan WRKOBJ y DSPFFD, 50 caracteres) con los nombres originales. */
function labels(t: Db2Table) {
  if (!t.columns.length) return [];
  return [
    `LABEL ON TABLE ${db2Quote(t.name)} IS ${text(t.label.slice(0, 50))};`,
    `LABEL ON COLUMN ${db2Quote(t.name)} (`,
    ...t.columns.map(
      (c, i) =>
        `    ${db2Quote(c.name)} TEXT IS ${text((c.field.label || c.name).slice(0, 50))}${i < t.columns.length - 1 ? ',' : ''}`,
    ),
    ');',
  ];
}

/**
 * Comentarios con las descripciones. En un miembro fuente la cadena va en su propia línea y no puede pasar de
 * las 80 columnas (no se parte: el relleno de la línea quedaría dentro), así que una descripción más larga
 * se corta ahí; entera va en el script único.
 */
function comments(t: Db2Table, inMember = false) {
  return t.columns
    .filter(c => columnDescription(c))
    .flatMap(c => {
      const prefix = `COMMENT ON COLUMN ${db2Quote(t.name)}.${db2Quote(c.name)} IS`;
      const description = columnDescription(c).slice(0, 2000);
      if (!inMember) return [`${prefix} ${text(description)};`];
      let value = description;
      while (`    ${text(value)};`.length > SOURCE_WIDTH) value = `${value.slice(0, -2)}…`;
      return [prefix, `    ${text(value)};`];
    });
}

function foreignKeySql(t: Db2Table, k: Db2ForeignKey) {
  const lines: string[] = [];
  if (!k.target.created) lines.push(`-- ${k.target.name} ya existe en la biblioteca.`);
  if (k.ignoredOnUpdate) lines.push(`-- Db2 for i no admite ON UPDATE ${k.ignoredOnUpdate}: se deja en NO ACTION.`);
  const onDelete = k.onDelete !== 'NO ACTION' ? ` ON DELETE ${k.onDelete}` : '';
  lines.push(
    `ALTER TABLE ${db2Quote(t.name)} ADD CONSTRAINT ${db2Quote(k.name)} FOREIGN KEY (${list(k.columns)}) ` +
      `REFERENCES ${db2Quote(k.target.name)} (${list(k.targetKeys)})${onDelete};`,
  );
  return lines;
}

const indexSql = (t: Db2Table, x: Db2Index) => `CREATE INDEX ${x.name} ON ${db2Quote(t.name)} (${list(x.columns)});`;

const stamp = (p: Project, generatedAt: Date) =>
  `«${p.name}» para Db2 for i (IBM i), generado por Nodaria el ${generatedAt.toISOString().slice(0, 10)}`;

/** El script único: para «Ejecutar scripts SQL» de ACS o RUNSQLSTM. */
export function db2Script(p: Project, generatedAt = new Date(), options: Db2Options = {}): string {
  const library = options.library || db2Library(p);
  const tables = db2Model(p, options);
  const created = tables.filter(t => t.created);
  const out: string[] = [
    `-- Esquema de ${stamp(p, generatedAt)}.`,
    '-- Ejecútalo con «Ejecutar scripts SQL» de IBM i Access Client Solutions o con RUNSQLSTM (COMMIT(*NONE)).',
    `-- Las tablas se crean en la biblioteca ${library}: cámbiala en SET SCHEMA si es otra.`,
    '-- Los nombres de más de 10 caracteres llevan además su nombre de sistema (FOR SYSTEM NAME, FOR COLUMN).',
    '-- No hay transacción: si una sentencia falla, las anteriores se quedan.',
    '',
    `-- CREATE SCHEMA ${library};  -- si la biblioteca aún no existe (la crea con su diario)`,
    `SET SCHEMA ${library};`,
    '',
  ];
  created.forEach(t => {
    const create = createTable(t);
    out.push(...(create ?? [`-- ${t.name}: sin columnas, no se crea.`]), '');
  });
  // Las filas de ejemplo, antes de las claves foráneas: así no importa el orden de las tablas.
  if (options.rows !== false) out.push(...db2Inserts(p, created, db2Quote));
  const foreign = created.flatMap(t => [
    ...t.skipped.map(s => `-- Omitida ${s}`),
    ...t.foreignKeys.flatMap(k => foreignKeySql(t, k)),
  ]);
  if (foreign.length) out.push('-- Claves foráneas', ...foreign);
  const indexes = created.flatMap(t => t.indexes.map(x => indexSql(t, x)));
  if (indexes.length) out.push('', '-- Índices', ...indexes);
  const labelLines = created.flatMap(labels);
  if (labelLines.length) out.push('', '-- Etiquetas', ...labelLines);
  const commentLines = created.flatMap(t => comments(t));
  if (commentLines.length) out.push('', '-- Descripciones de las columnas', ...commentLines);
  out.push('');
  return out.join('\n');
}

// --- Miembros fuente ---

/**
 * Parte una línea de SQL en líneas de 80 columnas por los espacios que no están dentro de una cadena (una
 * cadena no se parte: en un miembro fuente, el relleno de la línea quedaría dentro). Las continuaciones van
 * sangradas.
 */
export function wrapSql(line: string, width = SOURCE_WIDTH): string[] {
  if (line.length <= width) return [line];
  const lead = line.match(/^\s*/)?.[0] ?? '';
  // Un comentario sigue siendo comentario en cada línea.
  const indent = line.trimStart().startsWith('--') ? `${lead}-- ` : `${lead}    `;
  const out: string[] = [];
  let rest = line;
  let prefix = '';
  while ((prefix + rest).length > width) {
    const room = width - prefix.length;
    let quoted = false;
    let cut = -1;
    for (let i = 0; i < rest.length && i <= room; i++) {
      if (rest[i] === "'") quoted = !quoted;
      else if (rest[i] === ' ' && !quoted && i > 0) cut = i;
    }
    if (cut <= 0) break;
    out.push(prefix + rest.slice(0, cut).trimEnd());
    rest = rest.slice(cut + 1).trimStart();
    prefix = indent;
  }
  out.push(prefix + rest);
  return out;
}

const member = (lines: string[]) => `${lines.flatMap(l => wrapSql(l)).join('\r\n')}\r\n`;

/** Una línea de mandato CL partida en 80 columnas con «+», como las escribe SEU. */
export function wrapCl(command: string, width = SOURCE_WIDTH): string[] {
  const [verb, ...params] = command.split(' ');
  const lines: string[] = [];
  let current = `             ${verb.padEnd(10)} `;
  params.forEach(param => {
    const piece = `${param} `;
    if (current.length + piece.length + 1 > width && current.trim() !== verb) {
      lines.push(`${current}+`);
      current = '                          ';
    }
    current += piece;
  });
  lines.push(current.trimEnd());
  return lines;
}

const clMember = (commands: string[]) => `${commands.flatMap(c => wrapCl(c)).join('\r\n')}\r\n`;

const DELETE_RULES: Record<FkAction, string> = {
  'NO ACTION': '*NOACTION',
  CASCADE: '*CASCADE',
  'SET NULL': '*SETNULL',
  'SET DEFAULT': '*SETDFT',
};

// DDS: columnas fijas (A en la 6, nombre en la 19, longitud acabando en la 34, tipo en la 35, decimales en
// la 36-37 y palabras clave de la 45 a la 80).
function ddsLine({
  kind = ' ',
  name = '',
  length = '',
  type = ' ',
  decimals = '',
  keyword = '',
}: {
  kind?: string;
  name?: string;
  length?: string | number;
  type?: string;
  decimals?: string | number;
  keyword?: string;
}) {
  return `     A          ${kind} ${name.padEnd(10)}${' '}${String(length).padStart(5)}${type}${String(decimals).padStart(2)}       ${keyword}`.trimEnd();
}

/** Una palabra clave DDS en una o varias líneas: si no cabe en las 36 columnas, sigue con «-» en la siguiente. */
function ddsKeyword(keyword: string) {
  const lines: string[] = [];
  let rest = keyword;
  while (rest.length > 36) {
    lines.push(ddsLine({ keyword: `${rest.slice(0, 35)}-` }));
    rest = rest.slice(35);
  }
  lines.push(ddsLine({ keyword: rest }));
  return lines;
}

const ddsText = (value: string) => value.replace(/'/g, "''");

/** El tipo en DDS (longitud, tipo, decimales y palabras clave) o lo más parecido, con un aviso si no existe. */
function ddsType(c: Db2Column): {
  length: number | '';
  type: string;
  decimals: number | '';
  keywords: string[];
  note?: string;
} {
  const n = typeof c.type.length === 'number' ? c.type.length : 0;
  switch (c.type.name) {
    case 'SMALLINT':
      return { length: 4, type: 'B', decimals: 0, keywords: [] };
    case 'INTEGER':
      return { length: 9, type: 'B', decimals: 0, keywords: [] };
    case 'BIGINT':
      return { length: 18, type: 'B', decimals: 0, keywords: [] };
    case 'DECIMAL':
      return { length: c.type.precision ?? 18, type: 'P', decimals: c.type.scale ?? 0, keywords: [] };
    case 'NUMERIC':
      return { length: c.type.precision ?? 18, type: 'S', decimals: c.type.scale ?? 0, keywords: [] };
    case 'REAL':
      return { length: 9, type: 'F', decimals: 2, keywords: ['FLTPCN(*SINGLE)'] };
    case 'DOUBLE':
      return { length: 17, type: 'F', decimals: 6, keywords: ['FLTPCN(*DOUBLE)'] };
    case 'DECFLOAT':
      return {
        length: 17,
        type: 'F',
        decimals: 6,
        keywords: ['FLTPCN(*DOUBLE)'],
        note: 'DECFLOAT no existe en DDS: va como doble precisión',
      };
    case 'BOOLEAN':
      return {
        length: 1,
        type: 'A',
        decimals: '',
        keywords: [],
        note: 'BOOLEAN no existe en DDS: va como un carácter',
      };
    case 'CHAR':
      return { length: n, type: 'A', decimals: '', keywords: [] };
    case 'VARCHAR':
      return { length: n, type: 'A', decimals: '', keywords: ['VARLEN'] };
    case 'NCHAR':
    case 'GRAPHIC':
      return { length: n, type: 'G', decimals: '', keywords: ['CCSID(1200)'] };
    case 'NVARCHAR':
    case 'VARGRAPHIC':
      return { length: n, type: 'G', decimals: '', keywords: ['VARLEN', 'CCSID(1200)'] };
    case 'BINARY':
      return { length: n, type: 'H', decimals: '', keywords: [] };
    case 'VARBINARY':
      return { length: n, type: 'H', decimals: '', keywords: ['VARLEN'] };
    case 'CLOB':
      return {
        length: 32740,
        type: 'A',
        decimals: '',
        keywords: ['VARLEN'],
        note: 'CLOB no existe en DDS: va como texto variable de 32740',
      };
    case 'NCLOB':
      return {
        length: 16370,
        type: 'G',
        decimals: '',
        keywords: ['VARLEN', 'CCSID(1200)'],
        note: 'NCLOB no existe en DDS: va como gráfico variable de 16370',
      };
    case 'BLOB':
      return {
        length: 32740,
        type: 'H',
        decimals: '',
        keywords: ['VARLEN'],
        note: 'BLOB no existe en DDS: va como binario variable de 32740',
      };
    case 'DATE':
      return { length: '', type: 'L', decimals: '', keywords: ['DATFMT(*ISO)'] };
    case 'TIME':
      return { length: '', type: 'T', decimals: '', keywords: ['TIMFMT(*ISO)'] };
    case 'TIMESTAMP':
      return { length: '', type: 'Z', decimals: '', keywords: [] };
    default:
      return { length: 50, type: 'A', decimals: '', keywords: [], note: `${c.type.name} no es de Db2 for i` };
  }
}

/** Un valor por defecto que DDS admite (un número o un texto entre comillas), o `null`. */
const ddsDefault = (value: string | null | undefined) =>
  value && /^(-?\d+(\.\d+)?|'([^']|'')*')$/.test(value.trim()) ? value.trim() : null;

/** Nombre del formato de registro: el del archivo terminado en R (distinto del archivo, para RPG). */
const recordFormat = (t: Db2Table) => `${t.system.slice(0, MAX_SYSTEM - 1)}R`;

function physicalFile(p: Project, t: Db2Table, generatedAt: Date) {
  const lines = [`     A* ${t.label} · ${stamp(p, generatedAt)}`.slice(0, SOURCE_WIDTH)];
  if (t.keys.length) lines.push(ddsLine({ keyword: 'UNIQUE' }));
  lines.push(
    ddsLine({ kind: 'R', name: recordFormat(t), keyword: '' }),
    ...ddsKeyword(`TEXT('${ddsText(t.label.slice(0, 50))}')`),
  );
  t.columns.forEach(c => {
    const type = ddsType(c);
    if (type.note) lines.push(`     A* ${c.system}: ${type.note}.`.slice(0, SOURCE_WIDTH));
    if (c.sql.identity)
      lines.push(
        `     A* ${c.system}: IDENTITY no existe en DDS; usa el script SQL si la necesitas.`.slice(0, SOURCE_WIDTH),
      );
    const keywords = [...type.keywords];
    if (c.sql.nullable && !c.sql.primaryKey) keywords.push('ALWNULL');
    const fallback = ddsDefault(c.sql.defaultValue);
    if (fallback) keywords.push(`DFT(${fallback})`);
    else if (c.sql.defaultValue)
      lines.push(
        `     A* ${c.system}: el valor por defecto «${c.sql.defaultValue}» no vale en DDS.`.slice(0, SOURCE_WIDTH),
      );
    const label = (c.field.label || c.name).slice(0, 50);
    lines.push(
      ddsLine({
        name: c.system,
        length: type.length,
        type: type.type,
        decimals: type.decimals,
        keyword: keywords.shift() ?? '',
      }),
    );
    keywords.forEach(k => lines.push(...ddsKeyword(k)));
    lines.push(...ddsKeyword(`TEXT('${ddsText(label)}')`));
    const heading = label.slice(0, 60).match(/.{1,20}/g) ?? [label];
    lines.push(...ddsKeyword(`COLHDG(${heading.map(h => `'${ddsText(h)}'`).join(' ')})`));
  });
  t.keys.forEach(k => lines.push(ddsLine({ kind: 'K', name: k.system })));
  return lines;
}

function logicalFile(t: Db2Table, x: Db2Index) {
  return [
    `     A* Índice de ${t.label} por ${x.columns.map(c => c.system).join(', ')}`.slice(0, SOURCE_WIDTH),
    ddsLine({ kind: 'R', name: recordFormat(t), keyword: `PFILE(${t.system})` }),
    ...x.columns.map(c => ddsLine({ kind: 'K', name: c.system })),
  ];
}

const keyList = (columns: Db2Column[]) =>
  columns.length === 1 ? columns[0].system : `(${columns.map(c => c.system).join(' ')})`;
const clText = (value: string) => `'${value.replace(/'/g, "''")}'`;

export interface Db2SourceOptions extends Db2Options {
  /** Miembros SQL para QSQLSRC. */
  sql?: boolean;
  /** Miembros DDS para QDDSSRC. */
  dds?: boolean;
  /** Carpeta del IFS donde se sube el contenido del ZIP, para las órdenes de carga. */
  folder?: string;
}

/**
 * Los miembros fuente, como archivos para un ZIP: `QSQLSRC/<miembro>.sql`, `QDDSSRC/<miembro>.pf|.lf`,
 * `QCLSRC/<programa>.clle`, y `CARGAR.sql` con las órdenes para copiarlos a la biblioteca, compilar el CL
 * y llamarlo desde «Ejecutar scripts SQL». La extensión dice el tipo del miembro.
 */
export function db2Sources(p: Project, generatedAt = new Date(), options: Db2SourceOptions = {}) {
  const library = options.library || db2Library(p);
  const folder = (options.folder || '/tmp/nodaria').replace(/\/$/, '');
  const tables = db2Model(p, options).filter(t => t.created && t.columns.length);
  const files: { path: string; text: string; member: string; file: string; type: string; label: string }[] = [];
  const add = (file: string, member: string, type: string, label: string, content: string) =>
    files.push({
      path: `${file}/${member}.${type.toLowerCase()}`,
      text: content,
      member,
      file,
      type,
      label: label.slice(0, 50),
    });
  // Los miembros de las claves y los índices no chocan con los de las tablas.
  const taken = new Set(tables.map(t => t.system));
  const [foreignMember, indexMember, rowsMember, ddsRowsMember] = systemNames(
    ['CLAVES', 'INDICES', 'DATOS', 'DATOSPF'],
    taken,
  );
  const runSql = (mbr: string) =>
    `RUNSQLSTM SRCFILE(&LIB/QSQLSRC) SRCMBR(${mbr}) COMMIT(*NONE) NAMING(*SQL) DFTRDBCOL(&LIB)`;
  // Las filas de ejemplo van en QSQLSRC aunque las tablas se creen con DDS (allí, con los nombres de sistema).
  const rows = options.rows !== false ? db2Inserts(p, tables, db2Quote) : [];
  const ddsRows = options.rows !== false && options.dds ? db2Inserts(p, tables, db2Quote, true) : [];
  const [sqlProgram, ddsProgram] = systemNames(['CRTSQL', 'CRTDDS'], new Set(taken));
  const header = (what: string) => [`-- ${what}`, `-- ${stamp(p, generatedAt)}.`];

  if (options.sql !== false) {
    tables.forEach(t =>
      add(
        'QSQLSRC',
        t.system,
        'SQL',
        t.label,
        member([...header(`Tabla ${t.label}`), ...(createTable(t) ?? []), ...labels(t), ...comments(t, true)]),
      ),
    );
    const foreign = tables.flatMap(t => [
      ...t.skipped.map(s => `-- Omitida ${s}`),
      ...t.foreignKeys.flatMap(k => foreignKeySql(t, k)),
    ]);
    if (rows.length)
      add('QSQLSRC', rowsMember, 'SQL', 'Filas de ejemplo', member([...header('Filas de ejemplo'), ...rows]));
    if (foreign.length)
      add('QSQLSRC', foreignMember, 'SQL', 'Claves foráneas', member([...header('Claves foráneas'), ...foreign]));
    const indexes = tables.flatMap(t => t.indexes.map(x => indexSql(t, x)));
    if (indexes.length) add('QSQLSRC', indexMember, 'SQL', 'Índices', member([...header('Índices'), ...indexes]));
    add(
      'QCLSRC',
      sqlProgram,
      'CLLE',
      'Crea las tablas con SQL',
      clMember([
        'PGM PARM(&LIB)',
        'DCL VAR(&LIB) TYPE(*CHAR) LEN(10)',
        ...files.filter(f => f.file === 'QSQLSRC').map(f => runSql(f.member)),
        'ENDPGM',
      ]),
    );
  }

  if (options.dds) {
    tables.forEach(t => add('QDDSSRC', t.system, 'PF', t.label, `${physicalFile(p, t, generatedAt).join('\r\n')}\r\n`));
    tables.forEach(t =>
      t.indexes.forEach(x =>
        add('QDDSSRC', x.name, 'LF', `Índice de ${t.label}`, `${logicalFile(t, x).join('\r\n')}\r\n`),
      ),
    );
    const commands = [
      'PGM PARM(&LIB)',
      'DCL VAR(&LIB) TYPE(*CHAR) LEN(10)',
      ...tables.map(t => `CRTPF FILE(&LIB/${t.system}) SRCFILE(&LIB/QDDSSRC) SRCMBR(${t.system})`),
      ...tables.flatMap(t => t.indexes.map(x => `CRTLF FILE(&LIB/${x.name}) SRCFILE(&LIB/QDDSSRC) SRCMBR(${x.name})`)),
      // Las filas, antes de las restricciones (como en SQL: así no importa el orden de las tablas).
      ...(ddsRows.length ? [runSql(ddsRowsMember)] : []),
      ...tables.flatMap(t => [
        ...(t.keys.length ? [`ADDPFCST FILE(&LIB/${t.system}) TYPE(*PRIKEY) KEY(${keyList(t.keys)})`] : []),
        ...t.uniques.map(u => `ADDPFCST FILE(&LIB/${t.system}) TYPE(*UNQCST) KEY(${keyList(u.columns)})`),
        ...t.checks.map(
          c =>
            `ADDPFCST FILE(&LIB/${t.system}) TYPE(*CHKCST) CHKCST(${clText(`${c.column.system} IN (${c.options.map(text).join(', ')})`)})`,
        ),
      ]),
      ...tables.flatMap(t =>
        t.foreignKeys.map(
          k =>
            `ADDPFCST FILE(&LIB/${t.system}) TYPE(*REFCST) KEY(${keyList(k.columns)}) PRNFILE(&LIB/${k.target.system}) ` +
            `PRNKEY(${keyList(k.targetKeys)}) DLTRULE(${DELETE_RULES[k.onDelete]}) UPDRULE(*NOACTION)`,
        ),
      ),
      'ENDPGM',
    ];
    if (ddsRows.length)
      add(
        'QSQLSRC',
        ddsRowsMember,
        'SQL',
        'Filas de ejemplo (DDS)',
        member([...header('Filas de ejemplo, con los nombres de sistema de los archivos DDS'), ...ddsRows]),
      );
    add('QCLSRC', ddsProgram, 'CLLE', 'Crea las tablas con DDS', clMember(commands));
  }

  // Las órdenes de carga, para «Ejecutar scripts SQL» de ACS (cada línea «CL:» es un mandato).
  const sourceFiles = [...new Set(files.map(f => f.file))];
  const load = [
    `-- Carga de los miembros fuente de ${stamp(p, generatedAt)}.`,
    `-- 1. Sube el contenido del ZIP a la carpeta ${folder} del IFS (en ACS, «Sistema de archivos integrado»).`,
    '-- 2. Ejecuta este archivo en «Ejecutar scripts SQL». Si un archivo fuente ya existe, sáltate su CRTSRCPF.',
    `-- 3. Llama al programa que quieras: CALL ${library}/${sqlProgram} PARM('${library}') para SQL o`,
    `--    CALL ${library}/${ddsProgram} PARM('${library}') para DDS (no los dos: crean las mismas tablas).`,
    '',
    ...sourceFiles.map(f => `CL: CRTSRCPF FILE(${library}/${f}) RCDLEN(92);`),
    '',
    ...files.flatMap(f => [
      `CL: CPYFRMSTMF FROMSTMF('${folder}/${f.path}') TOMBR('/QSYS.LIB/${library}.LIB/${f.file}.FILE/${f.member}.MBR') MBROPT(*REPLACE) STMFCCSID(1208);`,
      `CL: CHGPFM FILE(${library}/${f.file}) MBR(${f.member}) SRCTYPE(${f.type}) TEXT(${clText(f.label)});`,
    ]),
    '',
    ...files
      .filter(f => f.type === 'CLLE')
      .map(f => `CL: CRTBNDCL PGM(${library}/${f.member}) SRCFILE(${library}/QCLSRC) SRCMBR(${f.member});`),
    '',
  ];
  return [...files.map(f => ({ path: f.path, text: f.text })), { path: 'CARGAR.sql', text: load.join('\r\n') }];
}
