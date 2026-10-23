import { isAiTable, type AiContextRefs } from './aiContext';
import {
  columnSqlIn,
  engineOf,
  foreignKeyLinks,
  isEmbeddedType,
  isTableType,
  replaceField,
  setColumnSql,
  sqlType,
  sqlTypeError,
  sqlTypeText,
  SQL_TYPES,
  tableColumns,
  tableIssues,
  type SqlColumn,
  type SqlDataType,
  type SqlServerTypeName,
  type TableColumn,
} from './database';
import { COLORS } from './constants';
import { DOC_TYPES, isDocumentEngine } from './dbEngines';
import { createField, createSchema } from './factories';
import { isFieldLink } from './library';
import { addNode, deleteField, deleteNodes, deleteSchema, updateNodeValue } from './operations';
import { allFields, getNode, getSchema, nodeLabel } from './selectors';
import { hideNewTypesInGenealogy } from './layoutFilters';
import type { DbEngine, FieldDefinition, FieldType, Node, Project, SchemaField } from './types';

/*
 * Propuestas de la asistencia de IA para un esquema de base de datos. La respuesta del modelo es
 * entrada no fiable: cada operación se resuelve contra el proyecto actual y se comprueba con las
 * mismas reglas que el editor manual antes de enseñarla, y solo se aplican las que la persona marca.
 *
 * Las tablas se nombran por el identificador corto del contexto (`t1`…; ver `aiContext.ts`) o por la
 * referencia que una operación «crear tabla» de la misma propuesta da a la suya; las bases, por el
 * suyo (`b1`…). Las columnas, por su nombre dentro de la tabla. La API valida la forma; aquí se valida
 * el significado.
 *
 * Se reutiliza lo que ya tiene el proyecto antes que duplicarlo: una tabla nueva hereda de su base,
 * una columna con el nombre de una preforma la vincula y una columna que ya llega por herencia no se
 * repite. Así la propuesta sigue el estilo del proyecto aunque el modelo no lo pida explícitamente.
 */

export interface AiColumnSpec {
  name: string;
  /** `null` solo con una preforma: la columna toma su tipo. */
  type: SqlDataType | null;
  primaryKey: boolean;
  nullable: boolean;
  unique: boolean;
  identity: boolean;
  description: string;
  /** Preforma de la biblioteca que se vincula en lugar de crear la columna; `null` o vacío = columna nueva. */
  preform?: string | null;
  /** En una colección o un subdocumento: el tipo del campo en su base («string», «objectId»…). */
  docType?: string | null;
}

/** Cambios de una columna: `null` deja ese aspecto como está. */
export interface AiColumnChanges {
  type: SqlDataType | null;
  primaryKey: boolean | null;
  nullable: boolean | null;
  unique: boolean | null;
  identity: boolean | null;
  description: string | null;
  docType?: string | null;
}

export type AiOperation =
  | {
      op: 'create-table';
      ref: string;
      name: string;
      description: string;
      /** Base de la que hereda (`b1`…); `null` o vacío = ninguna. */
      base?: string | null;
      /** Una colección de documentos; sin él, una tabla de SQL Server (o como las del proyecto). */
      engine?: 'mongodb' | 'firestore' | null;
      /** Un subdocumento: va dentro de una colección (con `embed`), sin colección propia. */
      embedded?: boolean;
      columns: AiColumnSpec[];
      reason: string;
    }
  | { op: 'rename-table'; table: string; name: string; reason: string }
  | { op: 'delete-table'; table: string; reason: string }
  | { op: 'add-column'; table: string; column: AiColumnSpec; reason: string }
  | { op: 'update-column'; table: string; column: string; changes: AiColumnChanges; reason: string }
  | { op: 'rename-column'; table: string; column: string; name: string; reason: string }
  | { op: 'delete-column'; table: string; column: string; reason: string }
  | {
      op: 'add-foreign-key';
      table: string;
      column: string;
      references: string;
      nullable: boolean;
      /** Forma parte de la clave primaria (tablas intermedias). */
      primaryKey?: boolean;
      reason: string;
    }
  | {
      /** Lleva un subdocumento dentro de una colección o de otro subdocumento (una lista con `many`). */
      op: 'embed';
      table: string;
      column: string;
      references: string;
      many: boolean;
      nullable: boolean;
      reason: string;
    };

export interface AiProposal {
  summary: string;
  operations: AiOperation[];
  /** Recomendaciones que no son operaciones («revisa si…»). */
  advice: string[];
}

export const AI_MAX_OPERATIONS = 200;
export const AI_MAX_COLUMNS = 150;
export const AI_MAX_NAME = 128;

export type AiReviewStatus = 'ok' | 'warning' | 'invalid';

export interface AiOperationReview {
  index: number;
  operation: AiOperation;
  /** Descripción en español: «Crear la tabla Linea_pedido (4 columnas)». */
  title: string;
  status: AiReviewStatus;
  messages: string[];
  /** Borra algo: sale desmarcada por defecto. */
  destructive: boolean;
  selected: boolean;
  /** Se ha aplicado en el resultado (marcada y válida). */
  applied: boolean;
  /** Ya se aplicó antes (al retomar la propuesta): no se vuelve a hacer. */
  done?: boolean;
}

export interface AiProposalReview {
  project: Project;
  operations: AiOperationReview[];
  /** Avisos de las tablas tocadas en el resultado (`tableIssues`). */
  issues: string[];
}

