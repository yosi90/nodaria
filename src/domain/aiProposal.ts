import type { AiContextRefs } from './aiContext';
import {
  columnSqlIn,
  foreignKeyLinks,
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
  type SqlTypeName,
  type TableColumn,
} from './database';
import { COLORS } from './constants';
import { createField, createSchema } from './factories';
import { isFieldLink } from './library';
import { addNode, deleteField, deleteNodes, deleteSchema, updateNodeValue } from './operations';
import { allFields, getNode, getSchema, nodeLabel } from './selectors';
import { hideNewTypesInGenealogy } from './layoutFilters';
import type { FieldDefinition, FieldType, Node, Project } from './types';

/*
 * Propuestas de la asistencia de IA para un esquema de base de datos. La respuesta del modelo es
 * entrada no fiable: cada operación se resuelve contra el proyecto actual y se comprueba con las
 * mismas reglas que el editor manual antes de enseñarla, y solo se aplican las que la persona marca.
 *
 * Las tablas se nombran por el identificador corto del contexto (`t1`…; ver `aiContext.ts`) o por la
 * referencia que una operación «crear tabla» de la misma propuesta da a la suya. Las columnas, por
 * su nombre dentro de la tabla. La API valida la forma; aquí se valida el significado.
 */

export interface AiColumnSpec {
  name: string;
  type: SqlDataType;
  primaryKey: boolean;
  nullable: boolean;
  unique: boolean;
  identity: boolean;
  description: string;
}

/** Cambios de una columna: `null` deja ese aspecto como está. */
export interface AiColumnChanges {
  type: SqlDataType | null;
  primaryKey: boolean | null;
  nullable: boolean | null;
  unique: boolean | null;
  identity: boolean | null;
  description: string | null;
}

export type AiOperation =
  | { op: 'create-table'; ref: string; name: string; description: string; columns: AiColumnSpec[]; reason: string }
  | { op: 'rename-table'; table: string; name: string; reason: string }
  | { op: 'delete-table'; table: string; reason: string }
  | { op: 'add-column'; table: string; column: AiColumnSpec; reason: string }
  | { op: 'update-column'; table: string; column: string; changes: AiColumnChanges; reason: string }
  | { op: 'rename-column'; table: string; column: string; name: string; reason: string }
  | { op: 'delete-column'; table: string; column: string; reason: string }
  | { op: 'add-foreign-key'; table: string; column: string; references: string; nullable: boolean; reason: string };

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
  if (!raw || !SQL_TYPES.includes(raw.name as SqlTypeName)) reject(`El tipo «${raw?.name}» no es de SQL Server.`);
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

function fieldFromSpec(spec: AiColumnSpec, id: string): FieldDefinition {
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
  /** Referencias de tablas nuevas que no se crean (desmarcadas o no válidas). */
  missing: Set<string>;
  touchedTypes: Set<string>;
  newId: (prefix: string) => string;
}

function tableNode(s: RunState, ref: string): Node {
  if (s.missing.has(ref)) reject(`Depende de crear la tabla «${ref}», que no se va a crear.`);
  const nodeId = s.tables.get(ref);
  const node = nodeId ? getNode(s.project, nodeId) : undefined;
  if (!nodeId) reject(`No hay ninguna tabla «${ref}».`);
  if (!node || !isTableType(s.project, node.typeId)) reject(`La tabla «${ref}» ya no existe.`);
  return node!;
}

function findColumn(p: Project, node: Node, name: string): TableColumn | undefined {
  const matches = tableColumns(p, node.typeId).filter(c => same(c.field.key || c.field.label, name));
  if (matches.length > 1) reject(`Hay varias columnas «${name}» en «${nodeLabel(p, node)}».`);
  return matches[0];
}

function existingColumn(p: Project, node: Node, name: string): TableColumn {
  const column = findColumn(p, node, name);
  if (!column) reject(`«${nodeLabel(p, node)}» no tiene la columna «${name}».`);
  return column!;
}

/** Otras tablas que comparten el tipo (y por tanto sus columnas). */
function sharing(p: Project, node: Node) {
  const others = p.nodes.filter(n => n.id !== node.id && n.typeId === node.typeId).map(n => `«${nodeLabel(p, n)}»`);
  return others.length
    ? [`También cambia ${others.join(', ')}, que comparte${others.length > 1 ? 'n' : ''} su tipo.`]
    : [];
}

