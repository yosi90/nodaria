import { formatDate, formatDateValue, todayOf } from './calendar';
import { GENDERS } from './constants';
import { allFields, fieldValue, getSchema, nodeLabel, relationRole } from './selectors';
import type { FieldDefinition, FieldValue, Node, Project } from './types';

/*
 * Contexto de las preguntas a la IA sobre el mundo (PENDIENTES.md, Fase 8). Copia del contrato de la
 * API (`api/src/ai/world.ts`): si cambia uno, cambia el otro.
 *
 * El proyecto va en forma compacta: tipos con sus atributos, nodos con sus valores legibles y sus notas,
 * y relaciones. Los nodos se nombran n1, n2… (más corto que sus ids, y el modelo los cita así); `refs`
 * los traduce de vuelta. Si el proyecto pasa del tamaño máximo, se recortan primero las notas y, si no
 * basta, se quedan los nodos más conectados; `partial` lo dice.
 */

export interface AiWorldContext {
  projectName: string;
  today: string;
  partial: boolean;
  types: { name: string; kind: 'entidad' | 'relación'; description: string; attributes: string[] }[];
  nodes: {
    id: string;
    type: string;
    title: string;
    parent: string | null;
    values: Record<string, string>;
    notes: string;
  }[];
  relations: {
    type: string;
    from: string;
    to: string;
    fromRole: string;
    toRole: string;
    values: Record<string, string>;
  }[];
}

export interface AiWorldRefs {
  nodes: Record<string, string>;
}

/** Tamaño máximo del contexto en caracteres de JSON (unos 100 000 tokens). */
export const WORLD_BUDGET = 400_000;
const NOTE_STEPS = [Infinity, 2000, 600, 0];
const MAX_VALUE = 1000;

const clip = (text: string, max: number) => (text.length > max ? `${text.slice(0, max)}…` : text);

/** Valor legible de un atributo; las referencias, como n12. Vacío si no hay nada que contar. */
function readable(p: Project, field: FieldDefinition, value: FieldValue | undefined, ids: Map<string, string>) {
  if (value === undefined || value === null || value === '') return '';
  const ref = (id: string) => ids.get(id) ?? '';
  switch (field.type) {
    case 'nodeRef':
      return typeof value === 'string' ? ref(value) : '';
    case 'nodeRefs':
      return Array.isArray(value) ? value.map(ref).filter(Boolean).join(', ') : '';
    case 'boolean':
      return value ? 'Sí' : 'No';
    case 'date':
      return formatDateValue(p.calendar, value);
    case 'gender':
      return GENDERS.find(([id]) => id === value)?.[1] ?? String(value);
    case 'image':
      return 'tiene imagen';
    case 'list':
      return Array.isArray(value) ? value.map((x, i) => `${i + 1}. ${x}`).join('; ') : String(value);
    case 'scale':
      return `${value} de 5`;
    default:
      return clip(Array.isArray(value) ? value.join(', ') : String(value), MAX_VALUE);
  }
}

function valuesOf(
  p: Project,
  owner: { values: Record<string, FieldValue> },
  typeId: string,
  ids: Map<string, string>,
  node?: Node,
) {
  const fields = allFields(p, typeId);
  const values: Record<string, string> = {};
  for (const field of fields) {
    if (field.isTitle) continue;
    const value = node ? fieldValue(field, owner.values, fields, { project: p, node }) : owner.values[field.id];
    const text = readable(p, field, value, ids);
    if (text) values[field.label] = text;
  }
  return values;
}

export function worldContext(p: Project, budget = WORLD_BUDGET): { context: AiWorldContext; refs: AiWorldRefs } {
  // Los más conectados primero: si hay que dejar nodos fuera, se quedan los centrales.
  const degree = new Map<string, number>();
  for (const r of p.relations) {
    degree.set(r.sourceId, (degree.get(r.sourceId) ?? 0) + 1);
    degree.set(r.targetId, (degree.get(r.targetId) ?? 0) + 1);
  }
  for (const n of p.nodes) if (n.parentId) degree.set(n.parentId, (degree.get(n.parentId) ?? 0) + 1);
  const ordered = [...p.nodes].sort((a, b) => (degree.get(b.id) ?? 0) - (degree.get(a.id) ?? 0));
  const ids = new Map(ordered.map((n, i) => [n.id, `n${i + 1}`]));
  const refs: AiWorldRefs = { nodes: Object.fromEntries([...ids].map(([id, short]) => [short, id])) };

  const types = p.schemas
    .filter(s => !s.isAbstract || s.kind === 'relationship')
    .map(s => ({
      name: s.name,
      kind: s.kind === 'entity' ? ('entidad' as const) : ('relación' as const),
      description: clip(s.description, 2000),
      attributes: allFields(p, s.id).map(f => f.label),
    }));
  const allNodes = ordered.map(n => ({
    id: ids.get(n.id)!,
    type: getSchema(p, n.typeId)?.name ?? '',
    title: clip(nodeLabel(p, n), 500),
    parent: n.parentId ? (ids.get(n.parentId) ?? null) : null,
    values: valuesOf(p, n, n.typeId, ids, n),
    notes: n.notes.trim(),
  }));
  const allRelations = p.relations.flatMap(r => {
    const from = ids.get(r.sourceId);
    const to = ids.get(r.targetId);
    if (!from || !to) return [];
    const name = getSchema(p, r.typeId)?.name ?? '';
    const role = (end: 'source' | 'target') => {
      const text = relationRole(p, r, end);
      return text === name ? '' : text;
    };
    return [
      { type: name, from, to, fromRole: role('source'), toRole: role('target'), values: valuesOf(p, r, r.typeId, ids) },
    ];
  });

  const build = (noteLimit: number, nodeCount: number): AiWorldContext => {
    const nodes = allNodes.slice(0, nodeCount).map(n => ({ ...n, notes: noteLimit ? clip(n.notes, noteLimit) : '' }));
    const kept = new Set(nodes.map(n => n.id));
    return {
      projectName: p.name,
      today: formatDate(p.calendar, todayOf(p.calendar)),
      partial: noteLimit !== Infinity || nodeCount < allNodes.length,
      types,
      nodes: nodes.map(n => ({ ...n, parent: n.parent && kept.has(n.parent) ? n.parent : null })),
      relations: allRelations.filter(r => kept.has(r.from) && kept.has(r.to)),
    };
  };
  const fits = (c: AiWorldContext) => JSON.stringify(c).length <= budget;
  for (const limit of NOTE_STEPS) {
    const context = build(limit, allNodes.length);
    if (fits(context)) return { context, refs };
  }
  // Ni sin notas cabe: se quitan nodos de los menos conectados, a mitades, hasta que quepa.
  let count = allNodes.length;
  let context = build(0, count);
  while (count > 1 && !fits(context)) {
    count = Math.floor(count * 0.75);
    context = build(0, count);
  }
  return { context, refs };
}

/** Partes de una respuesta: texto y menciones [[n12]] a nodos (para enlazarlos). */
export function answerParts(text: string): ({ kind: 'text'; text: string } | { kind: 'node'; ref: string })[] {
  const parts: ({ kind: 'text'; text: string } | { kind: 'node'; ref: string })[] = [];
  let last = 0;
  for (const match of text.matchAll(/\[\[(n\d{1,5})\]\]/g)) {
    if (match.index > last) parts.push({ kind: 'text', text: text.slice(last, match.index) });
    parts.push({ kind: 'node', ref: match[1] });
    last = match.index + match[0].length;
  }
  if (last < text.length) parts.push({ kind: 'text', text: text.slice(last) });
  return parts;
}
