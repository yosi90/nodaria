import { addDays, fieldDatesInRange, kindLabel, lastDay, mentionedInEntry, type AgendaEntry } from '../domain/agenda';
import { mentionIndex } from '../domain/notes';
import { getNode, nodeLabel } from '../domain/selectors';
import { fileSafeName } from '../domain/text';
import type { Project } from '../domain/types';

/*
 * Exportar la agenda (docs/roadmaps/ROADMAP_CALENDARIO.md, fase 4): un `.ics` (iCalendar, RFC 5545) que
 * abren Google Calendar, Outlook o el calendario del móvil, y un CSV para la exportación completa. Solo
 * se exporta: importar un `.ics` queda para más adelante.
 *
 * Todas las entradas van como VEVENT (Google Calendar no lee VTODO); el tipo va en CATEGORIES y en el
 * título de las tareas y entregas hechas. Las horas son locales, sin zona («flotantes»): las 10:00 son
 * las 10:00 de quien lo abra, como en Nodaria.
 */

const CRLF = '\r\n';

/** Escapa un texto para una propiedad de iCalendar. */
const icsText = (text: string) =>
  text.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');

/** Parte las líneas de más de 75 octetos, como pide el formato (la continuación empieza con un espacio). */
function fold(line: string): string {
  const encoder = new TextEncoder();
  if (encoder.encode(line).length <= 75) return line;
  const parts: string[] = [];
  let current = '';
  let size = 0;
  for (const char of line) {
    const bytes = encoder.encode(char).length;
    const limit = parts.length ? 74 : 75;
    if (size + bytes > limit) {
      parts.push(current);
      current = '';
      size = 0;
    }
    current += char;
    size += bytes;
  }
  parts.push(current);
  return parts.join(`${CRLF} `);
}

const compactDate = (date: string) => date.replace(/-/g, '');
const stamp = (now: Date) => now.toISOString().replace(/[-:]/g, '').replace(/\.\d+/, '');

/** La descripción con las menciones como texto y los nodos enlazados al final. */
function entryDescription(p: Project, e: AgendaEntry, index = mentionIndex(p)): string {
  const description = e.description.replace(/\[\[([^\]\n]+)\]\]/g, '$1').trim();
  const linked = [...new Set([...e.nodeIds, ...mentionedInEntry(p, e, index).map(n => n.id)])]
    .map(id => getNode(p, id))
    .filter(n => n !== undefined)
    .map(n => nodeLabel(p, n));
  return [description, linked.length ? `Nodos: ${linked.join(', ')}` : ''].filter(Boolean).join('\n\n');
}

function entryEvent(p: Project, e: AgendaEntry, now: Date, index: ReturnType<typeof mentionIndex>): string[] {
  const done = (e.kind === 'task' || e.kind === 'deadline') && e.done;
  const lines = ['BEGIN:VEVENT', `UID:${e.id}@nodaria.yosiftware.es`, `DTSTAMP:${stamp(now)}`];
  if (e.time) {
    lines.push(`DTSTART:${compactDate(e.date)}T${e.time.replace(':', '')}00`);
    // Sin hora de fin: una hora, o hasta la misma hora del último día si dura varios.
    if (e.endDate) lines.push(`DTEND:${compactDate(e.endDate)}T${e.time.replace(':', '')}00`);
    else lines.push('DURATION:PT1H');
  } else {
    lines.push(`DTSTART;VALUE=DATE:${compactDate(e.date)}`, `DTEND;VALUE=DATE:${compactDate(addDays(lastDay(e), 1))}`);
  }
  lines.push(`SUMMARY:${icsText(`${done ? '✓ ' : ''}${e.title.trim() || 'Sin título'}`)}`);
  const description = entryDescription(p, e, index);
  if (description) lines.push(`DESCRIPTION:${icsText(description)}`);
  lines.push(`CATEGORIES:${icsText(kindLabel(e.kind))}`, 'TRANSP:TRANSPARENT', 'END:VEVENT');
  return lines;
}

/**
 * La agenda en iCalendar. Con `fieldDates`, también las fechas de las fichas (solo si el calendario del
 * proyecto es el real).
 */
export function agendaIcs(p: Project, options: { fieldDates?: boolean } = {}, now = new Date()): string {
  const index = mentionIndex(p);
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Yosiftware//Nodaria//ES',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:${icsText(p.name)}`,
  ];
  for (const e of p.agenda) lines.push(...entryEvent(p, e, now, index));
  if (options.fieldDates) {
    for (const item of fieldDatesInRange(p, '0001-01-01', '9999-12-31')) {
      lines.push(
        'BEGIN:VEVENT',
        `UID:${item.key.replace('|', '-')}@nodaria.yosiftware.es`,
        `DTSTAMP:${stamp(now)}`,
        `DTSTART;VALUE=DATE:${compactDate(item.date)}`,
        `DTEND;VALUE=DATE:${compactDate(addDays(item.date, 1))}`,
        `SUMMARY:${icsText(`${item.title} · ${item.fieldLabel}`)}`,
        'CATEGORIES:Ficha',
        'TRANSP:TRANSPARENT',
        'END:VEVENT',
      );
    }
  }
  lines.push('END:VCALENDAR');
  return lines.map(fold).join(CRLF) + CRLF;
}

const csvCell = (text: string) => (/[;"\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text);

/** La agenda en CSV (separado por «;», como lo abre Excel en español). Sin BOM: lo añade quien lo empaqueta. */
export function agendaCsv(p: Project): string {
  const index = mentionIndex(p);
  const rows = [['Tipo', 'Título', 'Fecha', 'Hasta', 'Hora', 'Hecha', 'Descripción', 'Nodos']];
  for (const e of [...p.agenda].sort((a, b) => a.date.localeCompare(b.date))) {
    const linked = [...new Set([...e.nodeIds, ...mentionedInEntry(p, e, index).map(n => n.id)])]
      .map(id => getNode(p, id))
      .filter(n => n !== undefined)
      .map(n => nodeLabel(p, n));
    rows.push([
      kindLabel(e.kind),
      e.title,
      e.date,
      e.endDate ?? '',
      e.time ?? '',
      e.kind === 'task' || e.kind === 'deadline' ? (e.done ? 'Sí' : 'No') : '',
      e.description,
      linked.join(', '),
    ]);
  }
  return rows.map(r => r.map(csvCell).join(';')).join('\r\n') + '\r\n';
}

export const agendaFileName = (p: Project) => `${fileSafeName(p.name, 'agenda')}.ics`;
