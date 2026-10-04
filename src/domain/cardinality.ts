import { getNode, getSchema, nodeLabel } from './selectors';
import type { Node, Project, Schema } from './types';

/*
 * Restricciones de cardinalidad de los tipos de relación: cuántas relaciones de un tipo puede tener
 * un nodo como origen (`maxPerSource`) y como destino (`maxPerTarget`); `null` = sin límite. En las
 * relaciones sin sentido solo cuenta `maxPerSource`, aplicado a cada nodo en cualquiera de los extremos.
 * Superar un límite no se impide: se avisa en la ficha y al crear la relación.
 */

export type CardinalityEnd = 'source' | 'target' | 'any';

export interface CardinalityIssue {
  schema: Schema;
  node: Node;
  end: CardinalityEnd;
  count: number;
  max: number;
}

/** Relaciones de `schema` en las que el nodo ocupa el extremo indicado (`any`: cualquiera). */
export function relationCount(p: Project, schema: Schema, nodeId: string, end: CardinalityEnd) {
  return p.relations.filter(
    r =>
      r.typeId === schema.id &&
      (end === 'source'
        ? r.sourceId === nodeId
        : end === 'target'
          ? r.targetId === nodeId
          : r.sourceId === nodeId || r.targetId === nodeId),
  ).length;
}

/** Límites que un tipo aplica a un nodo, con el extremo al que se refieren. */
function limitsOf(schema: Schema): { end: CardinalityEnd; max: number }[] {
  if (!schema.directed) return schema.maxPerSource !== null ? [{ end: 'any', max: schema.maxPerSource }] : [];
  const limits: { end: CardinalityEnd; max: number }[] = [];
  if (schema.maxPerSource !== null) limits.push({ end: 'source', max: schema.maxPerSource });
  if (schema.maxPerTarget !== null) limits.push({ end: 'target', max: schema.maxPerTarget });
  return limits;
}

/** Límites superados en todo el proyecto o solo para un nodo. */
export function cardinalityIssues(p: Project, nodeId?: string): CardinalityIssue[] {
  const issues: CardinalityIssue[] = [];
  const nodes = nodeId ? [getNode(p, nodeId)].filter((n): n is Node => Boolean(n)) : p.nodes;
  for (const schema of p.schemas) {
    if (schema.kind !== 'relationship') continue;
    const limits = limitsOf(schema);
    if (!limits.length) continue;
    for (const node of nodes) {
      for (const { end, max } of limits) {
        const count = relationCount(p, schema, node.id, end);
        if (count > max) issues.push({ schema, node, end, count, max });
      }
    }
  }
  return issues;
}

export function describeIssue(p: Project, issue: CardinalityIssue) {
  const role = issue.end === 'source' ? ' como origen' : issue.end === 'target' ? ' como destino' : '';
  return `${nodeLabel(p, issue.node)} tiene ${issue.count} relaciones «${issue.schema.name}»${role}; el máximo es ${issue.max}.`;
}

/** Aviso si crear una relación de ese tipo entre esos nodos superaría un límite, o `null`. */
export function cardinalityWarning(p: Project, typeId: string, sourceId: string, targetId: string): string | null {
  const schema = getSchema(p, typeId);
  if (!schema) return null;
  for (const { end, max } of limitsOf(schema)) {
    const nodeIds = end === 'source' ? [sourceId] : end === 'target' ? [targetId] : [sourceId, targetId];
    for (const nodeId of nodeIds) {
      const node = getNode(p, nodeId);
      if (!node) continue;
      const count = relationCount(p, schema, nodeId, end);
      if (count + 1 > max) {
        const role = end === 'source' ? ' como origen' : end === 'target' ? ' como destino' : '';
        return `${nodeLabel(p, node)} ya tiene ${count} ${count === 1 ? 'relación' : 'relaciones'} «${schema.name}»${role}; el máximo es ${max}.`;
      }
    }
  }
  return null;
}