export const isDestructive = (op: AiOperation) => op.op === 'delete-table' || op.op === 'delete-column';

/** Por defecto se marcan todas menos los borrados. */
export function defaultSelection(proposal: AiProposal): number[] {
  return proposal.operations.flatMap((op, i) => (isDestructive(op) ? [] : [i]));
}

/** Ids deterministas a partir de una semilla, para que la vista previa y lo aplicado coincidan. */
export function seededIds(seed: string) {
  let n = 0;
  return (prefix: string) => `${prefix}_ia${seed}_${++n}`;
}

class Rejected extends Error {}
const reject = (message: string): never => {
  throw new Rejected(message);
};

const same = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

function checkName(name: string, what: string) {
  const clean = name.trim();
  if (!clean) reject(`Falta el nombre de la ${what}.`);
  if (clean.length > AI_MAX_NAME) reject(`El nombre de la ${what} pasa de ${AI_MAX_NAME} caracteres.`);
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u001f\]]/.test(clean)) reject(`El nombre de la ${what} «${clean}» tiene caracteres no válidos.`);
  return clean;
}

function checkType(raw: SqlDataType): SqlDataType {
  if (!raw || !SQL_TYPES.includes(raw.name as SqlServerTypeName)) reject(`El tipo «${raw?.name}» no es de SQL Server.`);
  const type = sqlType(raw.name, raw.length, raw.precision ?? undefined, raw.scale ?? undefined);
  const error = sqlTypeError(type);
  if (error) reject(error);
  return type;
}

/** Tipo de atributo de Nodaria para una columna nueva; el SQL va explícito en `sql`. */
function fieldTypeFor(type: SqlDataType): FieldType {
  if (['int', 'bigint', 'smallint', 'tinyint', 'decimal', 'numeric', 'float', 'money'].includes(type.name))
    return 'number';
  if (type.name === 'bit') return 'boolean';
  if (type.name === 'date') return 'date';
  return type.length === 'max' ? 'longText' : 'text';
}

/** Un tipo de SQL Server que el modelo pone en un campo de documento: su equivalente en esa base. */
const SQL_TO_DOC: Record<string, Partial<Record<'mongodb' | 'firestore', string>>> = {
  int: { mongodb: 'int', firestore: 'int' },
  bigint: { mongodb: 'long', firestore: 'int' },
  smallint: { mongodb: 'int', firestore: 'int' },
  tinyint: { mongodb: 'int', firestore: 'int' },
  bit: { mongodb: 'bool', firestore: 'boolean' },
  decimal: { mongodb: 'decimal', firestore: 'number' },
  numeric: { mongodb: 'decimal', firestore: 'number' },
  money: { mongodb: 'decimal', firestore: 'number' },
  float: { mongodb: 'double', firestore: 'number' },
  date: { mongodb: 'date', firestore: 'timestamp' },
  datetime: { mongodb: 'date', firestore: 'timestamp' },
  datetime2: { mongodb: 'date', firestore: 'timestamp' },
  uniqueidentifier: { mongodb: 'string', firestore: 'string' },
  varbinary: { mongodb: 'binData', firestore: 'bytes' },
};

/** El tipo de documento de una columna pedida para una colección o un subdocumento de `engine`. */
function docTypeFor(engine: 'mongodb' | 'firestore', spec: Pick<AiColumnSpec, 'docType' | 'type'>): string {
  const wanted = spec.docType?.trim();
  if (wanted) {
    const match = DOC_TYPES[engine].find(t => same(t, wanted));
    if (!match) reject(`El tipo «${wanted}» no es de ${engine === 'mongodb' ? 'MongoDB' : 'Firestore'}.`);
    return match!;
  }
  const fromSql = spec.type ? SQL_TO_DOC[spec.type.name]?.[engine] : undefined;
  return fromSql ?? 'string';
}

/** Tipo de atributo de Nodaria para un campo de documento; el tipo de la base va en `sql.docType`. */
function fieldTypeForDoc(docType: string): FieldType {
  if (['number', 'int', 'long', 'double', 'decimal'].includes(docType)) return 'number';
  if (docType === 'bool' || docType === 'boolean') return 'boolean';
  if (docType === 'date' || docType === 'timestamp') return 'date';
  if (docType === 'array') return 'list';
  return 'text';
}

function columnSql(
  spec: Pick<AiColumnSpec, 'primaryKey' | 'nullable' | 'unique' | 'identity'>,
  type: SqlDataType | null,
) {
  return {
    type,
    primaryKey: spec.primaryKey,
    nullable: spec.primaryKey ? false : spec.nullable,
    unique: spec.unique,
    identity: spec.identity,
    excluded: false,
  } satisfies SqlColumn;
}

/** Un campo nuevo de una colección o un subdocumento: sin tipo SQL, con el de su base. */
function docFieldFromSpec(spec: AiColumnSpec, engine: 'mongodb' | 'firestore', id: string): FieldDefinition {
  const name = checkName(spec.name, 'campo');
  const docType = docTypeFor(engine, spec);
  return {
    ...createField(),
    id,
    key: name,
    label: name,
    type: fieldTypeForDoc(docType),
    required: !spec.nullable,
    description: spec.description.trim(),
    sql: { ...columnSql({ ...spec, primaryKey: false, identity: false }, null), docType },
  };
}

