import { describe, expect, it } from 'vitest';
import { createAgendaEntry } from '../domain/agenda';
import { field, node, project, schema } from '../test/fixtures';
import { agendaCsv, agendaIcs } from './agendaExport';
import { exportBundle } from './exportBundle';

const p = project({
  name: 'Novela; borrador',
  schemas: [schema('persona', { fields: [field('nombre', { isTitle: true }), field('nacimiento', { type: 'date' })] })],
  nodes: [node('ana', 'persona', null, { nombre: 'Ana', nacimiento: '2026-11-03' })],
  agenda: [
    createAgendaEntry('e1', { kind: 'deadline', title: 'Capítulo 3', date: '2026-11-15', done: true }, 'x'),
    createAgendaEntry(
      'e2',
      { kind: 'event', title: 'Presentación', date: '2026-11-20', time: '18:30', description: 'Con [[Ana]], en Vigo' },
      'x',
    ),
    createAgendaEntry('e3', { kind: 'note', title: 'Viaje', date: '2026-12-01', endDate: '2026-12-03' }, 'x'),
  ],
});
const now = new Date('2026-10-22T08:00:00Z');

describe('agendaIcs', () => {
  const ics = agendaIcs(p, {}, now);
  const lines = ics.split('\r\n');

  it('es un calendario válido con un evento por entrada', () => {
    expect(lines[0]).toBe('BEGIN:VCALENDAR');
    expect(lines.at(-2)).toBe('END:VCALENDAR');
    expect(ics.endsWith('\r\n')).toBe(true);
    expect(lines.filter(l => l === 'BEGIN:VEVENT')).toHaveLength(3);
    expect(lines).toContain('X-WR-CALNAME:Novela\\; borrador');
  });

  it('días enteros con fin exclusivo, horas locales y títulos de las hechas', () => {
    expect(lines).toContain('DTSTART;VALUE=DATE:20261115');
    expect(lines).toContain('DTEND;VALUE=DATE:20261116');
    expect(lines).toContain('SUMMARY:✓ Capítulo 3');
    expect(lines).toContain('DTSTART:20261120T183000');
    expect(lines).toContain('DURATION:PT1H');
    expect(lines).toContain('DTEND;VALUE=DATE:20261204');
    expect(lines).toContain('DESCRIPTION:Con Ana\\, en Vigo\\n\\nNodos: Ana');
  });

  it('parte las líneas largas a 75 octetos', () => {
    const long = agendaIcs({ ...p, agenda: [{ ...p.agenda[0], title: 'Ñ'.repeat(80) }] }, {}, now);
    const encoder = new TextEncoder();
    for (const line of long.split('\r\n')) expect(encoder.encode(line).length).toBeLessThanOrEqual(75);
  });

  it('con las fechas de las fichas, si el calendario es el real', () => {
    expect(agendaIcs(p, { fieldDates: true }, now)).toContain('SUMMARY:Ana · nacimiento');
  });
});

describe('exportación completa', () => {
  it('el ZIP lleva la agenda en .ics y en CSV', () => {
    const names = exportBundle(p).map(e => e.name);
    expect(names).toContain('agenda/agenda.ics');
    expect(names).toContain('agenda/agenda.csv');
    expect(agendaCsv(p).split('\r\n')[1]).toBe('Entrega;Capítulo 3;2026-11-15;;;Sí;;');
  });
});
