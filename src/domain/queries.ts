import { normalizeName } from './notes';
import { allFields, typeMatches } from './selectors';
import type { FieldDefinition, Node, Project } from './types';

/*
 * Consultas guardadas: «Personajes sin dios patrón», «Magos que no pertenecen a ninguna escuela».
 * Una consulta elige un tipo de entidad (sus subtipos cuentan) y una lista de condiciones que deben
 * cumplirse todas. Se guardan en el proyecto y se sincronizan con él.
 */

export type FieldOp = 'empty' | 'notEmpty' | 'equals' | 'notEquals' | 'contains' | 'gt' | 'lt';

export type QueryCondition =
  | { kind: 'field'; fieldId: string; op: FieldOp; value: string }
  | { kind: 'relation'; typeId: string | null; presence: 'has' | 'lacks'; end: 'any' | 'source' | 'target' }
  | { kind: 'parent'; presence: 'has' | 'lacks' }
  | { kind: 'children'; presence: 'has' | 'lacks' };

export interface SavedQuery {
  id: string;
  name: string;
  typeId: string;
  conditions: QueryCondition[];
}

export const FIELD_OPS: ReadonlyArray<[FieldOp, string]> = [
  ['empty', 'está vacío'],
  ['notEmpty', 'tiene valor'],
  ['equals', 'es'],
  ['notEquals', 'no es'],
  ['contains', 'contiene'],
  ['gt', 'es mayor que'],
  ['lt', 'es menor que'],
];

const isEmpty = (v: unknown) => v === undefined || v === null || v === '' || (Array.isArray(v) && !v.length);

function textOf(p: Project, field: FieldDefinition, value: unknown): string[] {
  if (field.type === 'nodeRef' || field.type === 'nodeRefs') {
    const ids = typeof value === 'string' ? [value] : Array.isArray(value) ? value : [];
    return ids.map(id => {
      const node = p.nodes.find(n => n.id === id);
      if (!node) return '';
      const title = allFields(p, node.typeId).find(f => f.isTitle);
      return String((title && node.values[title.id]) || '');
    });
  }
  if (field.type === 'boolean') return [value ? 'sí' : 'no'];
  return Array.isArray(value) ? value.map(String) : [String(value ?? '')];
}

function matchesField(p: Project, node: Node, condition: Extract<QueryCondition, { kind: 'field' }>): boolean {
  const field = allFields(p, node.typeId).find(f => f.id === condition.fieldId);
  if (!field) return false;
  const value = node.values[field.id];
  if (condition.op === 'empty') return isEmpty(value);
  if (condition.op === 'notEmpty') return !isEmpty(value);
  const texts = textOf(p, field, value).map(normalizeName);
  const expected = normalizeName(condition.value);
  switch (condition.op) {
    case 'equals':
      return texts.some(t => t === expected);
    case 'notEquals':
      return !texts.some(t => t === expected);
    case 'contains':
      return texts.some(t => t.includes(expected));
    case 'gt':
    case 'lt': {
      const n = Number(value);
      const e = Number(condition.value);
      if (Number.isNaN(n) || Number.isNaN(e)) return false;
      return condition.op === 'gt' ? n > e : n < e;
    }
  }
}

function matchesRelation(p: Project, node: Node, c: Extract<QueryCondition, { kind: 'relation' }>): boolean {
  const has = p.relations.some(r => {
    if (c.typeId && r.typeId !== c.typeId) return false;
    if (c.end === 'source') return r.sourceId === node.id;
    if (c.end === 'target') return r.targetId === node.id;
    return r.sourceId === node.id || r.targetId === node.id;
  });
  return c.presence === 'has' ? has : !has;
}

export function matchesQuery(p: Project, node: Node, query: SavedQuery): boolean {
  if (!typeMatches(p, node.typeId, [query.typeId])) return false;
  return query.conditions.every(c => {
    switch (c.kind) {
      case 'field':
        return matchesField(p, node, c);
      case 'relation':
        return matchesRelation(p, node, c);
      case 'parent':
        return c.presence === 'has' ? node.parentId !== null : node.parentId === null;
      case 'children': {
        const has = p.nodes.some(n => n.parentId === node.id);
        return c.presence === 'has' ? has : !has;
      }
    }
  });
}

export const runQuery = (p: Project, query: SavedQuery): Node[] => p.nodes.filter(n => matchesQuery(p, n, query));

/** Texto legible de una condición («Dios patrón está vacío», «sin relación Amistad»). */
export function describeCondition(p: Project, typeId: string, c: QueryCondition): string {
  switch (c.kind) {
    case 'field': {
      const field = allFields(p, typeId).find(f => f.id === c.fieldId);
      const label = field?.label ?? '?';
      const op = FIELD_OPS.find(([key]) => key === c.op)?.[1] ?? c.op;
      return c.op === 'empty' || c.op === 'notEmpty' ? `${label} ${op}` : `${label} ${op} «${c.value}»`;
    }
    case 'relation': {
      const type = c.typeId ? (p.schemas.find(s => s.id === c.typeId)?.name ?? '?') : 'de cualquier tipo';
      const end = c.end === 'source' ? ' como origen' : c.end === 'target' ? ' como destino' : '';
      return `${c.presence === 'has' ? 'con' : 'sin'} relación ${type}${end}`;
    }
    case 'parent':
      return c.presence === 'has' ? 'con nodo superior' : 'sin nodo superior';
    case 'children':
      return c.presence === 'has' ? 'con subnodos' : 'sin subnodos';
  }
}