function fieldFromSpec(spec: AiColumnSpec & { type: SqlDataType }, id: string): FieldDefinition {
  const name = checkName(spec.name, 'columna');
  const type = checkType(spec.type);
  return {
    ...createField(),
    id,
    key: name,
    label: name,
    type: fieldTypeFor(type),
    description: spec.description.trim(),
    sql: columnSql(spec, type),
  };
}

interface RunState {
  project: Project;
  /** Referencia de tabla → id del nodo (las del contexto y las creadas). */
  tables: Map<string, string>;
  /** Identificador corto de cada base → id del tipo. */
  bases: Map<string, string>;
  /** Identificador corto (o referencia nueva) de cada subdocumento → id del tipo. */
  subdocs: Map<string, string>;
  /** Referencias de tablas nuevas que no se crean (desmarcadas o no válidas). */
  missing: Set<string>;
  touchedTypes: Set<string>;
  newId: (prefix: string) => string;
}

/** Una tabla o una colección (un nodo). */
function tableNode(s: RunState, ref: string): Node {
  if (s.missing.has(ref)) reject(`Depende de crear la tabla «${ref}», que no se va a crear.`);
  const nodeId = s.tables.get(ref);
  const node = nodeId ? getNode(s.project, nodeId) : undefined;
  if (!nodeId)
    reject(s.subdocs.has(ref) ? `«${ref}» es un subdocumento, no una tabla.` : `No hay ninguna tabla «${ref}».`);
  if (!node || !isAiTable(s.project, node.typeId)) reject(`La tabla «${ref}» ya no existe.`);
  return node!;
}

/** Donde van las columnas: una tabla o colección (con su nodo) o un subdocumento (solo su tipo). */
interface Target {
  typeId: string;
  node: Node | null;
  label: string;
  engine: DbEngine | null;
}
function target(s: RunState, ref: string): Target {
  const subId = s.subdocs.get(ref);
  if (subId) {
    if (s.missing.has(ref)) reject(`Depende de crear el subdocumento «${ref}», que no se va a crear.`);
    const schema = getSchema(s.project, subId);
    if (!schema || !isEmbeddedType(s.project, subId)) reject(`El subdocumento «${ref}» ya no existe.`);
    return { typeId: subId, node: null, label: schema!.name, engine: engineOf(s.project, subId) };
  }
  const node = tableNode(s, ref);
  return { typeId: node.typeId, node, label: nodeLabel(s.project, node), engine: engineOf(s.project, node.typeId) };
}
const documentEngine = (t: Target) => (isDocumentEngine(t.engine) ? t.engine : null);

function findColumn(p: Project, t: Target | Node, name: string): TableColumn | undefined {
  const typeId = t.typeId;
  const label = 'label' in t ? t.label : nodeLabel(p, t);
  const matches = tableColumns(p, typeId).filter(c => same(c.field.key || c.field.label, name));
  if (matches.length > 1) reject(`Hay varias columnas «${name}» en «${label}».`);
  return matches[0];
}

function existingColumn(p: Project, t: Target, name: string): TableColumn {
  const column = findColumn(p, t, name);
  if (!column) reject(`«${t.label}» no tiene la columna «${name}».`);
  return column!;
}

/** Otras tablas que comparten el tipo (y por tanto sus columnas). */
function sharing(p: Project, node: Node | null) {
  if (!node) return [];
  const others = p.nodes.filter(n => n.id !== node.id && n.typeId === node.typeId).map(n => `«${nodeLabel(p, n)}»`);
  return others.length
    ? [`También cambia ${others.join(', ')}, que comparte${others.length > 1 ? 'n' : ''} su tipo.`]
    : [];
}

/** Tipos (además del de la tabla) que usan el atributo: su definición vale para todos. */
function otherUsers(p: Project, node: Node | null, field: FieldDefinition) {
  const users = p.nodes
    .filter(n => n.id !== node?.id && isAiTable(p, n.typeId) && allFields(p, n.typeId).some(f => f.id === field.id))
    .map(n => `«${nodeLabel(p, n)}»`);
  return users.length ? [`La columna se define fuera de la tabla: también cambia en ${users.join(', ')}.`] : [];
}

function addOwnField(p: Project, typeId: string, field: FieldDefinition): Project {
  return { ...p, schemas: p.schemas.map(s => (s.id === typeId ? { ...s, fields: [...s.fields, field] } : s)) };
}

/** Preforma de la biblioteca con ese nombre (clave o etiqueta), sin contar las de título. */
function findPreform(p: Project, name: string): FieldDefinition | undefined {
  const clean = name.trim();
  if (!clean) return undefined;
  return p.fieldLibrary.find(f => !f.isTitle && (same(f.key, clean) || same(f.label, clean)));
}

/** Atributos efectivos que tendría un tipo nuevo que herede de `parentId` (o ninguno). */
const inheritedFrom = (p: Project, parentId: string | null) => (parentId ? allFields(p, parentId) : []);

interface PlannedColumn {
  /** Lo que se añade a `Schema.fields`: una definición propia o el vínculo a una preforma. */
  entry: SchemaField;
  fieldId: string;
  /** Metadatos SQL que la tabla fija para una preforma (con `setColumnSql`), si difieren de los suyos. */
  sql: SqlColumn | null;
}

