import { createField, createSchema, now, uid } from './factories';
import {
  allFields,
  canChangeSchemaKind,
  canSetParent,
  descendants,
  getSchema,
  inheritanceCandidates,
} from './selectors';
import { isFieldLink, ownFields } from './library';
import { FIELD_LENS, fieldOfLens, structureEndpoints } from './structure';
import type {
  FieldDefinition,
  FieldValue,
  Node,
  OrphanStrategy,
  Position,
  Project,
  ProjectView,
  Relation,
  Schema,
  SchemaKind,
} from './types';

/*
 * Operaciones puras sobre un proyecto. Nunca mutan la entrada: devuelven un proyecto nuevo
 * (o el mismo si no hay cambios), de modo que el historial de deshacer puede compartir estructura.
 */

const TYPE_LIST_KEYS = ['allowedChildTypeIds', 'sourceTypeIds', 'targetTypeIds'] as const;

/** Convierte el valor inicial (editado como texto) al tipo del campo. */
export function typedDefault(field: FieldDefinition): FieldValue | undefined {
  const raw = field.defaultValue;
  if (field.type === 'computed' || raw === '' || raw === null || raw === undefined) return undefined;
  if (field.type === 'number') {
    const value = Number(raw);
    return Number.isFinite(value) ? value : undefined;
  }
  if (field.type === 'boolean')
    return typeof raw === 'boolean' ? raw : ['true', 'sí', 'si', '1'].includes(String(raw).trim().toLowerCase());
  if (field.type === 'nodeRefs') return Array.isArray(raw) ? raw : undefined;
  if (field.type === 'nodeRef') return undefined;
  return raw;
}

export function addSchema(p: Project, name: string, kind: SchemaKind, id?: string): Project {
  const schema = createSchema(name, kind);
  return { ...p, schemas: [...p.schemas, id ? { ...schema, id } : schema] };
}

/** Aplica cambios a un tipo, ignorando los que romperían el modelo (ciclos de herencia, cambio de clase en uso). */
export function updateSchema(p: Project, schema: Schema): Project {
  const current = getSchema(p, schema.id);
  if (!current) return p;
  let next = schema;
  const kindChanged = next.kind !== current.kind;
  if (kindChanged && !canChangeSchemaKind(p, schema.id)) next = { ...next, kind: current.kind };
  else if (kindChanged) next = { ...next, parentTypeId: null };
  if (next.parentTypeId && next.parentTypeId !== current.parentTypeId) {
    const valid = inheritanceCandidates(p, schema.id).some(s => s.id === next.parentTypeId);
    if (!valid) next = { ...next, parentTypeId: current.parentTypeId };
  }
  let schemas = p.schemas.map(s => (s.id === next.id ? next : s));
  if (next.kind !== current.kind) schemas = removeTypeReferences(schemas, new Set([next.id]), next.id);
  return { ...p, schemas };
}

/**
 * Elimina un tipo, sus nodos y relaciones. Los subtipos pasan a heredar del padre del tipo eliminado.
 * Los subnodos de otros tipos suben al ancestro superviviente más cercano (`lift`) o se eliminan (`cascade`).
 */
export function deleteSchema(p: Project, schemaId: string, strategy: OrphanStrategy): Project {
  const deleted = getSchema(p, schemaId);
  if (!deleted) return p;
  const direct = p.nodes.filter(n => n.typeId === schemaId).map(n => n.id);
  const removed = new Set(direct);
  if (strategy === 'cascade') direct.forEach(id => descendants(p, id).forEach(d => removed.add(d)));
  const deletedFieldIds = new Set(ownFields(deleted).map(f => f.id));

  let next = removeNodes(p, removed);
  next = {
    ...next,
    relations: next.relations.filter(r => r.typeId !== schemaId).map(r => withoutValues(r, deletedFieldIds)),
    nodes: next.nodes.map(n => withoutValues(n, deletedFieldIds)),
    schemas: removeTypeReferences(
      p.schemas
        .filter(s => s.id !== schemaId)
        .map(s => (s.parentTypeId === schemaId ? { ...s, parentTypeId: deleted.parentTypeId } : s)),
      new Set([schemaId]),
    ),
  };
  return next;
}