/** Tipos (además del de la tabla) que usan el atributo: su definición vale para todos. */
function otherUsers(p: Project, node: Node, field: FieldDefinition) {
  const users = p.nodes
    .filter(n => n.id !== node.id && isTableType(p, n.typeId) && allFields(p, n.typeId).some(f => f.id === field.id))
    .map(n => `«${nodeLabel(p, n)}»`);
  return users.length ? [`La columna se define fuera de la tabla: también cambia en ${users.join(', ')}.`] : [];
}

function addOwnField(p: Project, typeId: string, field: FieldDefinition): Project {
  return { ...p, schemas: p.schemas.map(s => (s.id === typeId ? { ...s, fields: [...s.fields, field] } : s)) };
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
  return p.nodes.some(n => n.id !== except && isTableType(p, n.typeId) && same(nodeLabel(p, n), name));
}

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
      if (s.tables.has(ref) || s.missing.has(ref)) reject(`La referencia «${ref}» ya está en uso.`);
      const name = checkName(op.name, 'tabla');
      if (tableNameTaken(p, name)) reject(`Ya hay una tabla «${name}».`);
      if (op.columns.length > AI_MAX_COLUMNS) reject(`Una tabla nueva admite hasta ${AI_MAX_COLUMNS} columnas.`);
      const columns = op.columns.map(c => fieldFromSpec(c, s.newId('field')));
      columns.forEach((c, i) => {
        if (columns.some((o, j) => j < i && same(o.key, c.key))) reject(`La columna «${c.key}» está repetida.`);
      });
      const typeId = s.newId('type');
      const title: FieldDefinition = {
        ...createField(),
        id: s.newId('field'),
        key: 'nombre',
        label: 'Nombre',
        isTitle: true,
      };
      const schema = {
        ...createSchema(name, 'entity'),
        id: typeId,
        // Color fijo por orden de creación: con la misma semilla, la vista previa y lo aplicado coinciden.
        color: COLORS[s.tables.size % COLORS.length],
        table: true,
        icon: 'table-2',
        description: op.description.trim(),
        fields: [title, ...columns],
      };
      if (!apply) return [];
      let next = hideNewTypesInGenealogy({ ...p, schemas: [...p.schemas, schema] }, [typeId]);
      const added = addNode(next, typeId, null, s.newId('node'));
      next = updateNodeValue(added.project, added.nodeId, title.id, name);
      s.tables.set(ref, added.nodeId);
      commit(next, typeId);
      return [];
    }

    case 'rename-table': {
      const node = tableNode(s, op.table);
      const name = checkName(op.name, 'tabla');
      if (tableNameTaken(p, name, node.id)) reject(`Ya hay una tabla «${name}».`);
      commit(setTableName(p, node, name), node.typeId);
      return [];
    }

    case 'delete-table': {
      const node = tableNode(s, op.table);
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
      const node = tableNode(s, op.table);
      const field = fieldFromSpec(op.column, s.newId('field'));
      if (findColumn(p, node, field.key)) reject(`«${nodeLabel(p, node)}» ya tiene la columna «${field.key}».`);
      commit(addOwnField(p, node.typeId, field), node.typeId);
      return sharing(p, node);
    }

    case 'update-column': {
      const node = tableNode(s, op.table);
      const column = existingColumn(p, node, op.column);
      const c = op.changes;
      const current = columnSqlIn(p, node.typeId, column.field);
      const sql: SqlColumn = {
        ...current,
        type: c.type ? checkType(c.type) : current.type,
        primaryKey: c.primaryKey ?? current.primaryKey,
        nullable: c.nullable ?? current.nullable,
        unique: c.unique ?? current.unique,
        identity: c.identity ?? current.identity,
      };
      const messages = column.origin.kind === 'own' ? [...sharing(p, node)] : [];
      if (column.origin.kind !== 'own')
        messages.push('Es heredada o una preforma: el cambio solo vale para este tipo y sus subtipos.');
      let next = p;
      if (c.description !== null && c.description.trim() !== column.field.description) {
        if (column.origin.kind === 'own')
          next = replaceField(next, { ...column.field, description: c.description.trim() });
        else messages.push('La descripción de una columna heredada o preforma no se cambia desde aquí.');
      }
      next = setColumnSql(next, node.typeId, column.field.id, sql);
      commit(next, node.typeId);
      return messages;
    }

    case 'rename-column': {
      const node = tableNode(s, op.table);
      const column = existingColumn(p, node, op.column);
      const name = checkName(op.name, 'columna');
      const clash = findColumn(p, node, name);
      if (clash && clash.field.id !== column.field.id) reject(`«${nodeLabel(p, node)}» ya tiene la columna «${name}».`);
      commit(replaceField(p, { ...column.field, key: name, label: name }), node.typeId);
      return [...otherUsers(p, node, column.field), ...(column.origin.kind === 'own' ? sharing(p, node) : [])];
    }

    case 'delete-column': {
      const node = tableNode(s, op.table);
      const column = existingColumn(p, node, op.column);
      const schema = getSchema(p, node.typeId)!;
      let next: Project;
      const messages = column.origin.kind === 'own' ? sharing(p, node) : [];
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
      commit(next, node.typeId);
      return messages;
    }

    case 'add-foreign-key': {
      const node = tableNode(s, op.table);
      const target = tableNode(s, op.references);
      const name = checkName(op.column, 'columna');
      const existing = findColumn(p, node, name);
      const messages: string[] = [];
      let next = p;
      let fieldId: string;
      if (existing) {
        if (existing.field.type !== 'nodeRef') reject(`«${name}» ya existe y no es una referencia a otra tabla.`);
        fieldId = existing.field.id;
        if (!existing.field.referenceTypeIds.includes(target.typeId) && existing.field.referenceTypeIds.length) {
          next = replaceField(next, {
            ...existing.field,
            referenceTypeIds: [...existing.field.referenceTypeIds, target.typeId],
          });
          messages.push(...otherUsers(p, node, existing.field));
        }
        const sql = columnSqlIn(next, node.typeId, existing.field);
        if (sql.nullable !== op.nullable && !sql.primaryKey)
          next = setColumnSql(next, node.typeId, fieldId, { ...sql, nullable: op.nullable });
      } else {
        const field: FieldDefinition = {
          ...createField(),
          id: s.newId('field'),
          key: name,
          label: name,
          type: 'nodeRef',
          referenceTypeIds: [target.typeId],
          sql: columnSql({ primaryKey: false, nullable: op.nullable, unique: false, identity: false }, null),
        };
        fieldId = field.id;
        next = addOwnField(next, node.typeId, field);
        if (p.nodes.some(n => n.id !== node.id && n.typeId === node.typeId))
          messages.push('Las demás tablas de su tipo reciben la columna vacía.');
      }
      next = updateNodeValue(next, node.id, fieldId, target.id);
      const keys = tableColumns(next, target.typeId).filter(k => k.sql.primaryKey);
      if (keys.length !== 1)
        messages.push(`«${nodeLabel(p, target)}» no tiene una clave primaria de una sola columna a la que apuntar.`);
      commit(next, node.typeId);
      return messages;
    }
  }
}