/**
 * Cómo entra una columna pedida en un tipo: vinculando la preforma que nombra (o la que se llama
 * igual), o como columna propia nueva. Si ya llega por herencia no entra (`null`) y se avisa.
 */
function planColumn(
  s: RunState,
  p: Project,
  spec: AiColumnSpec,
  inherited: FieldDefinition[],
  messages: string[],
  engine: 'mongodb' | 'firestore' | null = null,
): PlannedColumn | null {
  const name = checkName(spec.name, 'columna');
  const already = inherited.find(f => same(f.key || f.label, name) || (spec.preform && same(f.key, spec.preform)));
  if (already) {
    messages.push(`«${name}» ya llega por herencia: no se repite.`);
    return null;
  }
  const preform = findPreform(p, spec.preform || '') ?? findPreform(p, name);
  if (spec.preform && !findPreform(p, spec.preform))
    messages.push(`No hay ninguna preforma «${spec.preform}»: «${name}» se crea como columna propia.`);
  if (preform) {
    if (!spec.preform) messages.push(`«${name}» usa la preforma que ya tienes con ese nombre.`);
    const own = columnSql({ ...spec }, null);
    const theirs = preform.sql ?? null;
    const differs =
      !theirs ||
      theirs.primaryKey !== own.primaryKey ||
      theirs.nullable !== own.nullable ||
      theirs.unique !== own.unique ||
      theirs.identity !== own.identity;
    return {
      entry: { ref: preform.id },
      fieldId: preform.id,
      sql: differs ? { ...(theirs ?? columnSql(spec, null)), ...own, type: theirs?.type ?? null } : null,
    };
  }
  // En una colección o un subdocumento, un campo de su base.
  if (engine) {
    const field = docFieldFromSpec(spec, engine, s.newId('field'));
    return { entry: field, fieldId: field.id, sql: null };
  }
  if (!spec.type) {
    messages.push(`«${name}» no tiene tipo ni preforma: no se crea.`);
    return null;
  }
  const field = fieldFromSpec({ ...spec, type: spec.type }, s.newId('field'));
  return { entry: field, fieldId: field.id, sql: null };
}

/** Añade columnas planificadas a un tipo y fija los metadatos SQL propios de las preformas. */
function addPlanned(p: Project, typeId: string, planned: PlannedColumn[]): Project {
  let next: Project = {
    ...p,
    schemas: p.schemas.map(x => (x.id === typeId ? { ...x, fields: [...x.fields, ...planned.map(c => c.entry)] } : x)),
  };
  planned.forEach(c => {
    if (c.sql) next = setColumnSql(next, typeId, c.fieldId, c.sql);
  });
  return next;
}

/** Clave libre para un título propio: no puede chocar con una preforma ni con lo heredado. */
function titleKey(p: Project, inherited: FieldDefinition[]) {
  const taken = new Set([...p.fieldLibrary, ...inherited].map(f => f.key.toLowerCase()));
  let key = 'titulo';
  for (let i = 2; taken.has(key); i++) key = `titulo_${i}`;
  return key;
}

function setTableName(p: Project, node: Node, name: string): Project {
  const schema = getSchema(p, node.typeId)!;
  const fields = allFields(p, node.typeId);
  const title = fields.find(f => f.isTitle) ?? fields.find(f => f.type === 'text' && node.values[f.id]);
  const old = nodeLabel(p, node);
  let next = p;
  // Si la tabla toma el nombre de su tipo, o es la única de un tipo que se llama como ella, se renombra el tipo.
  const onlyOne = !p.nodes.some(n => n.id !== node.id && n.typeId === node.typeId);
  if (!title || (onlyOne && schema.name === old))
    next = { ...next, schemas: next.schemas.map(s => (s.id === schema.id ? { ...s, name } : s)) };
  if (title) next = updateNodeValue(next, node.id, title.id, name);
  return next;
}

function tableNameTaken(p: Project, name: string, except?: string) {
  return p.nodes.some(n => n.id !== except && isAiTable(p, n.typeId) && same(nodeLabel(p, n), name));
}
const subdocNameTaken = (p: Project, name: string) =>
  p.schemas.some(x => isEmbeddedType(p, x.id) && same(x.name, name));

