import { defaultChildTerm, kinshipStructureLink } from './kinship';
import { addRelation } from './operations';
import { referencedIds } from './references';
import { allFields, canContain, canSetParent, getNode, getSchema, typeMatches } from './selectors';
import { fieldOfLens, structureChildren, structureEndpoints } from './structure';
import type { Project } from './types';

/*
 * Mover un nodo dentro de una estructura (arrastrar y soltar en el árbol): colgarlo de otro superior,
 * sacarlo a la raíz o reordenarlo entre sus hermanos. Cada estructura lo expresa a su manera:
 * - Jerarquía base: `parentId` del nodo; el orden de hermanos es el orden de `nodes`.
 * - Relación estructural o genealógica: se quita la relación con el superior anterior y se crea con
 *   el nuevo; el orden de hermanos es el orden de `relations`.
 * - Atributo de referencia: el valor del atributo apunta al superior; el orden es el de `nodes`.
 */

export interface StructureMove {
  structureId: string | null;
  nodeId: string;
  /** Superior bajo el que se mostraba el nodo (en una estructura puede tener varios), o `null` si era raíz. */
  fromParentId: string | null;
  /** Nuevo superior, o `null` para la raíz. */
  parentId: string | null;
  /** Hermano delante del cual colocarlo; `null` = al final. */
  beforeId: string | null;
}

/** Descendientes de un nodo en una estructura (para no colgar un nodo de sí mismo ni de su rama). */
function structureDescendants(p: Project, structureId: string | null, nodeId: string): Set<string> {
  const children = structureChildren(p, structureId);
  const result = new Set<string>([nodeId]);
  const walk = (id: string) =>
    (children.get(id) ?? []).forEach(c => {
      if (!result.has(c.id)) {
        result.add(c.id);
        walk(c.id);
      }
    });
  walk(nodeId);
  return result;
}

/** Si el nodo puede colgar de `parentId` en la estructura (tipos admitidos y sin ciclos). */
export function canMoveInStructure(p: Project, structureId: string | null, nodeId: string, parentId: string | null) {
  const node = getNode(p, nodeId);
  if (!node) return false;
  if (parentId === null) return true;
  const parent = getNode(p, parentId);
  if (!parent || parentId === nodeId || structureDescendants(p, structureId, nodeId).has(parentId)) return false;
  if (structureId === null) return canSetParent(p, nodeId, parentId) && canContain(p, parent.typeId, node.typeId);
  const field = fieldOfLens(p, structureId);
  if (field)
    return (
      allFields(p, node.typeId).some(f => f.id === field.id) &&
      (!field.referenceTypeIds.length || typeMatches(p, parent.typeId, field.referenceTypeIds))
    );
  const schema = getSchema(p, structureId);
  if (!schema) return false;
  if (schema.genealogical)
    return (
      Boolean(defaultChildTerm(p)) &&
      typeMatches(p, node.typeId, schema.sourceTypeIds) &&
      typeMatches(p, parent.typeId, schema.targetTypeIds)
    );
  const { sourceId, targetId } = structureEndpoints(schema, parentId, nodeId);
  const sourceType = getNode(p, sourceId)!.typeId;
  const targetType = getNode(p, targetId)!.typeId;
  return typeMatches(p, sourceType, schema.sourceTypeIds) && typeMatches(p, targetType, schema.targetTypeIds);
}

/** Coloca `id` delante de `beforeId` en la lista (o al final si no hay), devolviendo una lista nueva. */
function placeBefore<T extends { id: string }>(list: T[], id: string, beforeId: string | null): T[] {
  const item = list.find(x => x.id === id);
  if (!item) return list;
  const rest = list.filter(x => x.id !== id);
  const index = beforeId ? rest.findIndex(x => x.id === beforeId) : -1;
  if (index < 0) return [...rest, item];
  return [...rest.slice(0, index), item, ...rest.slice(index)];
}

export function moveInStructure(p: Project, move: StructureMove): Project {
  const { structureId, nodeId, fromParentId, parentId, beforeId } = move;
  if (!canMoveInStructure(p, structureId, nodeId, parentId)) return p;
  const node = getNode(p, nodeId)!;
  const before = beforeId && beforeId !== nodeId ? beforeId : null;

  if (structureId === null) {
    const nodes = placeBefore(
      p.nodes.map(n => (n.id === nodeId ? { ...n, parentId } : n)),
      nodeId,
      before,
    );
    return { ...p, nodes };
  }

  const field = fieldOfLens(p, structureId);
  if (field) {
    const current = referencedIds(p, node.values[field.id]);
    const value =
      field.type === 'nodeRefs'
        ? [...current.filter(id => id !== fromParentId), ...(parentId ? [parentId] : [])]
        : (parentId ?? null);
    const nodes = placeBefore(
      p.nodes.map(n => (n.id === nodeId ? { ...n, values: { ...n.values, [field.id]: value } } : n)),
      nodeId,
      before,
    );
    return { ...p, nodes };
  }

  const schema = getSchema(p, structureId);
  if (!schema) return p;
  // Relaciones que colgaban el nodo del superior anterior en esta estructura.
  const linksParent = (r: Project['relations'][number]) => {
    if (r.typeId !== structureId) return null;
    if (schema.genealogical) return kinshipStructureLink(p, r);
    const { parentId: pid, childId } =
      schema.parentEnd === 'source'
        ? { parentId: r.sourceId, childId: r.targetId }
        : { parentId: r.targetId, childId: r.sourceId };
    return { parentId: pid, childId };
  };
  let next: Project = {
    ...p,
    relations: p.relations.filter(r => {
      const link = linksParent(r);
      return !(link && link.childId === nodeId && link.parentId === fromParentId);
    }),
  };
  if (parentId) {
    if (schema.genealogical) {
      const child = defaultChildTerm(p)!;
      next = addRelation(next, schema.id, nodeId, parentId, { kinshipId: child.id });
    } else {
      const { sourceId, targetId } = structureEndpoints(schema, parentId, nodeId);
      next = addRelation(next, schema.id, sourceId, targetId);
    }
    // La relación recién creada se coloca entre las de sus hermanos según `before`.
    const created = next.relations[next.relations.length - 1];
    const beforeRelation = before
      ? next.relations.find(r => {
          const link = linksParent(r);
          return link && link.childId === before && link.parentId === parentId;
        })
      : undefined;
    next = { ...next, relations: placeBefore(next.relations, created.id, beforeRelation?.id ?? null) };
  } else {
    // A la raíz: el orden entre raíces es el de `nodes`.
    next = { ...next, nodes: placeBefore(next.nodes, nodeId, before) };
  }
  return next;
}
