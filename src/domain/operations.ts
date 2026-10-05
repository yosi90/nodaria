import { createField, createSchema, now, uid } from './factories';
import {
  allFields,
  canChangeSchemaKind,
  canContain,
  canSetParent,
  descendants,
  getNode,
  getSchema,
  inheritanceCandidates,
} from './selectors';
import { isFieldLink, ownFields } from './library';
import { defaultChildTerm } from './kinship';
import { hideNewTypesInGenealogy } from './layoutFilters';
import { withoutNodesInFolders } from './folders';
import { FIELD_LENS, fieldOfLens, structureEndpoints } from './structure';
import type {
  FieldDefinition,
  FieldLink,
  FieldValue,
  KinshipTerm,
  LayoutMode,
  Lens,
  MapImage,
  Node,
  OrphanStrategy,
  Position,
  Project,
  ProjectView,
  Relation,
  Schema,
  SchemaField,
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
  if (field.type === 'tags')
    return Array.isArray(raw)
      ? raw
      : String(raw)
          .split(',')
          .map(t => t.trim())
          .filter(Boolean);
  if (field.type === 'scale') {
    const value = Math.round(Number(raw));
    return value >= 1 && value <= 5 ? value : undefined;
  }
  if (field.type === 'nodeRef') return typeof raw === 'string' && raw ? raw : undefined;
  // Una lista de opciones solo admite como inicial una de sus opciones.
  if (field.type === 'select') return field.options.includes(String(raw)) ? raw : undefined;
  return raw;
}

export function addSchema(p: Project, name: string, kind: SchemaKind, id?: string): Project {
  const schema = id ? { ...createSchema(name, kind), id } : createSchema(name, kind);
  return hideNewTypesInGenealogy({ ...p, schemas: [...p.schemas, schema] }, [schema.id]);
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
  // Si tiene subtipos, sus atributos no se pierden: los propios pasan a la biblioteca y cada subtipo
  // directo los vincula (los valores se guardan por id de atributo, así que se conservan).
  const subtypes = p.schemas.filter(s => s.parentTypeId === schemaId);
  const own = ownFields(deleted);
  const library = subtypes.length
    ? [...p.fieldLibrary, ...own.filter(f => !p.fieldLibrary.some(l => l.id === f.id))]
    : p.fieldLibrary;
  const handDown: FieldLink[] = subtypes.length ? deleted.fields.map(f => (isFieldLink(f) ? f : { ref: f.id })) : [];
  const deletedFieldIds = new Set(subtypes.length ? [] : own.map(f => f.id));
  const entryRef = (f: SchemaField) => (isFieldLink(f) ? f.ref : f.id);

  let next = removeNodes(p, removed);
  next = {
    ...next,
    fieldLibrary: library,
    relations: next.relations.filter(r => r.typeId !== schemaId).map(r => withoutValues(r, deletedFieldIds)),
    nodes: next.nodes.map(n => withoutValues(n, deletedFieldIds)),
    schemas: removeTypeReferences(
      p.schemas
        .filter(s => s.id !== schemaId)
        .map(s =>
          s.parentTypeId === schemaId
            ? {
                ...s,
                parentTypeId: deleted.parentTypeId,
                fields: [...handDown.filter(h => !s.fields.some(e => entryRef(e) === h.ref)), ...s.fields],
              }
            : s,
        ),
      new Set([schemaId]),
    ),
  };
  return next;
}