/** Aplica una operación sobre el estado; lanza `Rejected` si no es válida. Devuelve los avisos. */
function step(s: RunState, op: AiOperation, apply: boolean): string[] {
  const p = s.project;
  const commit = (next: Project, typeId?: string) => {
    if (!apply) return;
    s.project = next;
    if (typeId) s.touchedTypes.add(typeId);
  };

  switch (op.op) {
    case 'create-table': {
      const ref = op.ref.trim();
      if (!ref) reject('Falta la referencia de la tabla nueva.');
      if (s.tables.has(ref) || s.missing.has(ref) || s.bases.has(ref) || s.subdocs.has(ref))
        reject(`La referencia «${ref}» ya está en uso.`);
      const engine = op.engine === 'mongodb' || op.engine === 'firestore' ? op.engine : null;
      const embedded = Boolean(op.embedded);
      if (embedded && !engine)
        reject('Un subdocumento es de una base de documentos: le falta «mongodb» o «firestore».');
      const what = embedded ? 'subdocumento' : engine ? 'colección' : 'tabla';
      const name = checkName(op.name, what);
      if (embedded ? subdocNameTaken(p, name) : tableNameTaken(p, name))
        reject(`Ya hay un${what === 'tabla' || what === 'colección' ? 'a' : ''} ${what} «${name}».`);
      if (op.columns.length > AI_MAX_COLUMNS) reject(`Una tabla nueva admite hasta ${AI_MAX_COLUMNS} columnas.`);
      let parentId: string | null = null;
      if (op.base?.trim() && !embedded) {
        parentId = s.bases.get(op.base.trim()) ?? null;
        const parent = parentId ? getSchema(p, parentId) : undefined;
        if (!parent || parent.kind !== 'entity') reject(`No hay ninguna base «${op.base}».`);
      }
      const inherited = inheritedFrom(p, parentId);
      const messages: string[] = [];
      const planned: PlannedColumn[] = [];
      op.columns.forEach(spec => {
        const column = planColumn(s, p, spec, [...inherited], messages, engine);
        if (!column) return;
        const key = isFieldLink(column.entry) ? spec.name : column.entry.key;
        if (planned.some(o => o.fieldId === column.fieldId) || op.columns.filter(c => same(c.name, key)).length > 1)
          reject(`La columna «${key}» está repetida.`);
        planned.push(column);
      });
      const typeId = s.newId('type');
      // Un subdocumento no tiene nodo ni título: va dentro de su colección.
      const titlePreform = embedded ? undefined : p.fieldLibrary.find(f => f.isTitle);
      const ownTitle: FieldDefinition | null =
        embedded || inherited.some(f => f.isTitle) || titlePreform
          ? null
          : { ...createField(), id: s.newId('field'), key: titleKey(p, inherited), label: 'Título', isTitle: true };
      const titleEntries: SchemaField[] =
        embedded || inherited.some(f => f.isTitle) ? [] : titlePreform ? [{ ref: titlePreform.id }] : [ownTitle!];
      const inheritsEngine = parentId ? engineOf(p, parentId) : null;
      const schema = {
        ...createSchema(name, 'entity'),
        id: typeId,
        parentTypeId: parentId,
        // Color fijo por orden de creación: con la misma semilla, la vista previa y lo aplicado coinciden.
        color: parentId ? (getSchema(p, parentId)?.color ?? COLORS[0]) : COLORS[s.tables.size % COLORS.length],
        table: engine ? true : !parentId || !isTableType(p, parentId),
        // La base de la colección: la del tipo base si ya es esa, o la suya.
        dbEngine: engine && inheritsEngine !== engine ? engine : null,
        embedded,
        icon: parentId ? (getSchema(p, parentId)?.icon ?? 'table-2') : engine ? 'phosphor-database' : 'table-2',
        description: op.description.trim(),
        fields: titleEntries,
      };
      if (!apply) return messages;
      let next = hideNewTypesInGenealogy({ ...p, schemas: [...p.schemas, schema] }, [typeId]);
      next = addPlanned(next, typeId, planned);
      if (embedded) {
        s.subdocs.set(ref, typeId);
        commit(next, typeId);
        return messages;
      }
      const added = addNode(next, typeId, null, s.newId('node'));
      const title = allFields(added.project, typeId).find(f => f.isTitle);
      next = title ? updateNodeValue(added.project, added.nodeId, title.id, name) : added.project;
      s.tables.set(ref, added.nodeId);
      commit(next, typeId);
      return messages;
    }

    case 'rename-table': {
      const t = target(s, op.table);
      if (!t.node) {
        const name = checkName(op.name, 'subdocumento');
        if (subdocNameTaken(p, name)) reject(`Ya hay un subdocumento «${name}».`);
        commit({ ...p, schemas: p.schemas.map(x => (x.id === t.typeId ? { ...x, name } : x)) }, t.typeId);
        return [];
      }
      const name = checkName(op.name, 'tabla');
      if (tableNameTaken(p, name, t.node.id)) reject(`Ya hay una tabla «${name}».`);
      commit(setTableName(p, t.node, name), t.typeId);
      return [];
    }

    case 'delete-table': {
      const t = target(s, op.table);
      if (!t.node) {
        // Un subdocumento: se va su tipo, y con él los campos que lo llevaban dentro.
        const users = p.schemas.filter(x =>
          x.fields.some(f => !isFieldLink(f) && f.referenceTypeIds.includes(t.typeId)),
        );
        commit(deleteSchema(p, t.typeId, 'lift'));
        return users.length ? [`Deja de ir dentro de ${users.map(u => `«${u.name}»`).join(', ')}.`] : [];
      }
      const node = t.node;
      const pointing = foreignKeyLinks(p)
        .filter(l => l.targetId === node.id && l.sourceId !== node.id)
        .map(l => `«${nodeLabel(p, getNode(p, l.sourceId)!)}»`);
      const messages = pointing.length ? [`Dejan de apuntarle ${[...new Set(pointing)].join(', ')}.`] : [];
      let next = deleteNodes(p, [node.id]);
      const typeEmpty =
        !next.nodes.some(n => n.typeId === node.typeId) && !next.schemas.some(x => x.parentTypeId === node.typeId);
      if (typeEmpty) next = deleteSchema(next, node.typeId, 'lift');
      commit(next);
      return messages;
    }

    case 'add-column': {
      const t = target(s, op.table);
      const name = checkName(op.column.name, 'columna');
      if (findColumn(p, t, name)) reject(`«${t.label}» ya tiene la columna «${name}».`);
      const messages: string[] = [];
      const column = planColumn(s, p, op.column, allFields(p, t.typeId), messages, documentEngine(t));
      if (!column) reject(`«${t.label}» ya tiene la columna «${name}».`);
      if (allFields(p, t.typeId).some(f => f.id === column!.fieldId)) reject(`«${t.label}» ya tiene esa preforma.`);
      commit(addPlanned(p, t.typeId, [column!]), t.typeId);
      return [...messages, ...sharing(p, t.node)];
    }

    case 'update-column': {
      const t = target(s, op.table);
      const column = existingColumn(p, t, op.column);
      const c = op.changes;
      const current = columnSqlIn(p, t.typeId, column.field);
      const engine = documentEngine(t);
      const sql: SqlColumn = {
        ...current,
        // En una colección cambia el tipo de su base; en una tabla, el de SQL Server.
        type: engine ? current.type : c.type ? checkType(c.type) : current.type,
        ...(engine && (c.docType || c.type)
          ? { docType: docTypeFor(engine, { docType: c.docType, type: c.type }) }
          : {}),
        primaryKey: c.primaryKey ?? current.primaryKey,
        nullable: c.nullable ?? current.nullable,
        unique: c.unique ?? current.unique,
        identity: c.identity ?? current.identity,
      };
      const messages = column.origin.kind === 'own' ? [...sharing(p, t.node)] : [];
      if (column.origin.kind !== 'own')
        messages.push('Es heredada o una preforma: el cambio solo vale para este tipo y sus subtipos.');
      let next = p;
      if (c.description !== null && c.description.trim() !== column.field.description) {
        if (column.origin.kind === 'own')
          next = replaceField(next, { ...column.field, description: c.description.trim() });
        else messages.push('La descripción de una columna heredada o preforma no se cambia desde aquí.');
      }
      next = setColumnSql(next, t.typeId, column.field.id, sql);
      commit(next, t.typeId);
      return messages;
    }

    case 'rename-column': {
      const t = target(s, op.table);
      const column = existingColumn(p, t, op.column);
      const name = checkName(op.name, 'columna');
      const clash = findColumn(p, t, name);
      if (clash && clash.field.id !== column.field.id) reject(`«${t.label}» ya tiene la columna «${name}».`);
      commit(replaceField(p, { ...column.field, key: name, label: name }), t.typeId);
      return [...otherUsers(p, t.node, column.field), ...(column.origin.kind === 'own' ? sharing(p, t.node) : [])];
    }

    case 'delete-column': {
      const t = target(s, op.table);
      const column = existingColumn(p, t, op.column);
      const schema = getSchema(p, t.typeId)!;
      let next: Project;
      const messages = column.origin.kind === 'own' ? sharing(p, t.node) : [];
      if (column.origin.kind === 'own') next = deleteField(p, schema.id, column.field.id);
      else if (schema.fields.some(f => isFieldLink(f) && f.ref === column.field.id))
        next = {
          ...p,
          schemas: p.schemas.map(x =>
            x.id === schema.id
              ? { ...x, fields: x.fields.filter(f => !isFieldLink(f) || f.ref !== column.field.id) }
              : x,
          ),
        };
      else {
        next = {
          ...p,
          schemas: p.schemas.map(x =>
            x.id === schema.id ? { ...x, hiddenFieldIds: [...x.hiddenFieldIds, column.field.id] } : x,
          ),
        };
        messages.push('Es heredada: se oculta en este tipo y sus subtipos, sin tocar el tipo del que viene.');
      }
      commit(next, t.typeId);
      return messages;
    }

    case 'add-foreign-key': {
      // Desde una tabla, una colección o un subdocumento, hacia una tabla o una colección (por su id).
      const t = target(s, op.table);
      const destination = tableNode(s, op.references);
      const name = checkName(op.column, 'columna');
      const existing = findColumn(p, t, name);
      const messages: string[] = [];
      let next = p;
      let fieldId: string;
      if (existing && existing.field.type === 'nodeRef') {
        fieldId = existing.field.id;
        if (!existing.field.referenceTypeIds.includes(destination.typeId) && existing.field.referenceTypeIds.length) {
          next = replaceField(next, {
            ...existing.field,
            referenceTypeIds: [...existing.field.referenceTypeIds, destination.typeId],
          });
          messages.push(...otherUsers(p, t.node, existing.field));
        }
      } else if (existing) {
        // Una columna propia que aún no es referencia (a menudo creada por la propia propuesta) se
        // convierte en la clave foránea; su tipo pasa a ser el de la clave a la que apunta.
        if (existing.origin.kind !== 'own')
          reject(`«${name}» llega por herencia o es una preforma y no es una referencia a otra tabla.`);
        fieldId = existing.field.id;
        const current = columnSqlIn(p, t.typeId, existing.field);
        next = replaceField(next, {
          ...existing.field,
          type: 'nodeRef',
          referenceTypeIds: [destination.typeId],
          sql: { ...current, type: null, docType: undefined },
        });
        messages.push(`«${name}» pasa a ser una referencia a «${nodeLabel(p, destination)}», con el tipo de su clave.`);
      } else {
        const preform = findPreform(p, name);
        if (preform && preform.type === 'nodeRef') {
          fieldId = preform.id;
          next = addPlanned(next, t.typeId, [{ entry: { ref: preform.id }, fieldId, sql: null }]);
          messages.push(`Usa la preforma «${preform.key}».`);
        } else {
          const field: FieldDefinition = {
            ...createField(),
            id: s.newId('field'),
            key: name,
            label: name,
            type: 'nodeRef',
            referenceTypeIds: [destination.typeId],
            sql: columnSql({ primaryKey: false, nullable: op.nullable, unique: false, identity: false }, null),
          };
          fieldId = field.id;
          next = addOwnField(next, t.typeId, field);
        }
        if (t.node && p.nodes.some(n => n.id !== t.node!.id && n.typeId === t.typeId))
          messages.push('Las demás tablas de su tipo reciben la columna vacía.');
      }
      const field = allFields(next, t.typeId).find(f => f.id === fieldId)!;
      const sql = columnSqlIn(next, t.typeId, field);
      const primaryKey = documentEngine(t) ? false : (op.primaryKey ?? sql.primaryKey);
      const nullable = primaryKey ? false : op.nullable;
      if (sql.primaryKey !== primaryKey || sql.nullable !== nullable)
        next = setColumnSql(next, t.typeId, fieldId, { ...sql, primaryKey, nullable });
      if (t.node) next = updateNodeValue(next, t.node.id, fieldId, destination.id);
      // En SQL, la clave foránea apunta a una clave primaria; en documentos, al id del documento.
      if (isTableType(next, destination.typeId) && !documentEngine(t)) {
        const keys = tableColumns(next, destination.typeId).filter(k => k.sql.primaryKey);
        if (keys.length !== 1)
          messages.push(
            `«${nodeLabel(p, destination)}» no tiene una clave primaria de una sola columna a la que apuntar.`,
          );
      }
      commit(next, t.typeId);
      return messages;
    }

    case 'embed': {
      const t = target(s, op.table);
      if (!documentEngine(t))
        reject(`«${t.label}» no es una colección: solo una colección lleva subdocumentos dentro.`);
      const ref = op.references.trim();
      if (s.missing.has(ref)) reject(`Depende de crear el subdocumento «${op.references}», que no se va a crear.`);
      const subId = s.subdocs.get(ref);
      if (!subId) reject(`No hay ningún subdocumento «${op.references}».`);
      if (subId === t.typeId) reject('Un subdocumento no puede ir dentro de sí mismo.');
      const sub = getSchema(p, subId!);
      if (!sub) reject(`El subdocumento «${op.references}» ya no existe.`);
      const name = checkName(op.column, 'campo');
      if (findColumn(p, t, name)) reject(`«${t.label}» ya tiene el campo «${name}».`);
      const field: FieldDefinition = {
        ...createField(),
        id: s.newId('field'),
        key: name,
        label: name,
        type: op.many ? 'nodeRefs' : 'nodeRef',
        referenceTypeIds: [subId!],
        required: !op.nullable,
        sql: columnSql({ primaryKey: false, nullable: op.nullable, unique: false, identity: false }, null),
      };
      const messages =
        engineOf(p, subId!) !== t.engine ? [`«${sub!.name}» es de otra base: guardará su id como texto.`] : [];
      commit(addOwnField(p, t.typeId, field), t.typeId);
      return messages;
    }
  }
}

