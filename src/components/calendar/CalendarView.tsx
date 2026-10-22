import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Download,
  ListFilter,
  Plus,
  Settings2,
  TriangleAlert,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useState, type DragEvent, type HTMLAttributes, type ReactNode } from 'react';
import {
  AGENDA_KINDS,
  addDays,
  addMonths,
  createAgendaEntry,
  dayTitle,
  entriesInRange,
  entriesOn,
  fieldDatesAreReal,
  fieldDatesInRange,
  isoWeek,
  monthGrid,
  monthTitle,
  overdueEntries,
  startOfWeek,
  todayText,
  WEEKDAY_NAMES,
  type AgendaEntry,
  type AgendaMode,
  type AgendaPatch,
  type FieldDateItem,
} from '../../domain/agenda';
import { now, uid } from '../../domain/factories';
import { getNode } from '../../domain/selectors';
import { agendaFileName, agendaIcs } from '../../services/agendaExport';
import { downloadText } from '../../services/files';
import { useApp } from '../../state/AppContext';
import { useAuth } from '../../state/auth';
import { useProjectAccess } from '../../state/groups';
import { useNavigation } from '../../state/navigation';
import { usePreferences, type AgendaPreference } from '../../state/preferences';
import { anchorOf, type Anchor } from '../common/anchor';
import { Button, IconButton } from '../common/Button';
import { Menu, type MenuEntry } from '../common/Menu';
import { NodeAvatar } from '../common/NodeAvatar';
import { Popover } from '../common/Popover';
import { Splitter } from '../common/Splitter';
import { useToast } from '../common/toasts';
import { CalendarDialog } from '../layout/CalendarDialog';
import { EntryChip } from './agendaParts';
import { AGENDA_DRAG_TYPE, entryTitle, initials } from './agendaUi';
import { EntryPanel } from './EntryPanel';
import { useGroupMembers } from './useGroupMembers';

const MODES: [AgendaMode, string][] = [
  ['month', 'Mes'],
  ['week', 'Semana'],
  ['list', 'Lista'],
];
const NARROW = '(max-width: 760px)';
/** Entradas que caben en una celda del mes antes de «+N». */
const MONTH_CELL_LIMIT = 3;

/**
 * Vista «Calendario» (docs/roadmaps/ROADMAP_CALENDARIO.md, fase 3): la agenda del proyecto en días
 * reales, por mes, por semana o en lista. Doble clic en un día o «Nueva» crea una entrada; se arrastra a
 * otro día para moverla y se marca como hecha desde la propia rejilla. La entrada abierta se edita en el
 * panel lateral, como la ficha de un nodo.
 */
