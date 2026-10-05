import { describe, expect, it } from 'vitest';
import {
  dateText,
  daysBetween,
  daysInMonth,
  defaultCalendar,
  formatDate,
  isStandardCalendar,
  isValidDate,
  normalizeCalendar,
  parseDate,
  todayOf,
  weekdayOf,
  yearsBetween,
  type Calendar,
} from './calendar';

/** Munfamed: diez meses de 36 días, semana de seis días, sin bisiestos, año actual 1043. */
const munfamed = (): Calendar => ({
  months: ['Albor', 'Brumal', 'Cenizo', 'Dorado', 'Escarcha', 'Fragua', 'Granizo', 'Hojarasca', 'Índigo', 'Jade'].map(
    name => ({ name, days: 36 }),
  ),
  weekdays: ['Soldía', 'Lundía', 'Mardía', 'Fuegodía', 'Aguadía', 'Tierradía'],
  firstWeekday: 0,
  leapYears: false,
  today: { year: 1043, month: 3, day: 12 },
});

describe('calendario', () => {
  it('el gregoriano por defecto es el estándar y coincide con las fechas reales', () => {
    const c = defaultCalendar();
    expect(isStandardCalendar(c)).toBe(true);
    expect(daysInMonth(c, 2024, 2)).toBe(29);
    expect(daysInMonth(c, 2023, 2)).toBe(28);
    expect(daysInMonth(c, 1900, 2)).toBe(28);
    expect(daysInMonth(c, 2000, 2)).toBe(29);
    // Día de la semana real: el 5 de octubre de 2026 es lunes; el 1 de enero de 2000, sábado.
    expect(weekdayOf(c, { year: 2026, month: 10, day: 5 })).toBe('Lunes');
    expect(weekdayOf(c, { year: 2000, month: 1, day: 1 })).toBe('Sábado');
    expect(daysBetween(c, { year: 2024, month: 2, day: 28 }, { year: 2024, month: 3, day: 1 })).toBe(2);
    expect(daysBetween(c, { year: 2023, month: 2, day: 28 }, { year: 2023, month: 3, day: 1 })).toBe(1);
  });

  it('la fecha actual es la fijada o, si no hay, la real', () => {
    const c = defaultCalendar();
    expect(todayOf(c, new Date(2026, 9, 5))).toEqual({ year: 2026, month: 10, day: 5 });
    expect(todayOf(munfamed())).toEqual({ year: 1043, month: 3, day: 12 });
  });

  it('lee y escribe fechas como AAAA-MM-DD, también con meses y días más allá de 12 y 31', () => {
    expect(parseDate('1043-03-12')).toEqual({ year: 1043, month: 3, day: 12 });
    expect(parseDate('0012-14-36')).toEqual({ year: 12, month: 14, day: 36 });
    expect(parseDate('')).toBeNull();
    expect(parseDate('ayer')).toBeNull();
    expect(parseDate(42)).toBeNull();
    expect(dateText({ year: 12, month: 3, day: 7 })).toBe('0012-03-07');
    expect(dateText({ year: 1043, month: 14, day: 36 })).toBe('1043-14-36');
  });

  it('con un calendario propio cuenta años, días y días de la semana según sus meses', () => {
    const c = munfamed();
    expect(isStandardCalendar(c)).toBe(false);
    expect(formatDate(c, { year: 1043, month: 2, day: 3 })).toBe('3 de Brumal de 1043');
    expect(formatDate(c, { year: 1043, month: 12, day: 3 })).toBe('3 de mes 12 de 1043');
    // Nació el 12 de Cenizo de 1000: cumple 43 justo hoy; un día después seguiría con 42.
    const born = { year: 1000, month: 3, day: 12 };
    expect(yearsBetween(born, todayOf(c))).toBe(43);
    expect(yearsBetween({ year: 1000, month: 3, day: 13 }, todayOf(c))).toBe(42);
    expect(yearsBetween({ year: 1000, month: 2, day: 36 }, todayOf(c))).toBe(43);
    expect(yearsBetween(todayOf(c), born)).toBe(-43);
    // Un año son 360 días; de un Albor al siguiente, 360.
    expect(daysBetween(c, { year: 1042, month: 1, day: 1 }, { year: 1043, month: 1, day: 1 })).toBe(360);
    // La semana de seis días da la vuelta cada 36 días: el 1 y el 37 caen en el mismo día.
    expect(weekdayOf(c, { year: 1, month: 1, day: 1 })).toBe('Soldía');
    expect(weekdayOf(c, { year: 1, month: 2, day: 1 })).toBe('Soldía');
    expect(weekdayOf(c, { year: 1, month: 1, day: 4 })).toBe('Fuegodía');
  });

  it('valida que la fecha exista en el calendario', () => {
    const c = munfamed();
    expect(isValidDate(c, { year: 1043, month: 10, day: 36 })).toBe(true);
    expect(isValidDate(c, { year: 1043, month: 11, day: 1 })).toBe(false);
    expect(isValidDate(c, { year: 1043, month: 1, day: 37 })).toBe(false);
    expect(isValidDate(defaultCalendar(), { year: 2023, month: 2, day: 29 })).toBe(false);
  });

  it('repara un calendario incompleto o inexistente', () => {
    expect(normalizeCalendar(undefined)).toEqual(defaultCalendar());
    const fixed = normalizeCalendar({
      months: [{ name: 'Uno', days: 0 }, { days: 10 }],
      weekdays: ['A'],
      firstWeekday: 5,
    });
    expect(fixed.months).toEqual([
      { name: 'Uno', days: 30 },
      { name: 'Mes 2', days: 10 },
    ]);
    expect(fixed.weekdays).toEqual(['A']);
    expect(fixed.firstWeekday).toBe(0);
    expect(fixed.today).toBeNull();
    expect(normalizeCalendar({ today: { year: 5, month: 1 } }).today).toBeNull();
  });
});
