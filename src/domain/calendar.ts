/*
 * Calendario del mundo. Cada proyecto puede definir sus propios meses (nombre y días), los días de
 * la semana, si hay años bisiestos y cuál es la fecha actual del mundo, para que las fechas se lean
 * con los nombres del mundo y las fórmulas calculen edades y plazos. Por defecto es el gregoriano en
 * español, así que un proyecto que no lo toque no nota ninguna diferencia.
 *
 * Las fechas se guardan como texto `AAAA-MM-DD` (el mismo formato que produce el control nativo), con
 * el mes y el día en base 1; en un calendario propio pueden superar 12 y 31.
 */

export interface CalendarMonth {
  name: string;
  days: number;
}

/** Una fecha del mundo: año, mes (1 = primero) y día (1 = primero). */
export interface WorldDate {
  year: number;
  month: number;
  day: number;
}

export interface Calendar {
  months: CalendarMonth[];
  weekdays: string[];
  /** Índice en `weekdays` del día 1 del mes 1 del año 1. */
  firstWeekday: number;
  /** Años bisiestos con la regla gregoriana: el segundo mes gana un día. */
  leapYears: boolean;
  /** Fecha actual del mundo; `null` = la fecha real de hoy. */
  today: WorldDate | null;
}

export const GREGORIAN_MONTHS: ReadonlyArray<CalendarMonth> = [
  { name: 'Enero', days: 31 },
  { name: 'Febrero', days: 28 },
  { name: 'Marzo', days: 31 },
  { name: 'Abril', days: 30 },
  { name: 'Mayo', days: 31 },
  { name: 'Junio', days: 30 },
  { name: 'Julio', days: 31 },
  { name: 'Agosto', days: 31 },
  { name: 'Septiembre', days: 30 },
  { name: 'Octubre', days: 31 },
  { name: 'Noviembre', days: 30 },
  { name: 'Diciembre', days: 31 },
];
export const GREGORIAN_WEEKDAYS: ReadonlyArray<string> = [
  'Lunes',
  'Martes',
  'Miércoles',
  'Jueves',
  'Viernes',
  'Sábado',
  'Domingo',
];

/** Calendario gregoriano en español. El 1 de enero del año 1 (proléptico) fue lunes. */
export function defaultCalendar(): Calendar {
  return {
    months: GREGORIAN_MONTHS.map(m => ({ ...m })),
    weekdays: [...GREGORIAN_WEEKDAYS],
    firstWeekday: 0,
    leapYears: true,
    today: null,
  };
}

/** Repara un calendario leído de fuera (importación o versiones anteriores sin calendario). */
export function normalizeCalendar(raw: unknown): Calendar {
  const base = defaultCalendar();
  if (!raw || typeof raw !== 'object') return base;
  const c = raw as Partial<Record<keyof Calendar, unknown>>;
  const months = Array.isArray(c.months)
    ? c.months
        .filter((m): m is Partial<CalendarMonth> => Boolean(m) && typeof m === 'object')
        .map((m, i) => ({
          name: typeof m.name === 'string' ? m.name : `Mes ${i + 1}`,
          days: Number.isInteger(m.days) && (m.days as number) > 0 ? (m.days as number) : 30,
        }))
    : base.months;
  const weekdays = Array.isArray(c.weekdays) ? c.weekdays.filter((d): d is string => typeof d === 'string') : [];
  const today = parseWorldDate(c.today);
  return {
    months: months.length ? months : base.months,
    weekdays: weekdays.length ? weekdays : base.weekdays,
    firstWeekday:
      Number.isInteger(c.firstWeekday) &&
      (c.firstWeekday as number) >= 0 &&
      (c.firstWeekday as number) < weekdays.length
        ? (c.firstWeekday as number)
        : 0,
    leapYears: typeof c.leapYears === 'boolean' ? c.leapYears : base.leapYears,
    today,
  };
}

function parseWorldDate(raw: unknown): WorldDate | null {
  if (!raw || typeof raw !== 'object') return null;
  const d = raw as Partial<WorldDate>;
  if (!Number.isInteger(d.year) || !Number.isInteger(d.month) || !Number.isInteger(d.day)) return null;
  return { year: d.year as number, month: d.month as number, day: d.day as number };
}

/** Si el calendario es el gregoriano estándar (la fecha actual no cuenta): entonces vale el control nativo. */
export function isStandardCalendar(c: Calendar): boolean {
  return (
    c.leapYears &&
    c.firstWeekday === 0 &&
    c.months.length === GREGORIAN_MONTHS.length &&
    c.months.every((m, i) => m.name === GREGORIAN_MONTHS[i].name && m.days === GREGORIAN_MONTHS[i].days) &&
    c.weekdays.length === GREGORIAN_WEEKDAYS.length &&
    c.weekdays.every((d, i) => d === GREGORIAN_WEEKDAYS[i])
  );
}

