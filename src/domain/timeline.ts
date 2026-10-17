import { compareDates, isValidDate, parseDate, type WorldDate } from './calendar';
import { allFields, getNode, nodeLabel } from './selectors';
import type { Project } from './types';

/*
 * Línea temporal (PENDIENTES.md, sección 4): cada fecha guardada en un nodo o en una relación es un
 * acontecimiento, ordenado con el calendario del mundo (`calendar.ts`, años negativos incluidos). Las
 * fechas que no existen en el calendario (un día 31 en un mes de 30) se incluyen marcadas, para poder
 * corregirlas.
 */

export interface TimelineEvent {
  key: string;
  date: WorldDate;
  /** Si la fecha existe en el calendario del proyecto. */
  valid: boolean;
  owner: { kind: 'node' | 'relation'; id: string };
  /** Tipo del nodo o de la relación. */
  typeId: string;
  fieldId: string;
  fieldLabel: string;
  /** Título del nodo o «Origen — Destino» de la relación. */
  label: string;
}

export function timelineEvents(p: Project): TimelineEvent[] {
  const events: TimelineEvent[] = [];
  const add = (owner: TimelineEvent['owner'], typeId: string, values: Record<string, unknown>, label: string) => {
    for (const field of allFields(p, typeId)) {
      if (field.type !== 'date') continue;
      const date = parseDate(values[field.id]);
      if (!date) continue;
      events.push({
        key: `${owner.id}:${field.id}`,
        date,
        valid: isValidDate(p.calendar, date),
        owner,
        typeId,
        fieldId: field.id,
        fieldLabel: field.label,
        label,
      });
    }
  };
  for (const node of p.nodes) add({ kind: 'node', id: node.id }, node.typeId, node.values, nodeLabel(p, node));
  for (const relation of p.relations) {
    const source = getNode(p, relation.sourceId);
    const target = getNode(p, relation.targetId);
    if (!source || !target) continue;
    const label = `${nodeLabel(p, source)} — ${nodeLabel(p, target)}`;
    add({ kind: 'relation', id: relation.id }, relation.typeId, relation.values, label);
  }
  return events.sort(
    (a, b) =>
      compareDates(a.date, b.date) ||
      a.label.localeCompare(b.label, 'es') ||
      a.fieldLabel.localeCompare(b.fieldLabel, 'es'),
  );
}

export interface TimelineYear {
  year: number;
  /** Años sin acontecimientos entre el grupo anterior y este (0 si son seguidos o es el primero). */
  gap: number;
  events: TimelineEvent[];
}

/** Agrupa por año los acontecimientos ya ordenados. */
export function groupByYear(events: TimelineEvent[]): TimelineYear[] {
  const years: TimelineYear[] = [];
  for (const event of events) {
    const last = years[years.length - 1];
    if (last?.year === event.date.year) last.events.push(event);
    else years.push({ year: event.date.year, gap: last ? event.date.year - last.year - 1 : 0, events: [event] });
  }
  return years;
}