export function addField(p: Project, schemaId: string): Project {
  return {
    ...p,
    schemas: p.schemas.map(s => {
      if (s.id !== schemaId) return s;
      const field = createField();
      let i = 2;
      const taken = [...ownFields(s).map(x => x.key), ...p.fieldLibrary.map(x => x.key)];
      while (taken.includes(field.key)) field.key = `nuevo_campo_${i++}`;
      return { ...s, fields: [...s.fields, field] };
    }),
  };
}

/** Elimina un atributo y los valores que guardaban sus instancias. */
export function deleteField(p: Project, schemaId: string, fieldId: string): Project {
  const ids = new Set([fieldId]);
  return {
    ...p,
    schemas: p.schemas.map(s =>
      s.id === schemaId ? { ...s, fields: s.fields.filter(f => isFieldLink(f) || f.id !== fieldId) } : s,
    ),
    nodes: p.nodes.map(n => withoutValues(n, ids)),
    relations: p.relations.map(r => withoutValues(r, ids)),
  };
}

export function addNode(
  p: Project,
  typeId: string,
  parentId: string | null,
  id: string = uid('node'),
): { project: Project; nodeId: string } {
  const values: Record<string, FieldValue> = {};
  allFields(p, typeId).forEach(f => {
    const value = typedDefault(f);
    if (value !== undefined) values[f.id] = value;
  });
  const node: Node = { id, typeId, parentId, values, createdAt: now(), position: null, notes: '' };
  return { project: { ...p, nodes: [...p.nodes, node] }, nodeId: node.id };
}

/** Actualiza valores y padre de un nodo. Un padre que crearía un ciclo se ignora. */
export function updateNode(p: Project, id: string, values: Record<string, FieldValue>, parentId: string | null) {
  if (!p.nodes.some(n => n.id === id)) return p;
  return {
    ...p,
    nodes: p.nodes.map(n =>
      n.id === id ? { ...n, values, parentId: canSetParent(p, id, parentId) ? parentId : n.parentId } : n,
    ),
  };
}

/** Elimina un nodo con todos sus descendientes. */
export function deleteNode(p: Project, id: string): Project {
  if (!p.nodes.some(n => n.id === id)) return p;
  return removeNodes(p, descendants(p, id));
}

export function addRelation(p: Project, typeId: string, sourceId: string, targetId: string): Project {
  const relation: Relation = { id: uid('rel'), typeId, sourceId, targetId, values: {}, createdAt: now() };
  return { ...p, relations: [...p.relations, relation] };
}

export function updateRelation(p: Project, relation: Relation): Project {
  if (!p.relations.some(r => r.id === relation.id)) return p;
  return { ...p, relations: p.relations.map(r => (r.id === relation.id ? relation : r)) };
}

export function deleteRelation(p: Project, id: string): Project {
  if (!p.relations.some(r => r.id === id)) return p;
  return { ...p, relations: p.relations.filter(r => r.id !== id) };
}

/**
 * Quita un conjunto de nodos: sus relaciones desaparecen, las referencias a ellos se vacían
 * y los hijos supervivientes suben al ancestro superviviente más cercano.
 */
function removeNodes(p: Project, removed: Set<string>): Project {
  if (!removed.size) return p;
  const byId = new Map(p.nodes.map(n => [n.id, n]));
  const survivingAncestor = (parentId: string | null) => {
    const seen = new Set<string>();
    let cur = parentId;
    while (cur && removed.has(cur) && !seen.has(cur)) {
      seen.add(cur);
      cur = byId.get(cur)?.parentId ?? null;
    }
    return cur && !removed.has(cur) ? cur : null;
  };
  const nodes = p.nodes
    .filter(n => !removed.has(n.id))
    .map(n => {
      const parentId = n.parentId && removed.has(n.parentId) ? survivingAncestor(n.parentId) : n.parentId;
      const values = withoutReferences(n.values, removed);
      return parentId === n.parentId && values === n.values ? n : { ...n, parentId, values };
    });
  const relations = p.relations
    .filter(r => !removed.has(r.sourceId) && !removed.has(r.targetId))
    .map(r => {
      const values = withoutReferences(r.values, removed);
      return values === r.values ? r : { ...r, values };
    });
  return { ...p, nodes, relations };
}