function tableRefName(s: RunState, ref: string, created: Map<string, string>) {
  const subId = s.subdocs.get(ref);
  if (subId) return getSchema(s.project, subId)?.name ?? created.get(ref) ?? ref;
  const nodeId = s.tables.get(ref);
  const node = nodeId ? getNode(s.project, nodeId) : undefined;
  return node ? nodeLabel(s.project, node) : (created.get(ref) ?? ref);
}

function describe(s: RunState, op: AiOperation, created: Map<string, string>): string {
  const t = (ref: string) => tableRefName(s, ref, created);
  switch (op.op) {
    case 'create-table': {
      const base = op.base?.trim() ? getSchema(s.project, s.bases.get(op.base.trim()) ?? '')?.name : undefined;
      const engine = op.engine === 'mongodb' ? 'MongoDB' : op.engine === 'firestore' ? 'Firestore' : null;
      const what = op.embedded ? 'el subdocumento' : engine ? 'la colección' : 'la tabla';
      const unit = engine ? ['campo', 'campos'] : ['columna', 'columnas'];
      const columns = `${op.columns.length} ${op.columns.length === 1 ? unit[0] : unit[1]}`;
      return `Crear ${what} ${op.name} (${engine && !op.embedded ? `${engine}, ` : ''}${base ? `hereda de ${base}, ` : ''}${columns})`;
    }
    case 'rename-table':
      return `Renombrar ${t(op.table)} a ${op.name}`;
    case 'delete-table':
      return `Quitar ${t(op.table)}`;
    case 'add-column': {
      const type = op.column.docType?.trim()
        ? op.column.docType.trim()
        : op.column.type?.name
          ? sqlTypeText(
              sqlType(
                op.column.type.name,
                op.column.type.length,
                op.column.type.precision ?? undefined,
                op.column.type.scale ?? undefined,
              ),
            )
          : '?';
      return `Añadir a ${t(op.table)} la columna ${op.column.name} (${type})`;
    }
    case 'update-column':
      return `Cambiar ${t(op.table)}.${op.column}`;
    case 'rename-column':
      return `Renombrar ${t(op.table)}.${op.column} a ${op.name}`;
    case 'delete-column':
      return `Quitar la columna ${t(op.table)}.${op.column}`;
    case 'add-foreign-key':
      return `Clave foránea ${t(op.table)}.${op.column} → ${t(op.references)}`;
    case 'embed':
      return `Llevar ${t(op.references)} dentro de ${t(op.table)}, en ${op.column} (${op.many ? 'una lista' : 'un objeto'})`;
  }
}