export function CalendarView() {
  const { project, dispatch } = useApp();
  const { canEdit, group } = useProjectAccess();
  const { user } = useAuth();
  const { preferences, setPreference } = usePreferences();
  const { agendaRequest, clearAgendaRequest, select } = useNavigation();
  const toast = useToast();
  const { members, nameOf } = useGroupMembers(group);
  const settings = project.calendar.settings;
  const narrow = useMediaQuery(NARROW);
  const today = useToday();

  const [mode, setMode] = useState<AgendaMode>(() =>
    window.matchMedia(NARROW).matches ? 'list' : settings.defaultMode,
  );
  const [cursor, setCursor] = useState(today);
  const [openId, setOpenId] = useState<string | null>(null);
  const [createdId, setCreatedId] = useState<string | null>(null);
  const [showPast, setShowPast] = useState(false);
  const [menu, setMenu] = useState<{ kind: 'filters' | 'export'; anchor: Anchor } | null>(null);
  const [dayPopover, setDayPopover] = useState<{ date: string; anchor: Anchor } | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [dropDay, setDropDay] = useState<string | null>(null);
  const closeMenu = useCallback(() => setMenu(null), []);
  const closeDayPopover = useCallback(() => setDayPopover(null), []);

  const filters = preferences.agenda;
  const setFilter = (patch: Partial<AgendaPreference>) => setPreference('agenda', { ...filters, ...patch });
  const realFieldDates = fieldDatesAreReal(project);
  const showFieldDates = filters.fieldDates && realFieldDates;
  const me = user?.id.toLowerCase() ?? null;

  const visible = useMemo(
    () =>
      project.agenda.filter(
        e =>
          !filters.hiddenKinds.includes(e.kind) &&
          !(filters.hideDone && e.done) &&
          !(group && filters.onlyMine && e.assignee?.toLowerCase() !== me),
      ),
    [project.agenda, filters, group, me],
  );
  const assigneeLabel = (e: AgendaEntry) => (group && e.assignee ? initials(nameOf(e.assignee)) : null);

  // Entrada abierta: puede desaparecer al deshacer o al llegar cambios del grupo.
  const openEntry = openId ? (project.agenda.find(e => e.id === openId) ?? null) : null;

  const create = useCallback(
    (date: string, patch: AgendaPatch = {}) => {
      if (!canEdit) return;
      const id = uid('agenda');
      const kind = patch.kind ?? (date < todayText() ? 'note' : 'task');
      dispatch({ type: 'add-agenda-entry', entry: createAgendaEntry(id, { kind, ...patch, date }, now()) });
      setOpenId(id);
      setCreatedId(id);
      setCursor(date);
    },
    [canEdit, dispatch],
  );

  // Peticiones de otras vistas (Salud, la ficha del nodo, los comentarios del grupo): abrir una entrada.
  // Se atienden al pintar, una vez por petición, y después se olvidan para no repetirlas al volver.
  const [handledRequest, setHandledRequest] = useState<number | null>(null);
  if (agendaRequest && agendaRequest.key !== handledRequest) {
    setHandledRequest(agendaRequest.key);
    const entry = project.agenda.find(e => e.id === agendaRequest.entryId);
    if (entry) {
      setOpenId(entry.id);
      setCreatedId(agendaRequest.created ? entry.id : null);
      setCursor(entry.date);
    }
  }
  useEffect(() => {
    if (agendaRequest) clearAgendaRequest();
  }, [agendaRequest, clearAgendaRequest]);

  const open = (id: string) => {
    setOpenId(id);
    setCreatedId(null);
    setDayPopover(null);
  };
  const toggle = (id: string) => dispatch({ type: 'toggle-agenda-entry', id });
  const remove = () => {
    if (!openEntry) return;
    dispatch({ type: 'delete-agenda-entry', id: openEntry.id });
    toast({ message: `«${entryTitle(openEntry)}» eliminada de la agenda`, undoable: true });
    setOpenId(null);
  };

  // Arrastrar una entrada a otro día.
  const dropProps = (date: string) =>
    canEdit
      ? {
          onDragOver: (event: DragEvent) => {
            if (!event.dataTransfer.types.includes(AGENDA_DRAG_TYPE)) return;
            event.preventDefault();
            event.dataTransfer.dropEffect = 'move';
            setDropDay(date);
          },
          onDragLeave: () => setDropDay(d => (d === date ? null : d)),
          onDrop: (event: DragEvent) => {
            const id = event.dataTransfer.getData(AGENDA_DRAG_TYPE);
            setDropDay(null);
            if (!id) return;
            event.preventDefault();
            dispatch({ type: 'move-agenda-entry', id, date });
          },
        }
      : {};

  const chip = (e: AgendaEntry, day?: string) => (
    <EntryChip
      key={e.id}
      entry={e}
      day={day}
      today={today}
      selected={e.id === openId}
      canEdit={canEdit}
      assignee={assigneeLabel(e)}
      onOpen={open}
      onToggle={toggle}
    />
  );
  const fieldChip = (item: FieldDateItem) => {
    const node = getNode(project, item.nodeId);
    return (
      <button
        key={item.key}
        type="button"
        className="agenda-field-date"
        title={`${item.title} · ${item.fieldLabel} (fecha de la ficha)`}
        onClick={() => select({ kind: 'node', id: item.nodeId }, { reveal: true })}
      >
        {node && <NodeAvatar project={project} node={node} size="sm" />}
        <span className="agenda-chip-title">{item.title}</span>
        <span className="agenda-field-label">{item.fieldLabel}</span>
      </button>
    );
  };

  // --- Cabecera ---
  const step = (direction: 1 | -1) =>
    setCursor(c => (mode === 'month' ? addMonths(c, direction) : addDays(c, 7 * direction)));
  const weekStart = startOfWeek(cursor, settings.weekStart);
  const heading =
    mode === 'month'
      ? monthTitle(cursor)
      : mode === 'week'
        ? weekHeading(weekStart)
        : showPast
          ? 'Toda la agenda'
          : 'Lo que viene';
  const overdue = overdueEntries(visible, today);

  const filterEntries: MenuEntry[] = [
    { section: 'Tipos de entrada' },
    ...AGENDA_KINDS.map(k => ({
      label: k.plural,
      checked: !filters.hiddenKinds.includes(k.id),
      onSelect: () =>
        setFilter({
          hiddenKinds: filters.hiddenKinds.includes(k.id)
            ? filters.hiddenKinds.filter(id => id !== k.id)
            : [...filters.hiddenKinds, k.id],
        }),
    })),
    'separator',
    {
      label: 'Ocultar las hechas',
      checked: filters.hideDone,
      onSelect: () => setFilter({ hideDone: !filters.hideDone }),
    },
    ...(realFieldDates
      ? [
          {
            label: 'Fechas de las fichas',
            hint: 'Solo lectura',
            checked: filters.fieldDates,
            onSelect: () => setFilter({ fieldDates: !filters.fieldDates }),
          },
        ]
      : []),
    ...(group
      ? [
          {
            label: 'Solo lo asignado a mí',
            checked: filters.onlyMine,
            onSelect: () => setFilter({ onlyMine: !filters.onlyMine }),
          },
        ]
      : []),
  ];
  const exportEntries: MenuEntry[] = [
    {
      label: 'Exportar la agenda (.ics)',
      icon: Download,
      onSelect: () => downloadText(agendaFileName(project), agendaIcs(project), 'text/calendar'),
    },
    ...(realFieldDates
      ? [
          {
            label: 'Con las fechas de las fichas (.ics)',
            icon: Download,
            onSelect: () =>
              downloadText(agendaFileName(project), agendaIcs(project, { fieldDates: true }), 'text/calendar'),
          },
        ]
      : []),
  ];
  const filtered =
    filters.hiddenKinds.length > 0 || filters.hideDone || (group !== null && filters.onlyMine) || !filters.fieldDates;

  const columns = ['minmax(0, 1fr)', openEntry ? `${preferences.agendaPanelWidth}px` : null].filter(Boolean);

  return (
    <main
      className={`calendar-layout ${openEntry ? 'with-panel' : ''}`}
      style={{ gridTemplateColumns: columns.join(' ') }}
    >
      <section className="calendar-main" aria-label="Calendario del proyecto">
        <header className="calendar-toolbar">
          <div className="calendar-title">
            <CalendarDays size={20} aria-hidden />
            <h2>{heading}</h2>
          </div>
          {mode !== 'list' && (
            <div className="calendar-nav">
              <IconButton
                icon={ChevronLeft}
                label={mode === 'month' ? 'Mes anterior' : 'Semana anterior'}
                onClick={() => step(-1)}
              />
              <Button size="sm" onClick={() => setCursor(today)}>
                Hoy
              </Button>
              <IconButton
                icon={ChevronRight}
                label={mode === 'month' ? 'Mes siguiente' : 'Semana siguiente'}
                onClick={() => step(1)}
              />
            </div>
          )}
          <div className="segmented calendar-modes" role="group" aria-label="Modo">
            {MODES.map(([id, label]) => (
              <button key={id} type="button" aria-pressed={mode === id} onClick={() => setMode(id)}>
                {label}
              </button>
            ))}
          </div>
          <div className="calendar-actions">
            <IconButton
              icon={ListFilter}
              label="Filtros"
              active={filtered}
              onClick={e => setMenu({ kind: 'filters', anchor: anchorOf(e.currentTarget) })}
            />
            <IconButton
              icon={Download}
              label="Exportar"
              onClick={e => setMenu({ kind: 'export', anchor: anchorOf(e.currentTarget) })}
            />
            <IconButton icon={Settings2} label="Configuración del calendario…" onClick={() => setSettingsOpen(true)} />
            {canEdit && (
              <Button variant="primary" size="sm" icon={Plus} onClick={() => create(mode === 'list' ? today : cursor)}>
                Nueva
              </Button>
            )}
          </div>
        </header>

        {mode === 'month' && (
          <MonthGrid
            cursor={cursor}
            today={today}
            weekStart={settings.weekStart}
            workdays={settings.workdays}
            weekNumbers={settings.weekNumbers}
            narrow={narrow}
            entries={visible}
            fieldDates={showFieldDates ? project : null}
            dropDay={dropDay}
            canEdit={canEdit}
            renderChip={chip}
            renderFieldDate={fieldChip}
            dropProps={dropProps}
            onCreate={create}
            onShowDay={(date, anchor) => setDayPopover({ date, anchor })}
          />
        )}
        {mode === 'week' && (
          <WeekGrid
            start={weekStart}
            today={today}
            workdays={settings.workdays}
            entries={visible}
            fieldDates={showFieldDates ? project : null}
            dropDay={dropDay}
            canEdit={canEdit}
            renderChip={chip}
            renderFieldDate={fieldChip}
            dropProps={dropProps}
            onCreate={create}
          />
        )}
        {mode === 'list' && (
          <AgendaList
            today={today}
            entries={visible}
            overdue={overdue}
            showPast={showPast}
            onShowPast={setShowPast}
            fieldDates={showFieldDates ? project : null}
            renderChip={chip}
            renderFieldDate={fieldChip}
            empty={
              project.agenda.length === 0 ? (
                <div className="calendar-empty">
                  <CalendarDays size={28} aria-hidden />
                  <h3>La agenda está vacía</h3>
                  <p>
                    Apunta notas, tareas, entregas y eventos en días concretos: «Nueva», o doble clic en un día del mes
                    o de la semana. Cada entrada puede enlazar nodos del proyecto y mencionarlos con [[su nombre]].
                  </p>
                  {canEdit && (
                    <Button variant="primary" icon={Plus} onClick={() => create(today)}>
                      Nueva entrada
                    </Button>
                  )}
                </div>
              ) : null
            }
          />
        )}
        {mode !== 'list' && overdue.length > 0 && (
          <button type="button" className="calendar-overdue-bar" onClick={() => setMode('list')}>
            <TriangleAlert size={14} aria-hidden />
            {overdue.length === 1 ? '1 tarea o entrega vencida' : `${overdue.length} tareas o entregas vencidas`} · Ver
            en la lista
          </button>
        )}
      </section>

      {openEntry && (
        <aside className="side-panel right agenda-panel" aria-label="Entrada de la agenda">
          <Splitter
            width={preferences.agendaPanelWidth}
            grow="left"
            label="Redimensionar el panel de la entrada"
            onChange={width => setPreference('agendaPanelWidth', width)}
          />
          <EntryPanel
            key={openEntry.id}
            entry={openEntry}
            focusTitle={createdId === openEntry.id}
            canEdit={canEdit}
            group={group}
            members={members}
            nameOf={nameOf}
            onClose={() => setOpenId(null)}
            onDelete={remove}
          />
        </aside>
      )}

      {menu && (
        <Menu
          anchor={menu.anchor}
          entries={menu.kind === 'filters' ? filterEntries : exportEntries}
          label={menu.kind === 'filters' ? 'Filtros del calendario' : 'Exportar la agenda'}
          onClose={closeMenu}
        />
      )}
      {dayPopover && (
        <Popover anchor={dayPopover.anchor} onClose={closeDayPopover} label={dayTitle(dayPopover.date)}>
          <div className="calendar-day-popover">
            <h3>{dayTitle(dayPopover.date, true)}</h3>
            {entriesOn(visible, dayPopover.date).map(e => chip(e, dayPopover.date))}
            {showFieldDates && fieldDatesInRange(project, dayPopover.date, dayPopover.date).map(fieldChip)}
            {entriesOn(visible, dayPopover.date).length === 0 &&
              !(showFieldDates && fieldDatesInRange(project, dayPopover.date, dayPopover.date).length) && (
                <p className="muted-note">Nada este día.</p>
              )}
            {canEdit && (
              <Button
                size="sm"
                icon={Plus}
                onClick={() => {
                  create(dayPopover.date);
                  setDayPopover(null);
                }}
              >
                Nueva en este día
              </Button>
            )}
          </div>
        </Popover>
      )}
      {settingsOpen && <CalendarDialog onClose={() => setSettingsOpen(false)} />}
    </main>
  );
}

