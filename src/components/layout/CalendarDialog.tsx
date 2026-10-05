import { Plus, RotateCcw, Trash2 } from 'lucide-react';
import { useMemo } from 'react';
import {
  defaultCalendar,
  formatDate,
  isStandardCalendar,
  isValidDate,
  parseDate,
  todayOf,
  weekdayOf,
  type Calendar,
  type WorldDate,
} from '../../domain/calendar';
import { allFields } from '../../domain/selectors';
import { useApp } from '../../state/AppContext';
import { Button, IconButton } from '../common/Button';
import { useDialogs } from '../common/dialogs';
import { Modal } from '../common/Modal';

/**
 * Calendario del mundo: meses, días de la semana, bisiestos y fecha actual. Se edita en vivo (cada
 * cambio es una acción deshacible) y afecta a cómo se leen las fechas y a las fórmulas de edad.
 */
export function CalendarDialog({ onClose }: { onClose: () => void }) {
  const { project, dispatch } = useApp();
  const { confirm } = useDialogs();
  const calendar = project.calendar;
  const set = (patch: Partial<Calendar>) => dispatch({ type: 'update-calendar', calendar: { ...calendar, ...patch } });
  const updateMonth = (index: number, patch: Partial<Calendar['months'][number]>) =>
    set({ months: calendar.months.map((m, i) => (i === index ? { ...m, ...patch } : m)) });
  const updateWeekday = (index: number, name: string) =>
    set({ weekdays: calendar.weekdays.map((d, i) => (i === index ? name : d)) });
  const removeWeekday = (index: number) => {
    const weekdays = calendar.weekdays.filter((_, i) => i !== index);
    set({ weekdays, firstWeekday: Math.min(calendar.firstWeekday, Math.max(0, weekdays.length - 1)) });
  };
  const today = todayOf(calendar);
  const setToday = (patch: Partial<WorldDate>) => set({ today: { ...today, ...patch } });

  // Fechas ya escritas que el calendario actual no admite (un mes de más, un día que ya no existe).
  const outOfRange = useMemo(() => {
    let count = 0;
    project.nodes.forEach(n => {
      allFields(project, n.typeId).forEach(f => {
        if (f.type !== 'date') return;
        const d = parseDate(n.values[f.id]);
        if (d && !isValidDate(calendar, d)) count++;
      });
    });
    return count;
  }, [project, calendar]);

  const reset = async () => {
    const ok = await confirm({
      title: 'Volver al calendario gregoriano',
      message: 'Se sustituirán los meses, los días de la semana y la fecha actual por los del calendario real.',
      confirmLabel: 'Restablecer',
      danger: true,
    });
    if (ok) set(defaultCalendar());
  };

  const standard = isStandardCalendar(calendar);
  return (
    <Modal title="Calendario del mundo" informational wide onClose={onClose}>
      <p className="templates-intro">
        Define cómo se cuentan los días en este mundo. Las fechas se guardan igual que hasta ahora y se leen con estos
        nombres; las fórmulas <code>{'{edad(nacimiento)}'}</code>, <code>{'{dias(desde, hasta)}'}</code> y{' '}
        <code>{'{diasemana(fecha)}'}</code> calculan con este calendario y con la fecha actual de aquí.
      </p>

      <section className="calendar-section">
        <div className="card-head">
          <h3>Fecha actual del mundo</h3>
        </div>
        <div className="check-row">
          <label>
            <input type="radio" name="today" checked={calendar.today === null} onChange={() => set({ today: null })} />
            La fecha real de hoy
          </label>
          <label>
            <input type="radio" name="today" checked={calendar.today !== null} onChange={() => set({ today })} />
            Una fecha fija
          </label>
        </div>
        {calendar.today !== null && (
          <div className="date-control">
            <input
              type="number"
              className="date-day"
              aria-label="Día"
              min={1}
              value={today.day}
              onChange={e => e.target.value !== '' && setToday({ day: Number(e.target.value) })}
            />
            <select
              className="date-month"
              aria-label="Mes"
              value={String(today.month)}
              onChange={e => setToday({ month: Number(e.target.value) })}
            >
              {calendar.months.map((m, i) => (
                <option key={i} value={String(i + 1)}>
                  {m.name}
                </option>
              ))}
              {today.month > calendar.months.length && <option value={String(today.month)}>mes {today.month}</option>}
            </select>
            <input
              type="number"
              className="date-year"
              aria-label="Año"
              value={today.year}
              onChange={e => e.target.value !== '' && setToday({ year: Number(e.target.value) })}
            />
          </div>
        )}
        <p className="muted-note">
          Hoy es {weekdayOf(calendar, today).toLowerCase()}, {formatDate(calendar, today)}. Las edades se calculan hasta
          esta fecha.
        </p>
      </section>

      <section className="calendar-section">
        <div className="card-head">
          <h3>Meses</h3>
          <Button
            size="sm"
            icon={Plus}
            onClick={() =>
              set({ months: [...calendar.months, { name: `Mes ${calendar.months.length + 1}`, days: 30 }] })
            }
          >
            Mes
          </Button>
        </div>
        <div className="calendar-list">
          {calendar.months.map((m, i) => (
            <div key={i} className="calendar-row">
              <span className="calendar-index">{i + 1}</span>
              <input
                value={m.name}
                aria-label={`Nombre del mes ${i + 1}`}
                onChange={e => updateMonth(i, { name: e.target.value })}
              />
              <input
                type="number"
                min={1}
                value={m.days}
                aria-label={`Días del mes ${i + 1}`}
                onChange={e => e.target.value !== '' && updateMonth(i, { days: Math.max(1, Number(e.target.value)) })}
              />
              <span className="muted">días</span>
              <IconButton
                icon={Trash2}
                label="Quitar mes"
                disabled={calendar.months.length <= 1}
                onClick={() => set({ months: calendar.months.filter((_, j) => j !== i) })}
              />
            </div>
          ))}
        </div>
        <label className="check">
          <input type="checkbox" checked={calendar.leapYears} onChange={e => set({ leapYears: e.target.checked })} />
          Años bisiestos: el segundo mes gana un día cada cuatro años (regla gregoriana)
        </label>
        <p className="muted-note">
          Un año tiene {calendar.months.reduce((sum, m) => sum + m.days, 0)} días
          {calendar.leapYears ? ' (uno más en los bisiestos)' : ''}.
        </p>
      </section>

      <section className="calendar-section">
        <div className="card-head">
          <h3>Días de la semana</h3>
          <Button
            size="sm"
            icon={Plus}
            onClick={() => set({ weekdays: [...calendar.weekdays, `Día ${calendar.weekdays.length + 1}`] })}
          >
            Día
          </Button>
        </div>
        <div className="calendar-list">
          {calendar.weekdays.map((d, i) => (
            <div key={i} className="calendar-row">
              <span className="calendar-index">{i + 1}</span>
              <input
                value={d}
                aria-label={`Nombre del día ${i + 1}`}
                onChange={e => updateWeekday(i, e.target.value)}
              />
              <IconButton
                icon={Trash2}
                label="Quitar día"
                disabled={calendar.weekdays.length <= 1}
                onClick={() => removeWeekday(i)}
              />
            </div>
          ))}
        </div>
        <label className="field">
          El día 1 del mes 1 del año 1 fue
          <select value={String(calendar.firstWeekday)} onChange={e => set({ firstWeekday: Number(e.target.value) })}>
            {calendar.weekdays.map((d, i) => (
              <option key={i} value={String(i)}>
                {d}
              </option>
            ))}
          </select>
          <small>A partir de ahí se deduce el día de la semana de cualquier fecha.</small>
        </label>
      </section>

      {outOfRange > 0 && (
        <p className="validation-message">
          {outOfRange === 1
            ? 'Hay una fecha escrita que no existe en este calendario'
            : `Hay ${outOfRange} fechas escritas que no existen en este calendario`}{' '}
          (un mes o un día fuera de rango). Se conservan tal cual hasta que las corrijas.
        </p>
      )}

      <div className="guide-actions">
        <Button variant="ghost" icon={RotateCcw} disabled={standard && calendar.today === null} onClick={reset}>
          Volver al calendario gregoriano
        </Button>
      </div>
    </Modal>
  );
}