/**
 * Revisa una propuesta contra el proyecto y aplica, en orden, las operaciones marcadas que sean
 * válidas: cada una ve el resultado de las anteriores. Las no marcadas se comprueban sin aplicarse.
 * El proyecto devuelto es lo que quedaría al aceptar; con la misma semilla, lo que aplica el reducer.
 */
export function reviewProposal(
  p: Project,
  proposal: AiProposal,
  refs: AiContextRefs,
  selected: readonly number[] = defaultSelection(proposal),
  seed = '0',
  /** Operaciones ya aplicadas antes: al retomar la propuesta se saltan (ver `resumeRefs`). */
  skip: readonly number[] = [],
): AiProposalReview {
  const s: RunState = {
    project: p,
    tables: new Map(Object.entries(refs.tables)),
    bases: new Map(Object.entries(refs.bases ?? {})),
    subdocs: new Map(Object.entries(refs.subdocuments ?? {})),
    missing: new Set(),
    touchedTypes: new Set(),
    newId: seededIds(seed),
  };
  const marked = new Set(selected);
  const skipped = new Set(skip);
  const created = new Map<string, string>();
  const operations = proposal.operations.map((operation, index): AiOperationReview => {
    const title = describe(s, operation, created);
    const base = { index, operation, title, destructive: isDestructive(operation), selected: marked.has(index) };
    if (index >= AI_MAX_OPERATIONS) {
      return {
        ...base,
        status: 'invalid',
        messages: [`Solo se admiten ${AI_MAX_OPERATIONS} operaciones.`],
        applied: false,
      };
    }
    const apply = base.selected;
    // Las operaciones siguientes nombran la tabla nueva por su nombre, aunque no llegue a crearse.
    if (operation.op === 'create-table' && operation.ref.trim() && !created.has(operation.ref.trim()))
      created.set(operation.ref.trim(), operation.name.trim());
    if (skipped.has(index)) {
      // Una tabla creada antes que ya no está deja sin destino a lo que dependa de ella.
      if (operation.op === 'create-table' && !s.tables.has(operation.ref.trim())) s.missing.add(operation.ref.trim());
      return { ...base, selected: false, status: 'ok', messages: [], applied: false, done: true };
    }
    try {
      const messages = step(s, operation, apply);
      if (operation.op === 'create-table' && !apply) s.missing.add(operation.ref.trim());
      return { ...base, status: messages.length ? 'warning' : 'ok', messages, applied: apply };
    } catch (error) {
      if (!(error instanceof Rejected)) throw error;
      if (operation.op === 'create-table' && operation.ref.trim() && !s.tables.has(operation.ref.trim()))
        s.missing.add(operation.ref.trim());
      return { ...base, status: 'invalid', messages: [error.message], applied: false };
    }
  });

  const issues = [...s.touchedTypes].flatMap(typeId => {
    const schema = getSchema(s.project, typeId);
    // Los avisos de las tablas son de SQL: las colecciones tienen los suyos en Salud.
    if (!schema || !isTableType(s.project, typeId)) return [];
    return tableIssues(s.project, typeId).map(issue => `${schema.name}: ${issue.message}`);
  });
  return { project: s.project, operations, issues };
}