type DropProps = (date: string) => Pick<HTMLAttributes<HTMLDivElement>, 'onDragOver' | 'onDragLeave' | 'onDrop'>;

interface GridProps {
  today: string;
  workdays: number[];
  entries: AgendaEntry[];
  /** El proyecto si hay que pintar las fechas de las fichas. */
  fieldDates: Parameters<typeof fieldDatesInRange>[0] | null;
  dropDay: string | null;
  canEdit: boolean;
  renderChip: (e: AgendaEntry, day?: string) => ReactNode;
  renderFieldDate: (item: FieldDateItem) => ReactNode;
  dropProps: DropProps;
  onCreate: (date: string) => void;
}

function MonthGrid({
  cursor,
  weekStart,
  weekNumbers,
  narrow,
  onShowDay,
  today,
  workdays,
  entries,
  fieldDates,
  dropDay,
  canEdit,
  renderChip,
  renderFieldDate,
  dropProps,
  onCreate,
}: GridProps & {
  cursor: string;
  weekStart: number;
  weekNumbers: boolean;
  narrow: boolean;
  onShowDay: (date: string, anchor: Anchor) => void;
}) {
  const days = monthGrid(cursor, weekStart);
  const month = cursor.slice(0, 7);
  const weeks: string[][] = [];
  for (let i = 0; i < days.length; i += 7) weeks.push(days.slice(i, i + 7));
  const fieldItems = fieldDates ? fieldDatesInRange(fieldDates, days[0], days.at(-1)!) : [];
  const headers = Array.from({ length: 7 }, (_, i) => (weekStart + i) % 7);

  return (
    <div className={`calendar-month ${weekNumbers ? 'with-weeks' : ''}`} role="grid" aria-label={monthTitle(cursor)}>
      <div className="calendar-month-head" role="row">
        {weekNumbers && <span className="calendar-week-number" aria-hidden />}
        {headers.map(d => (
          <span key={d} role="columnheader" className={workdays.includes(d) ? '' : 'rest'}>
            <span className="long">{WEEKDAY_NAMES[d]}</span>
            <span className="short">{WEEKDAY_NAMES[d].slice(0, 3)}</span>
          </span>
        ))}
      </div>
      {weeks.map(week => (
        <div key={week[0]} className="calendar-month-row" role="row">
          {weekNumbers && (
            <span className="calendar-week-number" title="Semana">
              {isoWeek(week[0])}
            </span>
          )}
          {week.map(day => {
            const dayEntries = entriesOn(entries, day);
            const dayFields = fieldItems.filter(i => i.date === day);
            const items = dayEntries.length + dayFields.length;
            const hidden = Math.max(0, items - MONTH_CELL_LIMIT);
            const shownEntries = dayEntries.slice(0, MONTH_CELL_LIMIT);
            const shownFields = dayFields.slice(0, Math.max(0, MONTH_CELL_LIMIT - shownEntries.length));
            const weekday = (new Date(`${day}T00:00:00Z`).getUTCDay() + 6) % 7;
            const classes = [
              'calendar-day',
              day.slice(0, 7) !== month && 'outside',
              day === today && 'today',
              !workdays.includes(weekday) && 'rest',
              dropDay === day && 'drop',
            ];
            return (
              <div
                key={day}
                role="gridcell"
                className={classes.filter(Boolean).join(' ')}
                onDoubleClick={event => {
                  if ((event.target as HTMLElement).closest('button, .agenda-chip')) return;
                  if (canEdit) onCreate(day);
                }}
                onClick={event => {
                  // En el móvil las celdas son pequeñas: un toque enseña el día entero.
                  if (narrow && !(event.target as HTMLElement).closest('button'))
                    onShowDay(day, anchorOf(event.currentTarget));
                }}
                {...dropProps(day)}
              >
                <button
                  type="button"
                  className="calendar-day-number"
                  aria-label={dayTitle(day, true)}
                  onClick={e => onShowDay(day, anchorOf(e.currentTarget))}
                >
                  {Number(day.slice(8))}
                </button>
                {narrow ? (
                  items > 0 && (
                    <span className="calendar-dots" aria-label={items === 1 ? '1 entrada' : `${items} entradas`}>
                      {dayEntries.slice(0, 4).map(e => (
                        <span key={e.id} className={`calendar-dot kind-${e.kind} ${e.done ? 'done' : ''}`} />
                      ))}
                      {dayFields.length > 0 && dayEntries.length < 4 && <span className="calendar-dot field" />}
                    </span>
                  )
                ) : (
                  <div className="calendar-day-items">
                    {shownEntries.map(e => renderChip(e, day))}
                    {shownFields.map(renderFieldDate)}
                    {hidden > 0 && (
                      <button
                        type="button"
                        className="calendar-more"
                        onClick={e => onShowDay(day, anchorOf(e.currentTarget))}
                      >
                        +{hidden} más
                      </button>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}

/**
 * La semana: una columna por día con las entradas de todo el día arriba. Si alguna tiene hora, debajo
 * van las horas (de la primera a la última que se usan) con cada entrada en la suya; si no, solo días.
 */
function WeekGrid({
  start,
  today,
  workdays,
  entries,
  fieldDates,
  dropDay,
  canEdit,
  renderChip,
  renderFieldDate,
  dropProps,
  onCreate,
}: GridProps & { start: string }) {
  const days = Array.from({ length: 7 }, (_, i) => addDays(start, i));
  const end = days[6];
  const inWeek = entriesInRange(entries, start, end);
  const fieldItems = fieldDates ? fieldDatesInRange(fieldDates, start, end) : [];
  const timed = inWeek.filter(e => e.time && !e.endDate);
  const hours = timed.map(e => Number(e.time!.slice(0, 2)));
  const range = hours.length
    ? Array.from({ length: Math.max(...hours) - Math.min(...hours) + 1 }, (_, i) => Math.min(...hours) + i)
    : [];

  return (
    <div className={`calendar-week ${range.length ? 'with-hours' : ''}`}>
      <div className="calendar-week-row calendar-week-head">
        {range.length > 0 && <span className="calendar-hour" />}
        {days.map(day => (
          <div
            key={day}
            className={`calendar-week-day-head ${day === today ? 'today' : ''} ${workdays.includes(weekdayOf(day)) ? '' : 'rest'}`}
          >
            <span>{WEEKDAY_NAMES[weekdayOf(day)].slice(0, 3)}</span>
            <strong>{Number(day.slice(8))}</strong>
          </div>
        ))}
      </div>
      <div className="calendar-week-row calendar-week-allday">
        {range.length > 0 && <span className="calendar-hour">Todo el día</span>}
        {days.map(day => (
          <div
            key={day}
            className={`calendar-week-cell ${dropDay === day ? 'drop' : ''} ${workdays.includes(weekdayOf(day)) ? '' : 'rest'}`}
            onDoubleClick={event => {
              if ((event.target as HTMLElement).closest('button, .agenda-chip')) return;
              if (canEdit) onCreate(day);
            }}
            {...dropProps(day)}
          >
            {entriesOn(entries, day)
              .filter(e => !e.time || e.endDate)
              .map(e => renderChip(e, day))}
            {fieldItems.filter(i => i.date === day).map(renderFieldDate)}
            {!range.length && entriesOn(entries, day).length === 0 && canEdit && (
              <span className="calendar-week-hint">Doble clic para apuntar algo</span>
            )}
          </div>
        ))}
      </div>
      {range.map(hour => (
        <div key={hour} className="calendar-week-row calendar-week-hour">
          <span className="calendar-hour">{String(hour).padStart(2, '0')}:00</span>
          {days.map(day => (
            <div
              key={day}
              className={`calendar-week-cell ${workdays.includes(weekdayOf(day)) ? '' : 'rest'}`}
              {...dropProps(day)}
            >
              {timed.filter(e => e.date === day && Number(e.time!.slice(0, 2)) === hour).map(e => renderChip(e, day))}
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

const weekdayOf = (date: string) => (new Date(`${date}T00:00:00Z`).getUTCDay() + 6) % 7;

/** La lista: vencidas arriba y, después, lo que viene por días (o toda la agenda con «anteriores»). */
function AgendaList({
  today,
  entries,
  overdue,
  showPast,
  onShowPast,
  fieldDates,
  renderChip,
  renderFieldDate,
  empty,
}: {
  today: string;
  entries: AgendaEntry[];
  overdue: AgendaEntry[];
  showPast: boolean;
  onShowPast: (show: boolean) => void;
  fieldDates: Parameters<typeof fieldDatesInRange>[0] | null;
  renderChip: (e: AgendaEntry, day?: string) => ReactNode;
  renderFieldDate: (item: FieldDateItem) => ReactNode;
  empty: ReactNode;
}) {
  const from = showPast ? '0001-01-01' : today;
  const listed = entriesInRange(entries, from, '9999-12-31').filter(e => showPast || !overdue.includes(e));
  const fieldItems = fieldDates ? fieldDatesInRange(fieldDates, from, '9999-12-31') : [];
  // Cada entrada va en el día en que empieza, o en hoy si empezó antes y sigue en curso.
  const dayOf = (e: AgendaEntry) => (!showPast && e.date < today ? today : e.date);
  const days = [...new Set([...listed.map(dayOf), ...fieldItems.map(i => i.date)])].sort();

  if (empty) return <div className="calendar-list">{empty}</div>;
  return (
    <div className="calendar-list">
      {!showPast && overdue.length > 0 && (
        <section className="calendar-list-day overdue">
          <h3>
            <TriangleAlert size={14} aria-hidden /> Vencidas
          </h3>
          {overdue.map(e => renderChip(e))}
        </section>
      )}
      {days.length === 0 && (!overdue.length || showPast) && (
        <p className="muted-note calendar-list-empty">Nada por delante con estos filtros.</p>
      )}
      {days.map(day => (
        <section key={day} className={`calendar-list-day ${day === today ? 'today' : ''}`}>
          <h3>
            {day === today ? 'Hoy · ' : day === addDays(today, 1) ? 'Mañana · ' : ''}
            {dayTitle(day, day.slice(0, 4) !== today.slice(0, 4))}
          </h3>
          {listed.filter(e => dayOf(e) === day).map(e => renderChip(e, day))}
          {fieldItems.filter(i => i.date === day).map(renderFieldDate)}
        </section>
      ))}
      <Button size="sm" variant="ghost" onClick={() => onShowPast(!showPast)}>
        {showPast ? 'Solo lo que viene' : 'Ver también lo anterior'}
      </Button>
    </div>
  );
}

/** «19 – 25 de octubre de 2026», o con los dos meses si la semana los cruza. */
function weekHeading(start: string): string {
  const end = addDays(start, 6);
  const title = monthTitle(end);
  return start.slice(0, 7) === end.slice(0, 7)
    ? `${Number(start.slice(8))} – ${Number(end.slice(8))} de ${title.charAt(0).toLowerCase()}${title.slice(1)}`
    : `${dayTitle(start).split(', ')[1]} – ${dayTitle(end, true).split(', ')[1]}`;
}

function useMediaQuery(query: string) {
  const [matches, setMatches] = useState(() => window.matchMedia(query).matches);
  useEffect(() => {
    const list = window.matchMedia(query);
    const onChange = () => setMatches(list.matches);
    list.addEventListener('change', onChange);
    return () => list.removeEventListener('change', onChange);
  }, [query]);
  return matches;
}

/** El día de hoy, que cambia solo si la página sigue abierta al pasar la medianoche. */
function useToday() {
  const [today, setToday] = useState(todayText);
  useEffect(() => {
    const timer = window.setInterval(() => setToday(t => (t === todayText() ? t : todayText())), 60_000);
    return () => window.clearInterval(timer);
  }, []);
  return today;
}
