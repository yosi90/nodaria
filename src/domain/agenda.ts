import { isStandardCalendar } from './calendar';
export { defaultAgendaSettings, normalizeAgendaSettings } from './calendar';
import { extractMentions, mentionIndex, normalizeName } from './notes';
import { allFields, nodeLabel } from './selectors';
import type { Node, Project } from './types';

/*
 * Agenda del proyecto (docs/roadmaps/ROADMAP_CALENDARIO.md): notas, tareas, entregas y eventos en días
 * reales. No son nodos: no ensucian el mapa, la estructura ni los análisis, y no obligan a crear tipos
 * para apuntar algo en un día. Una entrada puede enlazar nodos y mencionarlos con `[[Nombre]]`.
 *
 * La agenda usa siempre el calendario real (gregoriano y el hoy del reloj), aunque el proyecto tenga un
 * calendario del mundo: «entregar el capítulo 3 el 15 de noviembre» es una fecha real. El calendario del
 * mundo sigue para las fichas, las fórmulas y la Cronología.
 *
 * Las entradas no llevan `updatedAt`: en un grupo, dos personas que cambian cosas distintas de la misma
 * entrada se combinarían sin problema, pero las dos marcas de tiempo distintas serían un conflicto falso.
 */

export type AgendaKind = 'note' | 'task' | 'deadline' | 'event';

export interface AgendaEntry {
  id: string;
  kind: AgendaKind;
  title: string;
  /** Día real, `AAAA-MM-DD`. */
  date: string;
  /** Último día si dura varios (incluido); `null` = un solo día. */
  endDate: string | null;
  /** Hora `HH:MM`, o `null` = todo el día. */
  time: string | null;
  /** Texto libre con menciones `[[Nombre]]`. */
  description: string;
  /** Tareas y entregas: hecha. En notas y eventos no se usa. */
  done: boolean;
  /** Nodos enlazados. */
  nodeIds: string[];
  /** En un proyecto de grupo, la cuenta a la que se asigna (identificador global), o nadie. */
  assignee: string | null;
  createdAt: string;
}

export type { AgendaMode, AgendaSettings } from './calendar';

export const AGENDA_KINDS: ReadonlyArray<{ id: AgendaKind; label: string; plural: string }> = [
  { id: 'note', label: 'Nota', plural: 'Notas' },
  { id: 'task', label: 'Tarea', plural: 'Tareas' },
  { id: 'deadline', label: 'Entrega', plural: 'Entregas' },
  { id: 'event', label: 'Evento', plural: 'Eventos' },
];
export const kindLabel = (kind: AgendaKind) => AGENDA_KINDS.find(k => k.id === kind)?.label ?? 'Nota';
/** Tareas y entregas se marcan como hechas; notas y eventos no. */
export const isCheckable = (kind: AgendaKind) => kind === 'task' || kind === 'deadline';

export const WEEKDAY_NAMES = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];
export const WEEKDAY_SHORT = ['L', 'M', 'X', 'J', 'V', 'S', 'D'];
export const MONTH_NAMES = [
  'enero',
  'febrero',
  'marzo',
  'abril',
  'mayo',
  'junio',
  'julio',
  'agosto',
  'septiembre',
  'octubre',
  'noviembre',
  'diciembre',
];

// --- Fechas reales ---------------------------------------------------------------------------------
// Se calculan en UTC para que los cambios de hora no muevan los días.

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;
const TIME = /^([01]\d|2[0-3]):([0-5]\d)$/;

/** Si el texto es un día real que existe (`2026-02-30` no). */
export function isRealDate(text: unknown): text is string {
  if (typeof text !== 'string') return false;
  const m = ISO_DATE.exec(text);
  if (!m) return false;
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  return d.getUTCFullYear() === Number(m[1]) && d.getUTCMonth() === Number(m[2]) - 1 && d.getUTCDate() === Number(m[3]);
}

export const isTime = (text: unknown): text is string => typeof text === 'string' && TIME.test(text);

