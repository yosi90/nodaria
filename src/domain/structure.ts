import { kinshipStructureLink } from './kinship';
import { referenceFields, referencedIds, typesWithField } from './references';
import { allFields, getSchema, typeMatches } from './selectors';
import type { FieldDefinition, Node, Project, Schema } from './types';

/*
 * Estructuras: formas de organizar los nodos en árbol. La base es la jerarquía "Dentro de"
 * (`parentId`); además, cualquier tipo de relación marcado como estructural define otra,
 * en la que un nodo puede colgar de varios superiores.
 */

/** Id de la estructura base (jerarquía por `parentId`). */
export const HIERARCHY = null;

/** Prefijo de las estructuras definidas por un atributo de referencia. */
export const FIELD_LENS = 'field:';

export interface StructureLens {
  id: string | null;
  name: string;
  schema?: Schema;
  field?: FieldDefinition;
}

/** Estructuras disponibles: la jerarquía base, los tipos de relación estructurales y los atributos de referencia. */
export function structureLenses(p: Project): StructureLens[] {
  return [
    { id: HIERARCHY, name: 'Dentro de' },
    ...p.schemas
      .filter(s => s.kind === 'relationship' && (s.structural || s.genealogical))
      .map(s => ({ id: s.id, name: s.name, schema: s })),
    ...referenceFields(p).map(r => ({ id: FIELD_LENS + r.field.id, name: r.name, field: r.field })),
  ];
}

/** Atributo de referencia al que corresponde una estructura `field:…`, si existe. */
export function fieldOfLens(p: Project, structureId: string | null): FieldDefinition | undefined {
  if (!structureId?.startsWith(FIELD_LENS)) return undefined;
  const fieldId = structureId.slice(FIELD_LENS.length);
  return referenceFields(p).find(r => r.field.id === fieldId)?.field;
}

/** Resuelve la estructura pedida; si ya no existe, vuelve a la jerarquía base. */
export function resolveStructure(p: Project, structureId: string | null): StructureLens {
  return structureLenses(p).find(l => l.id === structureId) ?? { id: HIERARCHY, name: 'Dentro de' };
}

/** Pares (superior, inferior) que define una estructura. */
export function structureLinks(p: Project, structureId: string | null): { parentId: string; childId: string }[] {
  if (structureId === HIERARCHY) {
    const ids = new Set(p.nodes.map(n => n.id));
    return p.nodes.filter(n => n.parentId && ids.has(n.parentId)).map(n => ({ parentId: n.parentId!, childId: n.id }));
  }
  const field = fieldOfLens(p, structureId);
  if (field) {
    const links: { parentId: string; childId: string }[] = [];
    p.nodes.forEach(n => {
      if (!allFields(p, n.typeId).some(f => f.id === field.id)) return;
      referencedIds(p, n.values[field.id]).forEach(parentId => links.push({ parentId, childId: n.id }));
    });
    return links;
  }
  const schema = getSchema(p, structureId);
  if (schema?.genealogical)
    return p.relations
      .filter(r => r.typeId === structureId)
      .map(r => kinshipStructureLink(p, r))
      .filter((l): l is { parentId: string; childId: string } => Boolean(l));
  if (!schema?.structural) return [];
  return p.relations
    .filter(r => r.typeId === structureId && r.sourceId !== r.targetId)
    .map(r =>
      schema.parentEnd === 'source'
        ? { parentId: r.sourceId, childId: r.targetId }
        : { parentId: r.targetId, childId: r.sourceId },
    );
}

/**
 * Hijos de cada nodo en una estructura. La clave `null` agrupa las raíces: los nodos sin
 * superior en esa estructura. Un nodo con varios superiores aparece bajo cada uno.
 */
export function structureChildren(p: Project, structureId: string | null): Map<string | null, Node[]> {
  const byId = new Map(p.nodes.map(n => [n.id, n]));
  const children = new Map<string | null, Node[]>();
  const hasParent = new Set<string>();
  for (const { parentId, childId } of structureLinks(p, structureId)) {
    const child = byId.get(childId);
    if (!child || !byId.has(parentId)) continue;
    const list = children.get(parentId) ?? [];
    if (!list.includes(child)) list.push(child);
    children.set(parentId, list);
    hasParent.add(childId);
  }
  children.set(
    null,
    p.nodes.filter(n => !hasParent.has(n.id)),
  );
  return children;
}

/** Superiores de un nodo en una estructura. */
export function structureParents(p: Project, structureId: string | null, nodeId: string): Node[] {
  const byId = new Map(p.nodes.map(n => [n.id, n]));
  return structureLinks(p, structureId)
    .filter(l => l.childId === nodeId)
    .map(l => byId.get(l.parentId))
    .filter((n): n is Node => Boolean(n));
}

/**
 * Tipos de entidad que pueden crearse "dentro de" un nodo en una estructura: en la jerarquía
 * base, los subnodos permitidos; en una relación estructural, los tipos admitidos en el extremo
 * inferior (y, si el superior no encaja en el extremo superior, ninguno).
 */
export function creatableTypesIn(p: Project, structureId: string | null, parentId: string | null): Schema[] {
  const concrete = p.schemas.filter(s => s.kind === 'entity' && !s.isAbstract);
  if (parentId === null) return concrete;
  const parent = p.nodes.find(n => n.id === parentId);
  if (!parent) return [];
  if (structureId === HIERARCHY) {
    const allowed = getSchema(p, parent.typeId)?.allowedChildTypeIds ?? [];
    return allowed.length ? concrete.filter(s => typeMatches(p, s.id, allowed)) : [];
  }
  const field = fieldOfLens(p, structureId);
  if (field) {
    if (field.referenceTypeIds.length && !typeMatches(p, parent.typeId, field.referenceTypeIds)) return [];
    return typesWithField(p, field.id);
  }
  const schema = getSchema(p, structureId);
  if (schema?.genealogical) {
    // El nuevo nodo será descendiente (origen) del superior (destino).
    if (!typeMatches(p, parent.typeId, schema.targetTypeIds)) return [];
    return concrete.filter(s => typeMatches(p, s.id, schema.sourceTypeIds));
  }
  if (!schema?.structural) return [];
  const upper = schema.parentEnd === 'source' ? schema.sourceTypeIds : schema.targetTypeIds;
  const lower = schema.parentEnd === 'source' ? schema.targetTypeIds : schema.sourceTypeIds;
  if (!typeMatches(p, parent.typeId, upper)) return [];
  return concrete.filter(s => typeMatches(p, s.id, lower));
}

/** Extremos (origen, destino) de la relación estructural que cuelga `childId` de `parentId`. */
export function structureEndpoints(schema: Schema, parentId: string, childId: string) {
  return schema.parentEnd === 'source'
    ? { sourceId: parentId, targetId: childId }
    : { sourceId: childId, targetId: parentId };
}
