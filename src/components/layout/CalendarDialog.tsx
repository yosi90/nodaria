import { CalendarDays, ChevronRight, Globe2, Plus, RotateCcw, Trash2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import {
  defaultCalendar,
  formatDate,
  isStandardCalendar,
  isValidDate,
  parseDate,
  todayOf,
  weekdayOf,
  type AgendaMode,
  type AgendaSettings,
  type Calendar,
  type WorldDate,
} from '../../domain/calendar';
import { WEEKDAY_NAMES, WEEKDAY_SHORT } from '../../domain/agenda';
import { hasWorldCalendar } from '../../domain/projectKinds';
import { allFields } from '../../domain/selectors';
import { useApp } from '../../state/AppContext';
import { Button, IconButton } from '../common/Button';
import { useDialogs } from '../common/dialogs';
import { Modal } from '../common/Modal';

const MODES: [AgendaMode, string][] = [
  ['month', 'Mes'],
  ['week', 'Semana'],
  ['list', 'Lista'],
];

/**
 * Configuración del calendario (docs/roadmaps/ROADMAP_CALENDARIO.md, fase 1). Dos cosas distintas:
 * los ajustes de la agenda (vista «Calendario», siempre con fechas reales) y el calendario propio del
 * proyecto (meses, días de la semana y fecha fija), que usan las fichas, las fórmulas y la Cronología.
 * En Novela y Rol el calendario propio es «del mundo» y va arriba; en el resto es un extra avanzado,
 * abajo y plegado, salvo que ya no sea el gregoriano, para no esconder algo que cambia sus fechas.
 * Cada cambio es una acción deshacible.
 */
export function CalendarDialog({ onClose }: { onClose: () => void }) {
  const { project } = useApp();
  const world = hasWorldCalendar(project.kind);
  const custom = !isStandardCalendar(project.calendar) || project.calendar.today !== null;
  const [open, setOpen] = useState(custom);

  return (
    <Modal title="Configuración del calendario" informational wide onClose={onClose}>
      {world ? (
        <>
          <section className="calendar-world">
            <header>
              <Globe2 size={18} aria-hidden />
              <div>
                <h3>Calendario del mundo</h3>
                <p>
                  Cómo se cuentan los días dentro de la historia. Lo usan las fechas de las fichas, las edades y los
                  días entre fechas de las fórmulas y la Cronología.
                </p>
              </div>
            </header>
            <CustomCalendarEditor />
          </section>
          <AgendaSettingsSection />
        </>
      ) : (
        <>
          <AgendaSettingsSection />
          <details className="calendar-advanced" open={open} onToggle={e => setOpen(e.currentTarget.open)}>
            <summary>
              <ChevronRight size={15} aria-hidden className="calendar-advanced-chevron" />
              <span className="calendar-advanced-text">
                <strong>Calendario personalizado (avanzado)</strong>
                <span>Meses, días de la semana y fecha fija, para proyectos con un calendario inventado.</span>
              </span>
            </summary>
            {custom && (
              <p className="validation-message calendar-custom-notice">
                Este proyecto ya no usa el calendario gregoriano o tiene una fecha fija: sus fichas, fórmulas y
                Cronología cuentan los días con lo de aquí.
              </p>
            )}
            <CustomCalendarEditor />
          </details>
        </>
      )}
    </Modal>
  );
}

/** Ajustes de la vista «Calendario»: con qué día empieza la semana, cuáles se trabajan y cómo se abre. */
function AgendaSettingsSection() {
  const { project, dispatch } = useApp();
  const settings = project.calendar.settings;
  const set = (patch: Partial<AgendaSettings>) =>
    dispatch({
      type: 'update-calendar',
      calendar: { ...project.calendar, settings: { ...settings, ...patch } },
    });
  const toggleWorkday = (day: number) =>
    set({
      workdays: settings.workdays.includes(day)
        ? settings.workdays.filter(d => d !== day)
        : [...settings.workdays, day].sort((a, b) => a - b),
    });

  return (
    <section className="calendar-section calendar-agenda-settings">
      <div className="card-head">
        <h3>
          <CalendarDays size={15} aria-hidden /> Agenda del proyecto
        </h3>
      </div>
      <p className="muted-note">
        La vista «Calendario» (en «Datos») apunta notas, tareas, entregas y eventos en días reales, aunque el proyecto
        tenga un calendario propio.
      </p>
      <div className="calendar-settings-grid">
        <label className="field">
          La semana empieza en
          <select value={String(settings.weekStart)} onChange={e => set({ weekStart: Number(e.target.value) })}>
            {WEEKDAY_NAMES.map((name, i) => (
              <option key={name} value={String(i)}>
                {name}
              </option>
            ))}
          </select>
        </label>
        <div className="field">
          <span>Días laborables</span>
          <div className="calendar-workdays" role="group" aria-label="Días laborables">
            {WEEKDAY_SHORT.map((short, i) => (
              <button
                key={i}
                type="button"
                aria-pressed={settings.workdays.includes(i)}
                title={WEEKDAY_NAMES[i]}
                aria-label={WEEKDAY_NAMES[i]}
                onClick={() => toggleWorkday(i)}
              >
                {short}
              </button>
            ))}
          </div>
          <small>Los demás se ven más suaves.</small>
        </div>
        <div className="field">
          <span>Se abre en</span>
          <div className="segmented" role="group" aria-label="Vista inicial">
            {MODES.map(([mode, label]) => (
              <button
                key={mode}
                type="button"
                aria-pressed={settings.defaultMode === mode}
                onClick={() => set({ defaultMode: mode })}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      </div>
      <label className="check">
        <input type="checkbox" checked={settings.weekNumbers} onChange={e => set({ weekNumbers: e.target.checked })} />
        Números de semana en el mes
      </label>
    </section>
  );
}

/** El calendario propio: fecha actual, meses, bisiestos y días de la semana. */
function CustomCalendarEditor() {
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
    // Los ajustes de la agenda no son parte del calendario propio: se conservan.
    if (ok) set({ ...defaultCalendar(), settings: calendar.settings });
  };

  const standard = isStandardCalendar(calendar);
  return (
    <>
      <p className="templates-intro">
        Las fechas se guardan igual que hasta ahora y se leen con estos nombres; las fórmulas{' '}
        <code>{'{edad(nacimiento)}'}</code>, <code>{'{dias(desde, hasta)}'}</code> y <code>{'{diasemana(fecha)}'}</code>{' '}
        calculan con este calendario y con la fecha actual de aquí.
      </p>

      <section className="calendar-section">
        <div className="card-head">
          <h3>Fecha actual</h3>
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
    </>
  );
}