const toUtc = (date: string) => {
  const [y, m, d] = date.split('-').map(Number);
  return Date.UTC(y, m - 1, d);
};
const fromUtc = (ms: number) => new Date(ms).toISOString().slice(0, 10);
const DAY = 86_400_000;

/** El día de hoy en el reloj de este equipo, `AAAA-MM-DD`. */
export function todayText(now = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

export const addDays = (date: string, days: number) => fromUtc(toUtc(date) + days * DAY);
export const daysFrom = (from: string, to: string) => Math.round((toUtc(to) - toUtc(from)) / DAY);
/** Día de la semana: 0 = lunes … 6 = domingo. */
export const weekdayIndex = (date: string) => (new Date(toUtc(date)).getUTCDay() + 6) % 7;

/** Primer día de la semana que contiene `date`, según el día con el que empieza la semana. */
export const startOfWeek = (date: string, weekStart: number) =>
  addDays(date, -((weekdayIndex(date) - weekStart + 7) % 7));

/** Número de semana ISO 8601 (la semana del primer jueves del año es la 1). */
export function isoWeek(date: string): number {
  const thursday = addDays(date, 3 - weekdayIndex(date));
  const yearStart = `${thursday.slice(0, 4)}-01-01`;
  return Math.floor(daysFrom(yearStart, thursday) / 7) + 1;
}

/** Los días de la rejilla del mes: semanas completas que cubren el mes de `date`. */
export function monthGrid(date: string, weekStart: number): string[] {
  const first = `${date.slice(0, 7)}-01`;
  const [y, m] = first.split('-').map(Number);
  const last = fromUtc(Date.UTC(y, m, 0));
  const start = startOfWeek(first, weekStart);
  const end = addDays(startOfWeek(last, weekStart), 6);
  const days: string[] = [];
  for (let d = start; d <= end; d = addDays(d, 1)) days.push(d);
  return days;
}

/** El mismo día de otro mes (recortado si no existe: 31 de marzo − 1 mes = 28 o 29 de febrero). */
export function addMonths(date: string, months: number): string {
  const [y, m, d] = date.split('-').map(Number);
  const target = new Date(Date.UTC(y, m - 1 + months, 1));
  const lastDay = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  return fromUtc(Date.UTC(target.getUTCFullYear(), target.getUTCMonth(), Math.min(d, lastDay)));
}

/** «22 de octubre de 2026». */
export function longDate(date: string): string {
  const [y, m, d] = date.split('-').map(Number);
  return `${d} de ${MONTH_NAMES[m - 1]} de ${y}`;
}
/** «Jueves, 22 de octubre». */
export function dayTitle(date: string, withYear = false): string {
  const [y, m, d] = date.split('-').map(Number);
  return `${WEEKDAY_NAMES[weekdayIndex(date)]}, ${d} de ${MONTH_NAMES[m - 1]}${withYear ? ` de ${y}` : ''}`;
}
/** «Octubre de 2026». */
export function monthTitle(date: string): string {
  const [y, m] = date.split('-').map(Number);
  const name = MONTH_NAMES[m - 1];
  return `${name[0].toUpperCase()}${name.slice(1)} de ${y}`;
}

// --- Consultas -------------------------------------------------------------------------------------

/** Último día de la entrada (el primero si dura uno). */
export const lastDay = (e: AgendaEntry) => e.endDate ?? e.date;

/** Orden dentro de un día: primero las de todo el día, luego por hora, y por título. */
export function compareEntries(a: AgendaEntry, b: AgendaEntry): number {
  return (
    a.date.localeCompare(b.date) ||
    (a.time ?? '').localeCompare(b.time ?? '') ||
    a.title.localeCompare(b.title, 'es') ||
    a.id.localeCompare(b.id)
  );
}

/** Entradas que ocupan el día `date` (las de varios días, en cada uno de ellos). */
export const entriesOn = (entries: AgendaEntry[], date: string) =>
  entries.filter(e => e.date <= date && lastDay(e) >= date).sort(compareEntries);

/** Entradas que tocan el rango `[from, to]`, ambos incluidos. */
export const entriesInRange = (entries: AgendaEntry[], from: string, to: string) =>
  entries.filter(e => e.date <= to && lastDay(e) >= from).sort(compareEntries);

/** Tarea o entrega sin hacer cuyo último día ya pasó. */
export const isOverdue = (e: AgendaEntry, today: string) => isCheckable(e.kind) && !e.done && lastDay(e) < today;

export const overdueEntries = (entries: AgendaEntry[], today: string) =>
  entries.filter(e => isOverdue(e, today)).sort(compareEntries);

/** Lo que queda de hoy en adelante (las de varios días que siguen en curso, también), en orden. */
export const upcomingEntries = (entries: AgendaEntry[], today: string) =>
  entries.filter(e => lastDay(e) >= today).sort(compareEntries);

/** Nodos mencionados en la descripción de una entrada. */
export function mentionedInEntry(p: Project, e: AgendaEntry, index = mentionIndex(p)): Node[] {
  return extractMentions(e.description)
    .map(name => index.get(normalizeName(name)))
    .filter((n): n is Node => Boolean(n));
}

/** Entradas que enlazan o mencionan un nodo. */
export function entriesOfNode(p: Project, nodeId: string): AgendaEntry[] {
  const index = mentionIndex(p);
  return p.agenda
    .filter(e => e.nodeIds.includes(nodeId) || mentionedInEntry(p, e, index).some(n => n.id === nodeId))
    .sort(compareEntries);
}

/** Una fecha de una ficha vista en la agenda: de solo lectura, con enlace a su nodo. */
export interface FieldDateItem {
  key: string;
  nodeId: string;
  title: string;
  fieldLabel: string;
  date: string;
}

/** Si las fechas de las fichas son reales: calendario gregoriano estándar y hoy real. */
export const fieldDatesAreReal = (p: Project) => isStandardCalendar(p.calendar) && p.calendar.today === null;

/**
 * Las fechas de las fichas que caen en `[from, to]`, cuando el calendario del proyecto es el real. Con
 * un calendario del mundo no se enseñan: serían fechas de otra cuenta.
 */
export function fieldDatesInRange(p: Project, from: string, to: string): FieldDateItem[] {
  if (!fieldDatesAreReal(p)) return [];
  const items: FieldDateItem[] = [];
  for (const node of p.nodes) {
    for (const field of allFields(p, node.typeId)) {
      if (field.type !== 'date') continue;
      const value = node.values[field.id];
      if (!isRealDate(value) || value < from || value > to) continue;
      items.push({
        key: `${node.id}|${field.id}`,
        nodeId: node.id,
        title: nodeLabel(p, node),
        fieldLabel: field.label,
        date: value,
      });
    }
  }
  return items.sort((a, b) => a.date.localeCompare(b.date) || a.title.localeCompare(b.title, 'es'));
}

// --- Normalización y reparación --------------------------------------------------------------------

const KINDS = new Set<AgendaKind>(['note', 'task', 'deadline', 'event']);

/**
 * Entradas leídas de fuera (importación, otra versión): rellena lo que falte y repara lo imposible. Una
 * fecha que no existe toma la de fin o la de creación; un fin anterior al inicio se quita; una hora mal
 * escrita queda en «todo el día»; un título vacío se conserva (se enseña como «Sin título»). Los enlaces a
 * nodos que no existen los quita `repairProject` (`withoutMissingAgendaNodes`).
 */
export function normalizeAgenda(raw: unknown): AgendaEntry[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const out: AgendaEntry[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const e = item as Partial<Record<keyof AgendaEntry, unknown>>;
    if (typeof e.id !== 'string' || !e.id || seen.has(e.id)) continue;
    seen.add(e.id);
    const createdAt = typeof e.createdAt === 'string' && e.createdAt ? e.createdAt : new Date().toISOString();
    const date = isRealDate(e.date)
      ? e.date
      : isRealDate(e.endDate)
        ? e.endDate
        : isRealDate(createdAt.slice(0, 10))
          ? createdAt.slice(0, 10)
          : todayText();
    const endDate = isRealDate(e.endDate) && e.endDate > date ? e.endDate : null;
    const title = typeof e.title === 'string' ? e.title : '';
    out.push({
      id: e.id,
      kind: KINDS.has(e.kind as AgendaKind) ? (e.kind as AgendaKind) : 'note',
      title,
      date,
      endDate,
      time: isTime(e.time) ? e.time : null,
      description: typeof e.description === 'string' ? e.description : '',
      done: e.done === true,
      nodeIds: Array.isArray(e.nodeIds)
        ? [...new Set(e.nodeIds.filter((id): id is string => typeof id === 'string'))]
        : [],
      assignee: typeof e.assignee === 'string' && e.assignee ? e.assignee : null,
      createdAt,
    });
  }
  return out;
}

/** Quita de las entradas los nodos que ya no existen. Devuelve el mismo proyecto si no hay nada que quitar. */
export function withoutMissingAgendaNodes(p: Project, existing = new Set(p.nodes.map(n => n.id))) {
  let removed = 0;
  const agenda = p.agenda.map(e => {
    const nodeIds = e.nodeIds.filter(id => existing.has(id));
    removed += e.nodeIds.length - nodeIds.length;
    return nodeIds.length === e.nodeIds.length ? e : { ...e, nodeIds };
  });
  return { project: removed ? { ...p, agenda } : p, removed };
}

// --- Operaciones -----------------------------------------------------------------------------------

export type AgendaPatch = Partial<Omit<AgendaEntry, 'id' | 'createdAt'>>;

/** Una entrada nueva con los valores por defecto (nota de un día, sin hora). */
export function createAgendaEntry(id: string, patch: AgendaPatch & { date: string }, createdAt: string): AgendaEntry {
  return {
    id,
    kind: 'note',
    title: '',
    endDate: null,
    time: null,
    description: '',
    done: false,
    nodeIds: [],
    assignee: null,
    createdAt,
    ...patch,
  };
}

/** Deja una entrada coherente después de un cambio: fin posterior al inicio, sin «hecha» si no se marca. */
function settle(e: AgendaEntry): AgendaEntry {
  const endDate = e.endDate && e.endDate > e.date ? e.endDate : null;
  const done = isCheckable(e.kind) ? e.done : false;
  return endDate === e.endDate && done === e.done ? e : { ...e, endDate, done };
}

export function addAgendaEntry(p: Project, entry: AgendaEntry): Project {
  if (p.agenda.some(e => e.id === entry.id) || !isRealDate(entry.date)) return p;
  return { ...p, agenda: [...p.agenda, settle(entry)] };
}

export function updateAgendaEntry(p: Project, id: string, patch: AgendaPatch): Project {
  if (patch.date !== undefined && !isRealDate(patch.date)) return p;
  let changed = false;
  const agenda = p.agenda.map(e => {
    if (e.id !== id) return e;
    changed = true;
    return settle({ ...e, ...patch });
  });
  return changed ? { ...p, agenda } : p;
}

/** Lleva una entrada a otro día conservando cuántos días dura. */
export function moveAgendaEntry(p: Project, id: string, date: string): Project {
  const entry = p.agenda.find(e => e.id === id);
  if (!entry || !isRealDate(date) || entry.date === date) return p;
  const endDate = entry.endDate ? addDays(date, daysFrom(entry.date, entry.endDate)) : null;
  return updateAgendaEntry(p, id, { date, endDate });
}

export function toggleAgendaEntry(p: Project, id: string): Project {
  const entry = p.agenda.find(e => e.id === id);
  if (!entry || !isCheckable(entry.kind)) return p;
  return updateAgendaEntry(p, id, { done: !entry.done });
}

export function deleteAgendaEntry(p: Project, id: string): Project {
  const agenda = p.agenda.filter(e => e.id !== id);
  return agenda.length === p.agenda.length ? p : { ...p, agenda };
}