export function addField(p: Project, schemaId: string, preset: Partial<FieldDefinition> = {}): Project {
  return {
    ...p,
    schemas: p.schemas.map(s => {
      if (s.id !== schemaId) return s;
      const field = { ...createField(), ...preset };
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

/** Valores iniciales de un tipo (propios y heredados), ya tipados; las referencias a nodos inexistentes se omiten. */
export function defaultValues(p: Project, typeId: string): Record<string, FieldValue> {
  const values: Record<string, FieldValue> = {};
  const exists = (id: string) => p.nodes.some(n => n.id === id);
  allFields(p, typeId).forEach(f => {
    let value = typedDefault(f);
    if (f.type === 'nodeRef' && typeof value === 'string' && !exists(value)) value = undefined;
    if (f.type === 'nodeRefs' && Array.isArray(value)) value = value.filter(exists);
    if (value !== undefined && !(Array.isArray(value) && !value.length)) values[f.id] = value;
  });
  return values;
}

/** Un valor «vacío» a efectos de rellenar con el inicial. */
export function isBlank(value: FieldValue | undefined): boolean {
  return value === undefined || value === null || value === '' || (Array.isArray(value) && value.length === 0);
}

/** Nodos cuyo tipo tiene el atributo `fieldId` y que no tienen valor en él. */
export function nodesMissingValue(p: Project, fieldId: string): Node[] {
  return p.nodes.filter(n => isBlank(n.values[fieldId]) && allFields(p, n.typeId).some(f => f.id === fieldId));
}

/** Rellena con el valor inicial del atributo todas las fichas que lo tienen vacío. */
export function fillDefaults(p: Project, fieldId: string): Project {
  const missing = new Set(nodesMissingValue(p, fieldId).map(n => n.id));
  if (!missing.size) return p;
  return {
    ...p,
    nodes: p.nodes.map(n => {
      if (!missing.has(n.id)) return n;
      const value = defaultValues(p, n.typeId)[fieldId];
      return value === undefined ? n : { ...n, values: { ...n.values, [fieldId]: value } };
    }),
  };
}

export function addNode(
  p: Project,
  typeId: string,
  parentId: string | null,
  id: string = uid('node'),
): { project: Project; nodeId: string } {
  const values = defaultValues(p, typeId);
  const node: Node = { id, typeId, parentId, values, createdAt: now(), positions: {}, notes: '' };
  return { project: { ...p, nodes: [...p.nodes, node] }, nodeId: node.id };
}

/** Nombre de una copia: «X (copia)», «X (copia 2)»… sin repetir los que ya existen. */
function copyName(name: string, taken: string[]): string {
  const base = name.replace(/ \(copia(?: \d+)?\)$/, '');
  let candidate = `${base} (copia)`;
  for (let i = 2; taken.includes(candidate); i++) candidate = `${base} (copia ${i})`;
  return candidate;
}

/**
 * Duplica un nodo: mismos valores, padre y notas; el título lleva «(copia)»; cada posición fijada se
 * desplaza un poco para que no tape al original. Con `withRelations`, copia también sus relaciones.
 */
export function duplicateNode(
  p: Project,
  id: string,
  withRelations = false,
  newId: string = uid('node'),
): { project: Project; nodeId: string } {
  const source = p.nodes.find(n => n.id === id);
  if (!source) return { project: p, nodeId: id };
  const fields = allFields(p, source.typeId);
  const title = fields.find(f => f.isTitle) ?? fields.find(f => f.type === 'text');
  const values = { ...source.values };
  if (title && typeof values[title.id] === 'string' && values[title.id]) {
    const taken = p.nodes.filter(n => n.typeId === source.typeId).map(n => String(n.values[title.id] ?? ''));
    values[title.id] = copyName(String(values[title.id]), taken);
  }
  const positions: Node['positions'] = {};
  (Object.keys(source.positions) as (keyof Node['positions'])[]).forEach(mode => {
    const pos = source.positions[mode];
    if (pos) positions[mode] = { x: pos.x + 32, y: pos.y + 32 };
  });
  const node: Node = { ...source, id: newId, values, positions, createdAt: now() };
  const index = p.nodes.findIndex(n => n.id === id);
  const nodes = [...p.nodes.slice(0, index + 1), node, ...p.nodes.slice(index + 1)];
  const relations = withRelations
    ? [
        ...p.relations,
        ...p.relations
          .filter(r => r.sourceId === id || r.targetId === id)
          .map(r => ({
            ...r,
            id: uid('rel'),
            sourceId: r.sourceId === id ? newId : r.sourceId,
            targetId: r.targetId === id ? newId : r.targetId,
            createdAt: now(),
          })),
      ]
    : p.relations;
  return { project: { ...p, nodes, relations }, nodeId: newId };
}

/** Duplica un tipo con sus atributos propios (nuevos ids) y sus vínculos a preformas; sin nodos. */
export function duplicateSchema(
  p: Project,
  id: string,
  newId: string = uid('type'),
): { project: Project; schemaId: string } {
  const source = p.schemas.find(s => s.id === id);
  if (!source) return { project: p, schemaId: id };
  const name = copyName(
    source.name,
    p.schemas.filter(s => s.kind === source.kind).map(s => s.name),
  );
  const fields = source.fields.map(f => (isFieldLink(f) ? { ...f } : { ...f, id: uid('field') }));
  const schema: Schema = {
    ...source,
    id: newId,
    name,
    fields,
    // Un tipo que se admite a sí mismo como subnodo admite también a su copia.
    allowedChildTypeIds: source.allowedChildTypeIds.map(t => (t === id ? newId : t)),
    sourceTypeIds: source.sourceTypeIds.map(t => (t === id ? newId : t)),
    targetTypeIds: source.targetTypeIds.map(t => (t === id ? newId : t)),
  };
  const index = p.schemas.findIndex(s => s.id === id);
  const project = { ...p, schemas: [...p.schemas.slice(0, index + 1), schema, ...p.schemas.slice(index + 1)] };
  return { project: hideNewTypesInGenealogy(project, [newId]), schemaId: newId };
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

/** Elimina varios nodos (y sus descendientes) de una vez. */
export function deleteNodes(p: Project, ids: string[]): Project {
  const removed = new Set<string>();
  ids.forEach(id => descendants(p, id).forEach(d => removed.add(d)));
  return removeNodes(p, removed);
}

/** Cambios aplicables a varios nodos a la vez. Lo que no cabe en un nodo concreto se omite para ese nodo. */
export interface BulkPatch {
  /** Nuevo tipo: los valores se conservan por id de atributo y, entre atributos propios, por clave. */
  typeId?: string;
  /** Nuevo padre (`null` = raíz). Se omite en los nodos cuyo nuevo padre no los admite o crearía un ciclo. */
  parentId?: string | null;
  /** Etiquetas que añadir a un atributo de tipo «Etiquetas» (solo en los nodos cuyo tipo lo tiene). */
  tags?: { fieldId: string; add: string[] };
}

/** Cuántos de los nodos recibirían cada cambio de `patch`. */
export function bulkPreview(p: Project, ids: string[], patch: BulkPatch) {
  const nodes = ids.map(id => p.nodes.find(n => n.id === id)).filter((n): n is Node => Boolean(n));
  const typeId = patch.typeId;
  const moved =
    patch.parentId === undefined
      ? 0
      : nodes.filter(n => canMoveTo(p, n, patch.parentId!, typeId ?? n.typeId, ids)).length;
  const tagged = patch.tags
    ? nodes.filter(n => allFields(p, typeId ?? n.typeId).some(f => f.id === patch.tags!.fieldId)).length
    : 0;
  return { total: nodes.length, moved, tagged };
}

function canMoveTo(p: Project, node: Node, parentId: string | null, typeId: string, selected: string[]) {
  if (parentId === null) return node.parentId !== null;
  if (selected.includes(parentId) && parentId !== node.id && descendants(p, parentId).has(node.id)) return false;
  const parent = getNode(p, parentId);
  return Boolean(parent) && canSetParent(p, node.id, parentId) && canContain(p, parent!.typeId, typeId);
}

export function bulkUpdateNodes(p: Project, ids: string[], patch: BulkPatch): Project {
  const chosen = new Set(ids);
  return {
    ...p,
    nodes: p.nodes.map(n => {
      if (!chosen.has(n.id)) return n;
      let next = n;
      if (patch.typeId && patch.typeId !== n.typeId && getSchema(p, patch.typeId)?.kind === 'entity')
        next = { ...next, typeId: patch.typeId, values: remapValues(p, n, patch.typeId) };
      if (patch.parentId !== undefined && canMoveTo(p, n, patch.parentId, next.typeId, ids))
        next = { ...next, parentId: patch.parentId };
      if (patch.tags && allFields(p, next.typeId).some(f => f.id === patch.tags!.fieldId)) {
        const current = next.values[patch.tags.fieldId];
        const list = Array.isArray(current) ? current : [];
        const merged = [...list, ...patch.tags.add.filter(t => !list.includes(t))];
        if (merged.length !== list.length) next = { ...next, values: { ...next.values, [patch.tags.fieldId]: merged } };
      }
      return next;
    }),
  };
}

/** Valores de un nodo al cambiarlo de tipo: mismos ids se conservan; entre atributos distintos, misma clave. */
function remapValues(p: Project, node: Node, typeId: string): Record<string, FieldValue> {
  const from = allFields(p, node.typeId);
  const to = allFields(p, typeId);
  const values: Record<string, FieldValue> = {};
  to.forEach(f => {
    if (f.type === 'computed') return;
    if (node.values[f.id] !== undefined) {
      values[f.id] = node.values[f.id];
      return;
    }
    const same = from.find(g => g.key === f.key && g.type === f.type && node.values[g.id] !== undefined);
    if (same) values[f.id] = node.values[same.id];
  });
  const defaults = defaultValues(p, typeId);
  Object.entries(defaults).forEach(([id, value]) => {
    if (isBlank(values[id])) values[id] = value;
  });
  return values;
}

/** Elimina un nodo con todos sus descendientes. */
export function deleteNode(p: Project, id: string): Project {
  if (!p.nodes.some(n => n.id === id)) return p;
  return removeNodes(p, descendants(p, id));
}

export function addRelation(
  p: Project,
  typeId: string,
  sourceId: string,
  targetId: string,
  extra: { id?: string; values?: Record<string, FieldValue>; reverseName?: string; kinshipId?: string | null } = {},
): Project {
  const relation: Relation = {
    id: extra.id ?? uid('rel'),
    typeId,
    sourceId,
    targetId,
    values: extra.values ?? {},
    createdAt: now(),
    reverseName: extra.reverseName ?? '',
    kinshipId: extra.kinshipId ?? null,
    kinshipNeutral: false,
  };
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
  return withoutNodesInFolders({ ...p, nodes, relations }, removed);
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

/** Posición fijada de un nodo en una disposición (la actual si no se indica). */
export const pinnedPosition = (p: Project, n: Node, layout: LayoutMode = p.view.layout) => n.positions[layout];

/** Fija (o suelta, con `null`) la posición de varios nodos en una disposición del lienzo (la actual si no se indica). */
export function moveNodes(
  p: Project,
  positions: Record<string, Position | null>,
  layout: LayoutMode = p.view.layout,
): Project {
  let changed = false;
  const nodes = p.nodes.map(n => {
    if (!(n.id in positions)) return n;
    const next = positions[n.id];
    const current = n.positions[layout];
    if ((!next && !current) || (next && current && next.x === current.x && next.y === current.y)) return n;
    changed = true;
    const rest = { ...n.positions };
    delete rest[layout];
    return { ...n, positions: next ? { ...rest, [layout]: { x: Math.round(next.x), y: Math.round(next.y) } } : rest };
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
  if (schema?.genealogical) {
    // Crear «dentro de» un ascendiente: el nuevo nodo es su descendiente directo.
    const child = defaultChildTerm(p);
    if (child) next = addRelation(next, schema.id, created.nodeId, parentId, { kinshipId: child.id });
  } else if (schema?.structural) {
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

/** Guarda la configuración actual del mapa como vista nueva (o sobrescribe `id`). */
export function saveLens(p: Project, name: string, includePositions: boolean, id: string = uid('lens')): Project {
  const positions: Record<string, Position> = {};
  if (includePositions)
    p.nodes.forEach(n => {
      const pos = pinnedPosition(p, n);
      if (pos) positions[n.id] = pos;
    });
  const lens: Lens = {
    id,
    name,
    view: { ...p.view, lensId: id },
    positions: includePositions ? positions : null,
  };
  const exists = p.lenses.some(l => l.id === id);
  return {
    ...p,
    lenses: exists ? p.lenses.map(l => (l.id === id ? lens : l)) : [...p.lenses, lens],
    view: { ...p.view, lensId: id },
  };
}

export function renameLens(p: Project, id: string, name: string): Project {
  return { ...p, lenses: p.lenses.map(l => (l.id === id ? { ...l, name } : l)) };
}

export function deleteLens(p: Project, id: string): Project {
  return {
    ...p,
    lenses: p.lenses.filter(l => l.id !== id),
    view: p.view.lensId === id ? { ...p.view, lensId: null } : p.view,
  };
}

/** Aplica una vista guardada: su configuración y, si las guardó, las posiciones de los nodos. */
export function applyLens(p: Project, id: string): Project {
  const lens = p.lenses.find(l => l.id === id);
  if (!lens) return p;
  let next: Project = { ...p, view: { ...lens.view, lensId: id } };
  if (lens.positions) {
    const positions: Record<string, Position | null> = {};
    p.nodes.forEach(n => (positions[n.id] = lens.positions![n.id] ?? null));
    next = moveNodes(next, positions);
  }
  return next;
}

/** Pone o quita la imagen de fondo de la disposición «Mapa». */
export function setMapImage(p: Project, image: MapImage | null): Project {
  return { ...p, mapImage: image };
}

/**
 * Cambia la escala del mapa. Los nodos colocados se reubican en proporción (por el centro del
 * marcador) para que sigan señalando el mismo lugar de la imagen.
 */
export function setMapScale(p: Project, scale: number, marker = 44): Project {
  if (!p.mapImage || !(scale > 0)) return p;
  const ratio = scale / p.mapImage.scale;
  const nodes = p.nodes.map(n => {
    const pos = n.positions.image;
    if (!pos) return n;
    return {
      ...n,
      positions: {
        ...n.positions,
        image: {
          x: Math.round((pos.x + marker / 2) * ratio - marker / 2),
          y: Math.round((pos.y + marker / 2) * ratio - marker / 2),
        },
      },
    };
  });
  return { ...p, mapImage: { ...p.mapImage, scale }, nodes };
}

/** Sustituye el vocabulario de parentesco; las relaciones con términos borrados quedan sin término. */
export function updateKinship(p: Project, kinship: KinshipTerm[]): Project {
  const ids = new Set(kinship.map(t => t.id));
  return {
    ...p,
    kinship,
    relations: p.relations.map(r => (r.kinshipId && !ids.has(r.kinshipId) ? { ...r, kinshipId: null } : r)),
  };
}
