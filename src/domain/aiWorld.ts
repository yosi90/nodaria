import { compareEntries, kindLabel, mentionedInEntry, todayText } from './agenda';
import { formatDate, formatDateValue, todayOf } from './calendar';
import { mentionIndex } from './notes';
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
 *
 * La agenda (notas, tareas, entregas y eventos en días reales) solo va si la persona lo permite en el
 * asistente para ese proyecto (`includeAgenda`); por defecto, no sale del navegador.
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
  /** Solo con permiso: la agenda del proyecto, en fechas reales. */
  agenda?: {
    /** Hoy en el calendario real (la agenda no usa el del mundo). */
    today: string;
    entries: AiAgendaEntry[];
  };
}

export interface AiAgendaEntry {
  kind: string;
  title: string;
  date: string;
  endDate: string | null;
  time: string | null;
  /** Tareas y entregas: si está hecha; `null` en notas y eventos. */
  done: boolean | null;
  description: string;
  /** Nodos enlazados o mencionados (n1, n2…). */
  nodes: string[];
}

/** Máximo de entradas de la agenda en el contexto: las más cercanas a hoy. */
export const AGENDA_LIMIT = 500;
const AGENDA_DESCRIPTION = 1000;

export interface AiWorldRefs {
  nodes: Record<string, string>;
}

/**
 * Tamaño máximo del contexto en caracteres de JSON (unos 100 000 tokens). La API rechaza, sin llamar a la
 * IA, el que pase de él (`AI_CONTEXT_BUDGET` en `api/src/routes/ai.ts`).
 */
export const WORLD_BUDGET = 400_000;
/**
 * Lo que pueden ocupar en bytes el contexto y sus referencias juntos: deja sitio a la pregunta dentro del
 * cuerpo que admite la API (`AI_BODY_LIMIT`, 640 KiB, en `api/src/routes/ai.ts`). Un acento ocupa 2 bytes.
 */
export const AI_BODY_BUDGET = 600 * 1024;
/** Los bytes que ocupa un valor como JSON en UTF-8, como lo cuenta la API. */
export const jsonBytes = (value: unknown) => new TextEncoder().encode(JSON.stringify(value)).length;
/** Los topes de cada campo en la API (`worldContextSchema`): por encima, la petición no valdría. */
const LIMITS = {
  name: 200,
  today: 100,
  note: 8000,
  value: 4000,
  types: 1000,
  attributes: 300,
  nodes: 5000,
  relations: 20_000,
};
const NOTE_STEPS = [LIMITS.note, 2000, 600, 0];
/** Un texto libre; las listas y las referencias pueden llegar hasta `LIMITS.value`. */
const MAX_VALUE = 1000;
const AGENDA_NODES = 200;

/** Como mucho `max` caracteres, con la elipsis incluida. */
const clip = (text: string, max: number) => (text.length > max ? `${text.slice(0, max - 1)}…` : text);

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
    if (text) values[clip(field.label, LIMITS.name)] = clip(text, LIMITS.value);
  }
  return values;
}

