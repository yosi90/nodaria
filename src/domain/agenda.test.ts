import { describe, expect, it } from 'vitest';
import {
  addAgendaEntry,
  addDays,
  addMonths,
  createAgendaEntry,
  deleteAgendaEntry,
  entriesInRange,
  entriesOfNode,
  entriesOn,
  fieldDatesInRange,
  isOverdue,
  isRealDate,
  isoWeek,
  monthGrid,
  moveAgendaEntry,
  normalizeAgenda,
  overdueEntries,
  startOfWeek,
  toggleAgendaEntry,
  upcomingEntries,
  updateAgendaEntry,
  weekdayIndex,
  type AgendaEntry,
} from './agenda';
import { defaultCalendar } from './calendar';
import { PROJECT_FORMAT_VERSION } from './constants';
import { deleteNode } from './operations';
import { repairProject } from './integrity';
import { migrateProject } from '../services/migrations';
import { prepareProject } from '../services/storage';
import { mergeProjects } from '../services/merge';
import { field, node, project, schema } from '../test/fixtures';

const entry = (id: string, patch: Partial<AgendaEntry> & { date: string }): AgendaEntry =>
  createAgendaEntry(id, { title: id, ...patch }, '2026-10-01T10:00:00.000Z');

describe('fechas reales', () => {
  it('reconoce días que existen', () => {
    expect(isRealDate('2026-10-22')).toBe(true);
    expect(isRealDate('2024-02-29')).toBe(true);
    expect(isRealDate('2026-02-29')).toBe(false);
    expect(isRealDate('2026-13-01')).toBe(false);
    expect(isRealDate('22/10/2026')).toBe(false);
  });

  it('cuenta días, semanas y meses sin desfases por el cambio de hora', () => {
    expect(addDays('2026-10-24', 2)).toBe('2026-10-26');
    expect(addDays('2026-03-28', 2)).toBe('2026-03-30');
    expect(weekdayIndex('2026-10-22')).toBe(3); // jueves
    expect(startOfWeek('2026-10-22', 0)).toBe('2026-10-19');
    expect(startOfWeek('2026-10-22', 6)).toBe('2026-10-18');
    expect(isoWeek('2026-01-01')).toBe(1);
    expect(isoWeek('2027-01-01')).toBe(53);
    expect(addMonths('2026-03-31', -1)).toBe('2026-02-28');
    expect(addMonths('2026-12-15', 1)).toBe('2027-01-15');
  });

  it('la rejilla del mes cubre semanas completas', () => {
    const grid = monthGrid('2026-10-22', 0);
    expect(grid[0]).toBe('2026-09-28');
    expect(grid.at(-1)).toBe('2026-11-01');
    expect(grid.length % 7).toBe(0);
  });
});

describe('consultas de la agenda', () => {
  const entries = [
    entry('viaje', { date: '2026-10-20', endDate: '2026-10-23', kind: 'event' }),
    entry('cap3', { date: '2026-10-15', kind: 'deadline' }),
    entry('hecha', { date: '2026-10-10', kind: 'task', done: true }),
    entry('reunion', { date: '2026-10-22', time: '09:30', kind: 'event' }),
    entry('idea', { date: '2026-10-01', kind: 'note' }),
  ];

  it('las de un día incluyen las que duran varios', () => {
    expect(entriesOn(entries, '2026-10-22').map(e => e.id)).toEqual(['viaje', 'reunion']);
    expect(entriesInRange(entries, '2026-10-14', '2026-10-21').map(e => e.id)).toEqual(['cap3', 'viaje']);
  });

  it('vencidas: solo tareas y entregas sin hacer con el último día pasado', () => {
    expect(overdueEntries(entries, '2026-10-22').map(e => e.id)).toEqual(['cap3']);
    expect(isOverdue(entries[0], '2026-10-30')).toBe(false); // un evento nunca vence
    expect(upcomingEntries(entries, '2026-10-22').map(e => e.id)).toEqual(['viaje', 'reunion']);
  });

  it('las de un nodo: enlazadas o mencionadas', () => {
    const p = project({
      schemas: [schema('persona', { fields: [field('nombre', { isTitle: true })] })],
      nodes: [node('ana', 'persona', null, { nombre: 'Ana' }), node('luis', 'persona', null, { nombre: 'Luis' })],
      agenda: [
        entry('a', { date: '2026-10-01', nodeIds: ['ana'] }),
        entry('b', { date: '2026-10-02', description: 'Hablar con [[ana]] y [[Luis]]' }),
        entry('c', { date: '2026-10-03' }),
      ],
    });
    expect(entriesOfNode(p, 'ana').map(e => e.id)).toEqual(['a', 'b']);
    expect(entriesOfNode(p, 'luis').map(e => e.id)).toEqual(['b']);
  });

  it('las fechas de las fichas salen solo con el calendario real', () => {
    const p = project({
      schemas: [schema('tarea', { fields: [field('nombre', { isTitle: true }), field('entrega', { type: 'date' })] })],
      nodes: [
        node('t1', 'tarea', null, { nombre: 'Portada', entrega: '2026-10-25' }),
        node('t2', 'tarea', null, { nombre: 'Índice', entrega: '2026-12-01' }),
      ],
    });
    expect(fieldDatesInRange(p, '2026-10-01', '2026-10-31').map(i => i.title)).toEqual(['Portada']);
    const world = { ...p, calendar: { ...p.calendar, today: { year: 1043, month: 1, day: 1 } } };
    expect(fieldDatesInRange(world, '2026-10-01', '2026-10-31')).toEqual([]);
  });
});

