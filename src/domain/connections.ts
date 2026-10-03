import { mentionedNodes, mentioningNodes } from './notes';
import { referenceFields, referenceLinks, type ReferenceField } from './references';
import { getNode, getSchema } from './selectors';
import type { Node, Project, Relation, Schema } from './types';

/*
 * Todo lo que conecta a un nodo con otros, para la pestaña "Conexiones": jerarquía, relaciones
 * en ambos sentidos, referencias que hace y que recibe, y menciones en notas.
 */

export interface RelationConnection {
  relation: Relation;
  schema: Schema | undefined;
  other: Node;
  /** `out`: el nodo es el origen; `in`: el destino. */
  direction: 'out' | 'in';
}

export interface ReferenceConnection {
  field: ReferenceField;
  other: Node;
}

export interface NodeConnections {
  parent: Node | null;
  children: Node[];
  relations: RelationConnection[];
  referencesOut: ReferenceConnection[];
  referencesIn: ReferenceConnection[];
  mentionsOut: Node[];
  mentionsIn: Node[];
  total: number;
}

export function nodeConnections(p: Project, nodeId: string): NodeConnections | null {
  const node = getNode(p, nodeId);
  if (!node) return null;
  const parent = node.parentId ? (getNode(p, node.parentId) ?? null) : null;
  const children = p.nodes.filter(n => n.parentId === nodeId);
  const relations: RelationConnection[] = [];
  p.relations.forEach(relation => {
    if (relation.sourceId !== nodeId && relation.targetId !== nodeId) return;
    const direction = relation.sourceId === nodeId ? 'out' : 'in';
    const other = getNode(p, direction === 'out' ? relation.targetId : relation.sourceId);
    if (other) relations.push({ relation, schema: getSchema(p, relation.typeId), other, direction });
  });
  const fields = new Map(referenceFields(p).map(f => [f.field.id, f]));
  const referencesOut: ReferenceConnection[] = [];
  const referencesIn: ReferenceConnection[] = [];
  referenceLinks(p).forEach(link => {
    const field = fields.get(link.fieldId);
    if (!field) return;
    if (link.sourceId === nodeId) {
      const other = getNode(p, link.targetId);
      if (other) referencesOut.push({ field, other });
    } else if (link.targetId === nodeId) {
      const other = getNode(p, link.sourceId);
      if (other) referencesIn.push({ field, other });
    }
  });
  const mentionsOut = mentionedNodes(p, node);
  const mentionsIn = mentioningNodes(p, node);
  return {
    parent,
    children,
    relations,
    referencesOut,
    referencesIn,
    mentionsOut,
    mentionsIn,
    total:
      (parent ? 1 : 0) +
      children.length +
      relations.length +
      referencesOut.length +
      referencesIn.length +
      mentionsOut.length +
      mentionsIn.length,
  };
}
