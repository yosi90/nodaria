import {
  daysBetween,
  formatDate,
  formatDateValue,
  monthName,
  parseDate,
  todayOf,
  weekdayOf,
  yearsBetween,
  type WorldDate,
} from './calendar';
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
 * Fechas (con el calendario del mundo, `src/domain/calendar.ts`):
 *
 *   {hoy}                     la fecha actual del mundo; {fecha} se lee «3 de Brumal de 1043»
 *   {fecha.dia} {fecha.mes} {fecha.anio} {fecha.diasemana}   partes de una fecha (también {hoy.anio})
 *   {edad(nacimiento)}        años cumplidos desde esa fecha hasta hoy; {edad(nacimiento, muerte)} entre dos fechas
 *   {dias(desde, hasta)}      días entre dos fechas ({dias(fecha)} hasta hoy); {diasemana(fecha)} nombre del día
 *   Cada argumento es un atributo de fecha (también a través de una referencia: {edad(padre.nacimiento)}),
 *   «hoy» o una fecha literal AAAA-MM-DD.
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
  const call = /^(contar|lista|edad|dias|diasemana)\s*\(\s*([^)]*)\s*\)$/i.exec(expression);
  if (call) {
    const fn = normalizeName(call[1]);
    if (fn === 'contar' || fn === 'lista') return evaluateCall(p, node, fn, call[2].trim());
    return evaluateDateCall(p, node, fn, call[2], depth);
  }

  const [head, ...rest] = expression.split('.').map(part => part.trim());
  const path = rest.join('.');
  const lower = normalizeName(head);

  if (lower === 'hoy') {
    const today = todayOf(p.calendar);
    return path ? datePart(p, today, path) : formatDate(p.calendar, today);
  }
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
  if (field.type === 'date') return formatDateValue(p.calendar, value);
  if (Array.isArray(value)) return value.join(', ');
  return value === null || value === undefined ? '' : String(value);
}

/** `{referencia.atributo}`: el atributo se lee en los nodos referidos. `{fecha.parte}`: una parte de la fecha. */
function valueThrough(p: Project, node: Node, field: FieldDefinition, path: string, depth: number): string {
  if (field.type === 'date') {
    const date = parseDate(node.values[field.id]);
    return date ? datePart(p, date, path) : '';
  }
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

/** Parte de una fecha: día, mes (por nombre), año o día de la semana. */
function datePart(p: Project, date: WorldDate, part: string): string {
  const lower = normalizeName(part);
  if (lower === 'dia') return String(date.day);
  if (lower === 'mes') return monthName(p.calendar, date.month);
  if (lower === 'anio' || lower === 'ano' || lower === 'year') return String(date.year);
  if (lower === 'diasemana') return weekdayOf(p.calendar, date);
  return '';
}

/**
 * Un argumento de fecha: «hoy», un atributo de fecha de este nodo (o a través de una referencia,
 * `padre.nacimiento`), o una fecha literal `AAAA-MM-DD`.
 */
function resolveDate(p: Project, node: Node, argument: string, depth: number): WorldDate | null {
  const text = argument.trim();
  if (!text) return null;
  if (normalizeName(text) === 'hoy') return todayOf(p.calendar);
  const literal = parseDate(text);
  if (literal) return literal;
  const [head, ...rest] = text.split('.').map(part => part.trim());
  if (!rest.length) {
    const field = findField(p, node, head);
    return field ? parseDate(node.values[field.id]) : null;
  }
  // A través de una referencia o de «padre»: se resuelve el nodo destino y se lee allí el atributo.
  const targets = targetNodes(p, node, head);
  for (const target of targets) {
    const date = resolveDate(p, target, rest.join('.'), depth + 1);
    if (date) return date;
  }
  return null;
}

/** Nodos a los que lleva un paso de una ruta: «padre» o una referencia. */
function targetNodes(p: Project, node: Node, step: string): Node[] {
  if (normalizeName(step) === 'padre') {
    const parent = node.parentId ? getNode(p, node.parentId) : undefined;
    return parent ? [parent] : [];
  }
  const field = findField(p, node, step);
  if (!field || (field.type !== 'nodeRef' && field.type !== 'nodeRefs')) return [];
  return referencedNodes(p, node.values[field.id]);
}

/** `edad(desde[, hasta])`, `dias(desde[, hasta])` y `diasemana(fecha)`. Sin «hasta» se cuenta hasta hoy. */
function evaluateDateCall(p: Project, node: Node, fn: string, argument: string, depth: number): string {
  if (depth > MAX_DEPTH) return '';
  const [first = '', second = ''] = argument.split(',');
  const from = resolveDate(p, node, first, depth);
  if (!from) return '';
  if (fn === 'diasemana') return weekdayOf(p.calendar, from);
  const to = second.trim() ? resolveDate(p, node, second, depth) : todayOf(p.calendar);
  if (!to) return '';
  if (fn === 'edad') return String(yearsBetween(from, to));
  return String(daysBetween(p.calendar, from, to));
}
