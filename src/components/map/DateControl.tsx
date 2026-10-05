import { X } from 'lucide-react';
import { dateText, daysInMonth, parseDate, todayOf, type Calendar, type WorldDate } from '../../domain/calendar';
import type { FieldValue } from '../../domain/types';

/**
 * Control de fecha para un calendario propio: día, mes por su nombre y año. Al rellenar la primera
 * parte, las demás toman la fecha actual del mundo; el aspa vacía el valor.
 */
export function DateControl({
  calendar,
  value,
  onChange,
  autoFocus,
  'aria-label': ariaLabel,
}: {
  calendar: Calendar;
  value: FieldValue | undefined;
  onChange: (v: FieldValue) => void;
  autoFocus?: boolean;
  'aria-label'?: string;
}) {
  const date = parseDate(value);
  const base = (): WorldDate => date ?? todayOf(calendar);
  const set = (patch: Partial<WorldDate>) => {
    const next = { ...base(), ...patch };
    // El día se recorta al mes elegido para no guardar fechas imposibles.
    const max = daysInMonth(calendar, next.year, next.month);
    if (max && next.day > max) next.day = max;
    if (next.day < 1) next.day = 1;
    onChange(dateText(next));
  };
  const maxDay = date ? daysInMonth(calendar, date.year, date.month) || undefined : undefined;
  return (
    <div className="date-control" role="group" aria-label={ariaLabel}>
      <input
        type="number"
        className="date-day"
        aria-label="Día"
        placeholder="Día"
        min={1}
        max={maxDay}
        autoFocus={autoFocus}
        value={date ? date.day : ''}
        onChange={e => e.target.value !== '' && set({ day: Number(e.target.value) })}
      />
      <select
        className="date-month"
        aria-label="Mes"
        value={date ? String(date.month) : ''}
        onChange={e => e.target.value !== '' && set({ month: Number(e.target.value) })}
      >
        <option value="" disabled>
          Mes
        </option>
        {calendar.months.map((m, i) => (
          <option key={i} value={String(i + 1)}>
            {m.name}
          </option>
        ))}
        {date && date.month > calendar.months.length && <option value={String(date.month)}>mes {date.month}</option>}
      </select>
      <input
        type="number"
        className="date-year"
        aria-label="Año"
        placeholder="Año"
        value={date ? date.year : ''}
        onChange={e => e.target.value !== '' && set({ year: Number(e.target.value) })}
      />
      {date && (
        <button
          type="button"
          className="icon-btn"
          aria-label="Vaciar la fecha"
          title="Vaciar"
          onClick={() => onChange('')}
        >
          <X size={14} aria-hidden />
        </button>
      )}
    </div>
  );
}