function withoutReferences(values: Record<string, FieldValue>, removed: Set<string>) {
  let changed = false;
  const next: Record<string, FieldValue> = {};
  Object.entries(values).forEach(([key, value]) => {
    if (typeof value === 'string' && removed.has(value)) {
      next[key] = null;
      changed = true;
    } else if (Array.isArray(value) && value.some(id => removed.has(id))) {
      next[key] = value.filter(id => !removed.has(id));
      changed = true;
    } else next[key] = value;
  });
  return changed ? next : values;
}

function withoutValues<T extends Node | Relation>(item: T, fieldIds: Set<string>): T {
  if (!Object.keys(item.values).some(key => fieldIds.has(key))) return item;
  return { ...item, values: Object.fromEntries(Object.entries(item.values).filter(([key]) => !fieldIds.has(key))) };
}

/** Quita ids de tipo de las listas de restricciones (subnodos, origen, destino y referencias). */
function removeTypeReferences(schemas: Schema[], typeIds: Set<string>, exceptSchemaId?: string): Schema[] {
  return schemas.map(s => {
    if (s.id === exceptSchemaId) return s;
    const lists = TYPE_LIST_KEYS.filter(key => s[key].some(id => typeIds.has(id)));
    const fieldsChanged = ownFields(s).some(f => f.referenceTypeIds.some(id => typeIds.has(id)));
    if (!lists.length && !fieldsChanged) return s;
    const next: Schema = { ...s };
    lists.forEach(key => (next[key] = s[key].filter(id => !typeIds.has(id))));
    if (fieldsChanged)
      next.fields = s.fields.map(f =>
        isFieldLink(f) ? f : { ...f, referenceTypeIds: f.referenceTypeIds.filter(id => !typeIds.has(id)) },
      );
    return next;
  });
}

/** Fija (o suelta, con `null`) la posición de varios nodos en el lienzo. */
export function moveNodes(p: Project, positions: Record<string, Position | null>): Project {
  let changed = false;
  const nodes = p.nodes.map(n => {
    if (!(n.id in positions)) return n;
    const next = positions[n.id];
    if (next === n.position || (next && n.position && next.x === n.position.x && next.y === n.position.y)) return n;
    changed = true;
    return { ...n, position: next ? { x: Math.round(next.x), y: Math.round(next.y) } : null };
  });
  return changed ? { ...p, nodes } : p;
}

export function updateView(p: Project, patch: Partial<ProjectView>): Project {
  return { ...p, view: { ...p.view, ...patch } };
}

/**
 * Crea un nodo colgando de `parentId` en la estructura indicada: en la jerarquía base fija su
 * padre; en una relación estructural lo crea en la raíz y añade la relación que lo enlaza.
 */
export function addNodeUnder(
  p: Project,
  typeId: string,
  structureId: string | null,
  parentId: string | null,
  id?: string,
  position: Position | null = null,
): Project {
  if (structureId === null || parentId === null) {
    const created = addNode(p, typeId, parentId, id);
    return position ? moveNodes(created.project, { [created.nodeId]: position }) : created.project;
  }
  const created = addNode(p, typeId, null, id);
  let next = position ? moveNodes(created.project, { [created.nodeId]: position }) : created.project;
  if (structureId.startsWith(FIELD_LENS)) {
    // Estructura por atributo de referencia: el nuevo nodo apunta al superior desde ese atributo.
    const field = fieldOfLens(p, structureId);
    if (field)
      next = updateNodeValue(next, created.nodeId, field.id, field.type === 'nodeRefs' ? [parentId] : parentId);
    return next;
  }
  const schema = getSchema(p, structureId);
  if (schema?.structural) {
    const { sourceId, targetId } = structureEndpoints(schema, parentId, created.nodeId);
    next = addRelation(next, schema.id, sourceId, targetId);
  }
  return next;
}

/** Cambia un único valor de un nodo. */
export function updateNodeValue(p: Project, nodeId: string, fieldId: string, value: FieldValue): Project {
  return {
    ...p,
    nodes: p.nodes.map(n => (n.id === nodeId ? { ...n, values: { ...n.values, [fieldId]: value } } : n)),
  };
}

export function updateNotes(p: Project, nodeId: string, notes: string): Project {
  if (!p.nodes.some(n => n.id === nodeId)) return p;
  return { ...p, nodes: p.nodes.map(n => (n.id === nodeId ? { ...n, notes } : n)) };
}
