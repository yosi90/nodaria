import { normalizeName } from './notes';
import { allFields, getNode, getSchema, nodeLabel } from './selectors';
import type { FieldDefinition, FieldValue, Node, Project } from './types';

/*
 * Fórmulas de los campos calculados. Una fórmula es texto libre con expresiones entre llaves:
 *
 *   {clave}                   valor de un atributo de este nodo (una referencia da el título del nodo referido)
 *   {clave.otra}              atributo «otra» del nodo al que apunta la referencia «clave»
 *   {titulo} {tipo}           título y tipo de este nodo
 *   {padre} {padre.clave}     título del nodo superior en «Dentro de», o uno de sus atributos
 *   {contar(relaciones)}      número de relaciones del nodo; {contar(relaciones:Amistad)} solo de ese tipo
 *   {contar(hijos)}           número de subnodos; {contar(clave)} elementos de una lista o de referencias múltiples
 *   {lista(relaciones)}       títulos de los nodos relacionados; {lista(relaciones:Amistad)} o {lista(hijos)}
 *
 * Las expresiones desconocidas se sustituyen por nada. Los calculados pueden citar a otros calculados
 * hasta una profundidad limitada para evitar bucles.
 */

const MAX_DEPTH = 4;
const EXPRESSION = /\{([^{}]+)\}/g;

const sameName = (a: string, b: string) => normalizeName(a) === normalizeName(b);

export function evaluateFormula(p: Project, node: Node, formula: string, depth = 0): string {
  if (depth > MAX_DEPTH) return '';
  return formula.replace(EXPRESSION, (_, raw: string) => evaluateExpression(p, node, raw.trim(), depth));
}

function evaluateExpression(p: Project, node: Node, expression: string, depth: number): string {
  const call = /^(contar|lista)\s*\(\s*([^)]*)\s*\)$/i.exec(expression);
  if (call) return evaluateCall(p, node, call[1].toLowerCase(), call[2].trim());

  const [head, ...rest] = expression.split('.').map(part => part.trim());
  const path = rest.join('.');
  const lower = normalizeName(head);

  if (lower === 'titulo') return nodeLabel(p, node);
  if (lower === 'tipo') return getSchema(p, node.typeId)?.name ?? '';
  if (lower === 'padre') {
    const parent = node.parentId ? getNode(p, node.parentId) : undefined;
    if (!parent) return '';
    return path ? evaluateExpression(p, parent, path, depth + 1) : nodeLabel(p, parent);
  }

  const field = findField(p, node, head);
  if (!field) return '';
  return path ? valueThrough(p, node, field, path, depth) : valueText(p, node, field, depth);
}

function findField(p: Project, node: Node, key: string) {
  return allFields(p, node.typeId).find(f => sameName(f.key, key) || sameName(f.label, key));
}

/** Nodos a los que apunta un atributo de referencia (uno o varios). */
function referencedNodes(p: Project, value: FieldValue): Node[] {
  const ids = typeof value === 'string' ? [value] : Array.isArray(value) ? value : [];
  return ids.map(id => getNode(p, id)).filter((n): n is Node => Boolean(n));
}

function valueText(p: Project, node: Node, field: FieldDefinition, depth: number): string {
  const value = node.values[field.id];
  if (field.type === 'computed') return evaluateFormula(p, node, field.formula, depth + 1);
  if (field.type === 'nodeRef' || field.type === 'nodeRefs') {
    return referencedNodes(p, value)
      .map(n => nodeLabel(p, n))
      .join(', ');
  }
  if (field.type === 'boolean') return value ? 'Sí' : 'No';
  if (Array.isArray(value)) return value.join(', ');
  return value === null || value === undefined ? '' : String(value);
}

/** `{referencia.atributo}`: el atributo se lee en los nodos referidos. */
function valueThrough(p: Project, node: Node, field: FieldDefinition, path: string, depth: number): string {
  if (field.type !== 'nodeRef' && field.type !== 'nodeRefs') return '';
  return referencedNodes(p, node.values[field.id])
    .map(target => evaluateExpression(p, target, path, depth + 1))
    .filter(Boolean)
    .join(', ');
}

/** Relaciones del nodo en cualquier sentido, opcionalmente solo de un tipo (por nombre). */
function relationsOf(p: Project, node: Node, typeName: string) {
  return p.relations.filter(r => {
    if (r.sourceId !== node.id && r.targetId !== node.id) return false;
    if (!typeName) return true;
    const schema = getSchema(p, r.typeId);
    return Boolean(schema && sameName(schema.name, typeName));
  });
}

function evaluateCall(p: Project, node: Node, fn: string, argument: string): string {
  const [subject, typeName = ''] = argument.split(':').map(part => part.trim());
  const lower = normalizeName(subject);
  let items: Node[] | FieldValue[];

  if (lower === 'relaciones') {
    items = relationsOf(p, node, typeName)
      .map(r => getNode(p, r.sourceId === node.id ? r.targetId : r.sourceId))
      .filter((n): n is Node => Boolean(n));
  } else if (lower === 'hijos') {
    items = p.nodes.filter(n => n.parentId === node.id);
  } else {
    const field = findField(p, node, subject);
    if (!field) return '';
    const value = node.values[field.id];
    if (field.type === 'nodeRef' || field.type === 'nodeRefs') items = referencedNodes(p, value);
    else items = Array.isArray(value) ? value : value === null || value === undefined || value === '' ? [] : [value];
  }

  if (fn === 'contar') return String(items.length);
  return items.map(item => (isNode(item) ? nodeLabel(p, item) : String(item))).join(', ');
}

const isNode = (item: Node | FieldValue): item is Node => typeof item === 'object' && item !== null && 'typeId' in item;
