import { allFields, descendants, getNode, nodeLabel } from './selectors';
import type { FieldDefinition, FieldValue, Node, Project } from './types';

/*
 * Atributos condicionados por otros atributos del mismo tipo:
 *  - `visibleWhen`: el atributo solo se muestra cuando otra lista de opciones vale alguna de las
 *    opciones indicadas (un Documento solo tiene «Importe» si es Factura). El valor no se borra al
 *    ocultarse: si cambias de opinión, sigue ahí.
 *  - `referenceWithin`: una referencia solo ofrece los nodos que cuelgan (en la jerarquía «Dentro
 *    de») del nodo elegido en otra referencia («Ramas» solo las del «Tipo de magia» elegido).
 *  - `maxItemsBy`: una referencia múltiple (o etiquetas) admite como máximo tantos elementos como
 *    diga la opción elegida en otra lista (Menor → 1, Intermedia → 3; sin entrada = sin límite).
 *    Como el resto de límites, se avisa sin bloquear.
 */

type Values = Record<string, FieldValue>;

/** Si el atributo se muestra con estos valores. Una condición que apunta a un atributo inexistente no oculta nada. */
export function isFieldVisible(fields: FieldDefinition[], field: FieldDefinition, values: Values): boolean {
  const rule = field.visibleWhen;
  if (!rule || field.id === rule.fieldId) return true;
  const other = fields.find(f => f.id === rule.fieldId);
  if (!other) return true;
  const value = values[other.id];
  return rule.options.includes(String(value ?? ''));
}

/** Atributos efectivos de un nodo que se muestran con sus valores actuales. */
export function visibleFields(p: Project, node: Pick<Node, 'typeId' | 'values'>): FieldDefinition[] {
  const fields = allFields(p, node.typeId);
  return fields.filter(f => isFieldVisible(fields, f, node.values));
}

/**
 * Ids admitidos por una referencia dependiente, o `null` si no depende de nada (o la otra referencia
 * está vacía: entonces no se restringe, para no dejar el selector sin opciones sin explicación).
 */
export function referenceScope(p: Project, field: FieldDefinition, values: Values): Set<string> | null {
  if (!field.referenceWithin) return null;
  const within = values[field.referenceWithin];
  const parentId = typeof within === 'string' ? within : Array.isArray(within) ? within[0] : null;
  if (!parentId || !getNode(p, parentId)) return null;
  const scope = descendants(p, parentId);
  scope.delete(parentId);
  return scope;
}

/** Máximo de elementos de una referencia múltiple según la opción elegida en otra lista; `null` = sin límite. */
export function referenceLimit(fields: FieldDefinition[], field: FieldDefinition, values: Values): number | null {
  const rule = field.maxItemsBy;
  if (!rule) return null;
  const other = fields.find(f => f.id === rule.fieldId);
  if (!other) return null;
  const max = rule.limits[String(values[other.id] ?? '')];
  return typeof max === 'number' && Number.isFinite(max) && max >= 0 ? max : null;
}

export interface ReferenceLimitIssue {
  node: Node;
  field: FieldDefinition;
  count: number;
  max: number;
}

/** Nodos con más elementos en una referencia múltiple de los que permite su límite. */
export function referenceLimitIssues(p: Project, nodeId?: string): ReferenceLimitIssue[] {
  const nodes = nodeId ? [getNode(p, nodeId)].filter((n): n is Node => Boolean(n)) : p.nodes;
  const issues: ReferenceLimitIssue[] = [];
  nodes.forEach(node => {
    const fields = allFields(p, node.typeId);
    fields.forEach(field => {
      if (!field.maxItemsBy || !isFieldVisible(fields, field, node.values)) return;
      const max = referenceLimit(fields, field, node.values);
      const value = node.values[field.id];
      const count = Array.isArray(value) ? value.length : value ? 1 : 0;
      if (max !== null && count > max) issues.push({ node, field, count, max });
    });
  });
  return issues;
}

export function describeLimitIssue(p: Project, issue: ReferenceLimitIssue): string {
  const other = allFields(p, issue.node.typeId).find(f => f.id === issue.field.maxItemsBy?.fieldId);
  const reason = other ? ` según «${other.label}: ${String(issue.node.values[other.id] ?? '')}»` : '';
  return `${nodeLabel(p, issue.node)} tiene ${issue.count} en «${issue.field.label}»; el máximo es ${issue.max}${reason}.`;
}
