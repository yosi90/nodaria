import { cardinalityIssues, type CardinalityIssue } from './cardinality';
import { nodeConnections } from './connections';
import { extractMentions, mentionIndex, normalizeName } from './notes';
import { isReferenceField } from './references';
import { allFields, getNode, typeMatches } from './selectors';
import type { FieldDefinition, Node, Project, Schema } from './types';

/*
 * Salud del mundo: lo que suele señalar un proyecto a medio hacer. Todo son avisos, no errores:
 * nodos sin conexiones, fichas con obligatorios vacíos, tipos sin instancias, límites de relación
 * superados, referencias a nodos que no existen o de un tipo no admitido, y menciones en notas
 * que no apuntan a ningún nodo.
 */

export interface IncompleteSheet {
  node: Node;
  /** Atributos obligatorios sin valor. */
  missing: FieldDefinition[];
}

export interface BrokenReference {
  node: Node;
  field: FieldDefinition;
  /** Id que ya no existe o nodo de un tipo que el atributo no admite. */
  targetId: string;
  reason: 'missing' | 'type';
}

export interface UnresolvedMention {
  node: Node;
  name: string;
}

export interface HealthReport {
  isolated: Node[];
  incomplete: IncompleteSheet[];
  unusedTypes: Schema[];
  cardinality: CardinalityIssue[];
  brokenReferences: BrokenReference[];
  unresolvedMentions: UnresolvedMention[];
  /** Número total de avisos. */
  total: number;
}

const isEmpty = (v: unknown) => v === undefined || v === null || v === '' || (Array.isArray(v) && !v.length);

/** Atributos obligatorios (no calculados) sin valor en un nodo. */
export function missingRequired(p: Project, node: Pick<Node, 'typeId' | 'values'>): FieldDefinition[] {
  return allFields(p, node.typeId).filter(f => f.required && f.type !== 'computed' && isEmpty(node.values[f.id]));
}

export const isIncomplete = (p: Project, node: Pick<Node, 'typeId' | 'values'>) => missingRequired(p, node).length > 0;

export function brokenReferences(p: Project): BrokenReference[] {
  const result: BrokenReference[] = [];
  p.nodes.forEach(node => {
    allFields(p, node.typeId)
      .filter(isReferenceField)
      .forEach(field => {
        const value = node.values[field.id];
        const ids = typeof value === 'string' ? [value] : Array.isArray(value) ? value : [];
        ids.forEach(targetId => {
          if (typeof targetId !== 'string' || !targetId) return;
          const target = getNode(p, targetId);
          if (!target) result.push({ node, field, targetId, reason: 'missing' });
          else if (!typeMatches(p, target.typeId, field.referenceTypeIds))
            result.push({ node, field, targetId, reason: 'type' });
        });
      });
  });
  return result;
}

export function unresolvedMentions(p: Project): UnresolvedMention[] {
  const index = mentionIndex(p);
  const result: UnresolvedMention[] = [];
  p.nodes.forEach(node => {
    extractMentions(node.notes).forEach(name => {
      if (!index.has(normalizeName(name))) result.push({ node, name });
    });
  });
  return result;
}

export function worldHealth(p: Project): HealthReport {
  const isolated = p.nodes.filter(n => (nodeConnections(p, n.id)?.total ?? 0) === 0);
  const incomplete = p.nodes
    .map(node => ({ node, missing: missingRequired(p, node) }))
    .filter(sheet => sheet.missing.length > 0);
  const usedEntityTypes = new Set(p.nodes.map(n => n.typeId));
  const usedRelationTypes = new Set(p.relations.map(r => r.typeId));
  const unusedTypes = p.schemas.filter(s =>
    s.kind === 'entity' ? !s.isAbstract && !usedEntityTypes.has(s.id) : !usedRelationTypes.has(s.id),
  );
  const cardinality = cardinalityIssues(p);
  const broken = brokenReferences(p);
  const mentions = unresolvedMentions(p);
  return {
    isolated,
    incomplete,
    unusedTypes,
    cardinality,
    brokenReferences: broken,
    unresolvedMentions: mentions,
    total:
      isolated.length + incomplete.length + unusedTypes.length + cardinality.length + broken.length + mentions.length,
  };
}