const DATE_TEXT = /^(-?\d{1,6})-(\d{1,3})-(\d{1,3})$/;

/** Lee una fecha guardada (`AAAA-MM-DD`). `null` si está vacía o no tiene ese formato. */
export function parseDate(value: unknown): WorldDate | null {
  if (typeof value !== 'string') return null;
  const m = DATE_TEXT.exec(value.trim());
  if (!m) return null;
  return { year: Number(m[1]), month: Number(m[2]), day: Number(m[3]) };
}

/** Texto con el que se guarda una fecha: `AAAA-MM-DD`, con ceros a la izquierda. */
export function dateText(d: WorldDate): string {
  const pad = (n: number, width: number) => {
    const sign = n < 0 ? '-' : '';
    return sign + String(Math.abs(n)).padStart(width, '0');
  };
  return `${pad(d.year, 4)}-${pad(d.month, 2)}-${pad(d.day, 2)}`;
}

/** Año bisiesto con la regla gregoriana. */
export const isLeapYear = (year: number) => year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);

/** Días del mes `month` (base 1) del año indicado, bisiestos incluidos. */
export function daysInMonth(c: Calendar, year: number, month: number): number {
  const m = c.months[month - 1];
  if (!m) return 0;
  return m.days + (c.leapYears && month === 2 && isLeapYear(year) ? 1 : 0);
}

export function daysInYear(c: Calendar, year: number): number {
  return c.months.reduce((sum, m) => sum + m.days, 0) + (c.leapYears && isLeapYear(year) ? 1 : 0);
}

/** Bisiestos entre el año 1 y el año `n`, ambos incluidos (negativo para años anteriores al 1). */
const leapYearsUpTo = (n: number) => Math.floor(n / 4) - Math.floor(n / 100) + Math.floor(n / 400);

/** Número de día de una fecha: el 1 del mes 1 del año 1 es el 0. Sirve para restar fechas y para el día de la semana. */
export function dayNumber(c: Calendar, d: WorldDate): number {
  const yearLength = c.months.reduce((sum, m) => sum + m.days, 0);
  const before = d.year - 1;
  let days = yearLength * before + (c.leapYears ? leapYearsUpTo(before) : 0);
  for (let m = 1; m < d.month; m++) days += daysInMonth(c, d.year, m);
  return days + d.day - 1;
}

/** Nombre del día de la semana de una fecha. */
export function weekdayOf(c: Calendar, d: WorldDate): string {
  const n = c.weekdays.length;
  if (!n) return '';
  const index = (((dayNumber(c, d) + c.firstWeekday) % n) + n) % n;
  return c.weekdays[index];
}

/** La fecha actual del mundo: la fijada en el calendario o, si no hay, la real. */
export function todayOf(c: Calendar, now = new Date()): WorldDate {
  return c.today ?? { year: now.getFullYear(), month: now.getMonth() + 1, day: now.getDate() };
}

/** Si la fecha existe en el calendario (mes y día dentro de rango). */
export function isValidDate(c: Calendar, d: WorldDate): boolean {
  return (
    Number.isInteger(d.month) &&
    d.month >= 1 &&
    d.month <= c.months.length &&
    Number.isInteger(d.day) &&
    d.day >= 1 &&
    d.day <= daysInMonth(c, d.year, d.month)
  );
}

/** Orden cronológico: negativo si `a` es anterior a `b`. */
export function compareDates(a: WorldDate, b: WorldDate): number {
  return a.year - b.year || a.month - b.month || a.day - b.day;
}

/** Años cumplidos entre dos fechas (negativo si `to` es anterior a `from`). */
export function yearsBetween(from: WorldDate, to: WorldDate): number {
  const years = to.year - from.year;
  const beforeAnniversary = to.month - from.month || to.day - from.day;
  if (years >= 0) return beforeAnniversary < 0 ? years - 1 : years;
  return beforeAnniversary > 0 ? years + 1 : years;
}

/** Días entre dos fechas (negativo si `to` es anterior a `from`). */
export function daysBetween(c: Calendar, from: WorldDate, to: WorldDate): number {
  return dayNumber(c, to) - dayNumber(c, from);
}

/** Nombre del mes `month` (base 1), o «mes N» si el calendario no lo tiene. */
export function monthName(c: Calendar, month: number): string {
  return c.months[month - 1]?.name ?? `mes ${month}`;
}

/** Texto legible de una fecha con los nombres del mundo: «3 de Brumal de 1043». */
export function formatDate(c: Calendar, d: WorldDate): string {
  return `${d.day} de ${monthName(c, d.month)} de ${d.year}`;
}

/** Texto legible de un valor guardado; si no es una fecha válida devuelve el valor tal cual. */
export function formatDateValue(c: Calendar, value: unknown): string {
  const d = parseDate(value);
  return d ? formatDate(c, d) : value === null || value === undefined ? '' : String(value);
}