describe('acciones de la agenda', () => {
  const base = project({ agenda: [entry('e1', { date: '2026-10-20', endDate: '2026-10-22', kind: 'task' })] });

  it('mover conserva la duración y marcar solo vale en tareas y entregas', () => {
    const moved = moveAgendaEntry(base, 'e1', '2026-11-02');
    expect(moved.agenda[0]).toMatchObject({ date: '2026-11-02', endDate: '2026-11-04' });
    expect(toggleAgendaEntry(base, 'e1').agenda[0].done).toBe(true);
    const note = updateAgendaEntry(toggleAgendaEntry(base, 'e1'), 'e1', { kind: 'note' });
    expect(note.agenda[0].done).toBe(false);
    expect(toggleAgendaEntry(note, 'e1')).toBe(note);
  });

  it('no acepta fechas imposibles y quita un fin anterior al inicio', () => {
    expect(updateAgendaEntry(base, 'e1', { date: '2026-02-30' })).toBe(base);
    expect(updateAgendaEntry(base, 'e1', { date: '2026-10-25' }).agenda[0].endDate).toBeNull();
    expect(addAgendaEntry(base, entry('e2', { date: 'mañana' }))).toBe(base);
    expect(deleteAgendaEntry(base, 'e1').agenda).toEqual([]);
  });

  it('borrar un nodo deja la entrada sin su enlace', () => {
    const p = project({
      schemas: [schema('persona')],
      nodes: [node('ana', 'persona'), node('luis', 'persona')],
      agenda: [entry('e1', { date: '2026-10-20', nodeIds: ['ana', 'luis'] })],
    });
    expect(deleteNode(p, 'ana').agenda[0].nodeIds).toEqual(['luis']);
  });
});

describe('migración y reparación', () => {
  it('un proyecto de la versión 7 carga con la agenda vacía y los ajustes por defecto', () => {
    const old = { ...project(), formatVersion: 7 } as Record<string, unknown>;
    delete old.agenda;
    const calendar = { ...defaultCalendar() } as Record<string, unknown>;
    delete calendar.settings;
    old.calendar = calendar;
    const migrated = migrateProject(old);
    expect(migrated.formatVersion).toBe(PROJECT_FORMAT_VERSION);
    expect(migrated.agenda).toEqual([]);
    expect(migrated.calendar.settings).toEqual(defaultCalendar().settings);
  });

  it('repara entradas dañadas y quita enlaces a nodos que no existen', () => {
    const agenda = normalizeAgenda([
      { id: 'a', kind: 'raro', date: '2026-02-30', endDate: '2026-03-02', time: '25:00', nodeIds: ['x'] },
      { id: 'a', title: 'repetida', date: '2026-01-01' },
      { title: 'sin id', date: '2026-01-01' },
      { id: 'b', title: 'Fin antes', date: '2026-05-10', endDate: '2026-05-01', done: true, kind: 'task' },
    ]);
    expect(agenda).toHaveLength(2);
    expect(agenda[0]).toMatchObject({
      kind: 'note',
      title: '',
      date: '2026-03-02',
      endDate: null,
      time: null,
    });
    expect(agenda[1]).toMatchObject({ endDate: null, done: true });
    const { project: repaired, issues } = repairProject(project({ agenda }));
    expect(repaired.agenda[0].nodeIds).toEqual([]);
    expect(issues.join(' ')).toMatch(/agenda/);
  });

  it('exportar e importar conserva la agenda', () => {
    const p = project({ agenda: [entry('e1', { date: '2026-10-20', kind: 'deadline', time: '12:00' })] });
    const { project: back } = prepareProject(JSON.parse(JSON.stringify(p)));
    expect(back.agenda).toEqual(p.agenda);
  });
});

describe('combinación en un grupo', () => {
  const base = project({
    agenda: [entry('e1', { date: '2026-10-20', kind: 'task' }), entry('e2', { date: '2026-10-21' })],
  });

  it('dos personas que cambian entradas distintas, o cosas distintas de la misma, no chocan', () => {
    const local = toggleAgendaEntry(addAgendaEntry(base, entry('mia', { date: '2026-10-25' })), 'e1');
    const remote = updateAgendaEntry(addAgendaEntry(base, entry('suya', { date: '2026-10-26' })), 'e1', {
      title: 'Revisar portada',
    });
    const { project: merged, conflicts } = mergeProjects(base, local, remote);
    expect(conflicts).toEqual([]);
    expect(merged.agenda.map(e => e.id).sort()).toEqual(['e1', 'e2', 'mia', 'suya']);
    expect(merged.agenda.find(e => e.id === 'e1')).toMatchObject({ done: true, title: 'Revisar portada' });
  });

  it('el mismo dato cambiado distinto es conflicto y gana el grupo', () => {
    const local = moveAgendaEntry(base, 'e2', '2026-10-28');
    const remote = moveAgendaEntry(base, 'e2', '2026-10-30');
    const { project: merged, conflicts } = mergeProjects(base, local, remote);
    expect(conflicts).toHaveLength(1);
    expect(merged.agenda.find(e => e.id === 'e2')!.date).toBe('2026-10-30');
  });
});
