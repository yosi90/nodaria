import { allFields, nodeLabel } from './selectors';
import type { FieldDefinition, Node, Project, Schema } from './types';

/*
 * Referencias: atributos de tipo `nodeRef` / `nodeRefs` que apuntan a otros nodos. Son vínculos
 * de pleno derecho: se dibujan en el lienzo, cuentan como conexiones y sirven de estructura.
 */

export interface ReferenceField {
  field: FieldDefinition;
  /** Tipo que declara el atributo (los subtipos lo heredan). */
  owner: Schema;
  /** Nombre único para la interfaz: la etiqueta, con el tipo si otra referencia se llama igual. */
  name: string;
}

export interface ReferenceLink {
  fieldId: string;
  sourceId: string;
  targetId: string;
}

export const isReferenceField = (f: FieldDefinition) => f.type === 'nodeRef' || f.type === 'nodeRefs';

/** Atributos de referencia declarados en los tipos de entidad. */
export function referenceFields(p: Project): ReferenceField[] {
  const result: ReferenceField[] = [];
  p.schemas
    .filter(s => s.kind === 'entity')
    .forEach(owner =>
      owner.fields.filter(isReferenceField).forEach(field => result.push({ field, owner, name: field.label })),
    );
  const labels = new Map<string, number>();
  result.forEach(r => labels.set(r.field.label, (labels.get(r.field.label) ?? 0) + 1));
  return result.map(r =>
    (labels.get(r.field.label) ?? 0) > 1 ? { ...r, name: `${r.field.label} (${r.owner.name})` } : r,
  );
}

/** Ids de nodo guardados en un valor de referencia, ignorando los que ya no existen. */
export function referencedIds(p: Project, value: unknown): string[] {
  const ids = typeof value === 'string' ? [value] : Array.isArray(value) ? value : [];
  const existing = new Set(p.nodes.map(n => n.id));
  return ids.filter((id): id is string => typeof id === 'string' && existing.has(id));
}

/** Todos los vínculos por referencia del proyecto, de quien tiene el atributo hacia el nodo apuntado. */
export function referenceLinks(p: Project): ReferenceLink[] {
  const result: ReferenceLink[] = [];
  const fieldsByType = new Map<string, FieldDefinition[]>();
  p.nodes.forEach(node => {
    let fields = fieldsByType.get(node.typeId);
    if (!fields) {
      fields = allFields(p, node.typeId).filter(isReferenceField);
      fieldsByType.set(node.typeId, fields);
    }
    fields.forEach(field =>
      referencedIds(p, node.values[field.id]).forEach(targetId =>
        result.push({ fieldId: field.id, sourceId: node.id, targetId }),
      ),
    );
  });
  return result;
}

/** Tipos de entidad concretos cuyos nodos tienen el atributo (propio o heredado). */
export function typesWithField(p: Project, fieldId: string): Schema[] {
  return p.schemas.filter(s => s.kind === 'entity' && !s.isAbstract && allFields(p, s.id).some(f => f.id === fieldId));
}

/** Nodos que puede tomar como valor un atributo de referencia. */
export function referenceCandidates(p: Project, field: FieldDefinition, excludeId?: string): Node[] {
  const allowed = new Set(field.referenceTypeIds);
  return p.nodes
    .filter(n => n.id !== excludeId && (!allowed.size || typeMatchesAny(p, n.typeId, allowed)))
    .sort((a, b) => nodeLabel(p, a).localeCompare(nodeLabel(p, b), 'es'));
}

function typeMatchesAny(p: Project, typeId: string, allowed: Set<string>) {
  let cur = p.schemas.find(s => s.id === typeId);
  const seen = new Set<string>();
  while (cur && !seen.has(cur.id)) {
    if (allowed.has(cur.id)) return true;
    seen.add(cur.id);
    cur = cur.parentTypeId ? p.schemas.find(s => s.id === cur!.parentTypeId) : undefined;
  }
  return false;
}