function tableRefName(s: RunState, ref: string, created: Map<string, string>) {
  const nodeId = s.tables.get(ref);
  const node = nodeId ? getNode(s.project, nodeId) : undefined;
  return node ? nodeLabel(s.project, node) : (created.get(ref) ?? ref);
}

function describe(s: RunState, op: AiOperation, created: Map<string, string>): string {
  const t = (ref: string) => tableRefName(s, ref, created);
  switch (op.op) {
    case 'create-table':
      return `Crear la tabla ${op.name} (${op.columns.length} ${op.columns.length === 1 ? 'columna' : 'columnas'})`;
    case 'rename-table':
      return `Renombrar la tabla ${t(op.table)} a ${op.name}`;
    case 'delete-table':
      return `Quitar la tabla ${t(op.table)}`;
    case 'add-column':
      return `Añadir a ${t(op.table)} la columna ${op.column.name} (${op.column.type?.name ? sqlTypeText(sqlType(op.column.type.name, op.column.type.length, op.column.type.precision ?? undefined, op.column.type.scale ?? undefined)) : '?'})`;
    case 'update-column':
      return `Cambiar ${t(op.table)}.${op.column}`;
    case 'rename-column':
      return `Renombrar ${t(op.table)}.${op.column} a ${op.name}`;
    case 'delete-column':
      return `Quitar la columna ${t(op.table)}.${op.column}`;
    case 'add-foreign-key':
      return `Clave foránea ${t(op.table)}.${op.column} → ${t(op.references)}`;
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
): AiProposalReview {
  const s: RunState = {
    project: p,
    tables: new Map(Object.entries(refs.tables)),
    missing: new Set(),
    touchedTypes: new Set(),
    newId: seededIds(seed),
  };
  const marked = new Set(selected);
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
    try {
      const messages = step(s, operation, apply);
      if (operation.op === 'create-table') {
        created.set(operation.ref.trim(), operation.name.trim());
        if (!apply) s.missing.add(operation.ref.trim());
      }
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
    if (!schema) return [];
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
): Project {
  return reviewProposal(p, proposal, refs, selected, seed).project;
}