export function worldContext(
  p: Project,
  budget = WORLD_BUDGET,
  options: { includeAgenda?: boolean } = {},
): { context: AiWorldContext; refs: AiWorldRefs } {
  // Los más conectados primero: si hay que dejar nodos fuera, se quedan los centrales.
  const degree = new Map<string, number>();
  for (const r of p.relations) {
    degree.set(r.sourceId, (degree.get(r.sourceId) ?? 0) + 1);
    degree.set(r.targetId, (degree.get(r.targetId) ?? 0) + 1);
  }
  for (const n of p.nodes) if (n.parentId) degree.set(n.parentId, (degree.get(n.parentId) ?? 0) + 1);
  const ordered = [...p.nodes].sort((a, b) => (degree.get(b.id) ?? 0) - (degree.get(a.id) ?? 0));
  const ids = new Map(ordered.map((n, i) => [n.id, `n${i + 1}`]));
  const name = (text: string) => clip(text, LIMITS.name);

  const types = p.schemas
    .filter(s => !s.isAbstract || s.kind === 'relationship')
    .slice(0, LIMITS.types)
    .map(s => ({
      name: name(s.name),
      kind: s.kind === 'entity' ? ('entidad' as const) : ('relación' as const),
      description: clip(s.description, 2000),
      attributes: allFields(p, s.id)
        .slice(0, LIMITS.attributes)
        .map(f => name(f.label)),
    }));
  const allNodes = ordered.map(n => ({
    id: ids.get(n.id)!,
    type: name(getSchema(p, n.typeId)?.name ?? ''),
    title: clip(nodeLabel(p, n), 500),
    parent: n.parentId ? (ids.get(n.parentId) ?? null) : null,
    values: valuesOf(p, n, n.typeId, ids, n),
    notes: n.notes.trim(),
  }));
  const allRelations = p.relations.flatMap(r => {
    const from = ids.get(r.sourceId);
    const to = ids.get(r.targetId);
    if (!from || !to) return [];
    const type = getSchema(p, r.typeId)?.name ?? '';
    const role = (end: 'source' | 'target') => {
      const text = relationRole(p, r, end);
      return text === type ? '' : name(text);
    };
    return [
      {
        type: name(type),
        from,
        to,
        fromRole: role('source'),
        toRole: role('target'),
        values: valuesOf(p, r, r.typeId, ids),
      },
    ];
  });

  // La agenda tiene su parte del presupuesto (una cuarta parte): el resto es para el mundo.
  const agenda = options.includeAgenda ? agendaContext(p, ids, budget / 4) : null;

  const build = (noteLimit: number, nodeCount: number): AiWorldContext => {
    const nodes = allNodes.slice(0, nodeCount).map(n => ({ ...n, notes: noteLimit ? clip(n.notes, noteLimit) : '' }));
    const kept = new Set(nodes.map(n => n.id));
    const relations = allRelations.filter(r => kept.has(r.from) && kept.has(r.to));
    return {
      projectName: name(p.name),
      // Los nombres de los meses son libres: una fecha con uno muy largo no puede invalidar la pregunta.
      today: clip(formatDate(p.calendar, todayOf(p.calendar)), LIMITS.today),
      partial:
        nodeCount < allNodes.length ||
        relations.length > LIMITS.relations ||
        allNodes.some(n => n.notes.length > noteLimit),
      types,
      nodes: nodes.map(n => ({ ...n, parent: n.parent && kept.has(n.parent) ? n.parent : null })),
      relations: relations.slice(0, LIMITS.relations),
      ...(agenda
        ? {
            agenda: {
              today: agenda.today,
              entries: agenda.entries.map(e => ({
                ...e,
                nodes: e.nodes.filter(id => kept.has(id)).slice(0, AGENDA_NODES),
              })),
            },
          }
        : {}),
    };
  };
  // Solo las referencias de los nodos que van: el resto no hace falta y engordaría la petición.
  const withRefs = (context: AiWorldContext) => {
    const sent = new Set(context.nodes.map(n => n.id));
    const refs: AiWorldRefs = {
      nodes: Object.fromEntries([...ids].filter(([, short]) => sent.has(short)).map(([id, short]) => [short, id])),
    };
    return { context, refs };
  };
  // Dentro del presupuesto en caracteres y, con las referencias, del cuerpo que admite la API en bytes.
  const fits = (c: AiWorldContext) => JSON.stringify(c).length <= budget && jsonBytes(withRefs(c)) <= AI_BODY_BUDGET;
  const most = Math.min(allNodes.length, LIMITS.nodes);
  for (const limit of NOTE_STEPS) {
    const context = build(limit, most);
    if (fits(context)) return withRefs(context);
  }
  // Ni sin notas cabe: se quitan nodos de los menos conectados, a mitades, hasta que quepa.
  let count = most;
  let context = build(0, count);
  while (count > 1 && !fits(context)) {
    count = Math.floor(count * 0.75);
    context = build(0, count);
  }
  return withRefs(context);
}

/**
 * La agenda para el contexto: las `AGENDA_LIMIT` entradas más cercanas a hoy, en orden de fecha, con la
 * descripción recortada y los nodos (enlazados o mencionados) con su identificador corto.
 */
function agendaContext(p: Project, ids: Map<string, string>, budget: number) {
  const today = todayText();
  const index = mentionIndex(p);
  const distance = (date: string) => Math.abs(Date.parse(date) - Date.parse(today));
  // De la más cercana a hoy a la más lejana: si no cabe, se quitan primero las lejanas.
  const closest = [...p.agenda].sort((a, b) => distance(a.date) - distance(b.date)).slice(0, AGENDA_LIMIT);
  let entries: AiAgendaEntry[] = closest.map(e => ({
    kind: kindLabel(e.kind),
    title: clip(e.title.trim() || 'Sin título', 500),
    date: e.date,
    endDate: e.endDate,
    time: e.time,
    done: e.kind === 'task' || e.kind === 'deadline' ? e.done : null,
    description: clip(e.description.trim(), AGENDA_DESCRIPTION),
    nodes: [...new Set([...e.nodeIds, ...mentionedInEntry(p, e, index).map(n => n.id)])]
      .map(id => ids.get(id))
      .filter((id): id is string => Boolean(id))
      .slice(0, AGENDA_NODES),
  }));
  // Si no cabe en su parte del presupuesto: primero descripciones más cortas y después menos entradas.
  const size = (list: AiAgendaEntry[]) => JSON.stringify(list).length;
  if (size(entries) > budget) entries = entries.map(e => ({ ...e, description: clip(e.description, 200) }));
  let count = entries.length;
  while (count > 0 && size(entries.slice(0, count)) > budget) count = Math.floor(count * 0.75);
  const kept = closest.slice(0, count).map((source, i) => ({ source, entry: entries[i] }));
  kept.sort((a, b) => compareEntries(a.source, b.source));
  return { today, entries: kept.map(k => k.entry) };
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