/** Lo que aplica el reducer: el proyecto con las operaciones marcadas y válidas. */
export function applyProposal(
  p: Project,
  proposal: AiProposal,
  refs: AiContextRefs,
  selected: readonly number[],
  seed: string,
  skip: readonly number[] = [],
): Project {
  return reviewProposal(p, proposal, refs, selected, seed, skip).project;
}

/**
 * Referencias para retomar una propuesta ya aplicada en parte: las del contexto más las tablas que
 * creó, buscadas por su nombre en el proyecto actual (sus ids no se guardan). Así las operaciones que
 * quedaron sin aplicar (por ejemplo, claves foráneas hacia esas tablas) se pueden aplicar después.
 */
export function resumeRefs(
  p: Project,
  proposal: AiProposal,
  refs: AiContextRefs,
  applied: readonly number[],
): AiContextRefs {
  const tables = { ...refs.tables };
  const subdocuments = { ...(refs.subdocuments ?? {}) };
  for (const index of applied) {
    const op = proposal.operations[index];
    if (op?.op !== 'create-table' || !op.ref.trim() || tables[op.ref.trim()] || subdocuments[op.ref.trim()]) continue;
    if (op.embedded) {
      const schema = p.schemas.find(x => isEmbeddedType(p, x.id) && same(x.name, op.name));
      if (schema) subdocuments[op.ref.trim()] = schema.id;
      continue;
    }
    const node = p.nodes.find(n => isAiTable(p, n.typeId) && same(nodeLabel(p, n), op.name));
    if (node) tables[op.ref.trim()] = node.id;
  }
  return { ...refs, tables, subdocuments };
}
