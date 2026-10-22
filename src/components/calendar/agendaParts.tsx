import { Flag, Square, SquareCheckBig } from 'lucide-react';
import type { DragEvent } from 'react';
import { isCheckable, isOverdue, kindLabel, type AgendaEntry, type AgendaKind } from '../../domain/agenda';
import { AGENDA_DRAG_TYPE, KIND_ICONS, entryTitle, shortDate } from './agendaUi';

export function KindIcon({ kind, size = 13 }: { kind: AgendaKind; size?: number }) {
  const Icon = KIND_ICONS[kind];
  return <Icon size={size} aria-hidden className={`agenda-kind-icon kind-${kind}`} />;
}

interface EntryChipProps {
  entry: AgendaEntry;
  today: string;
  /** Día de la celda donde se pinta: las de varios días marcan si siguen o empezaron antes. */
  day?: string;
  selected?: boolean;
  canEdit: boolean;
  /** Etiqueta de la persona asignada, si la hay. */
  assignee?: string | null;
  onOpen: (id: string) => void;
  onToggle: (id: string) => void;
  showTime?: boolean;
  /** Enseñar también el día (fuera del calendario, donde la celda no lo dice). */
  showDate?: boolean;
}

/** Una entrada en la rejilla o en la lista: se abre con un clic, se arrastra a otro día y se marca como hecha. */
export function EntryChip({
  entry,
  today,
  day,
  selected,
  canEdit,
  assignee,
  onOpen,
  onToggle,
  showTime = true,
  showDate = false,
}: EntryChipProps) {
  const overdue = isOverdue(entry, today);
  const continues = day !== undefined && entry.endDate !== null && day < entry.endDate;
  const continued = day !== undefined && entry.date < day;
  const classes = [
    'agenda-chip',
    `kind-${entry.kind}`,
    entry.done && 'done',
    overdue && 'overdue',
    selected && 'selected',
    continues && 'continues',
    continued && 'continued',
  ];
  const onDragStart = (event: DragEvent) => {
    event.dataTransfer.setData(AGENDA_DRAG_TYPE, entry.id);
    event.dataTransfer.effectAllowed = 'move';
  };
  const Check = entry.done ? SquareCheckBig : Square;
  return (
    <div
      className={classes.filter(Boolean).join(' ')}
      draggable={canEdit}
      onDragStart={canEdit ? onDragStart : undefined}
      title={`${kindLabel(entry.kind)}: ${entryTitle(entry)}${overdue ? ' (vencida)' : ''}`}
    >
      {isCheckable(entry.kind) ? (
        <button
          type="button"
          className="agenda-check"
          aria-label={
            entry.done ? `Marcar «${entryTitle(entry)}» como pendiente` : `Marcar «${entryTitle(entry)}» como hecha`
          }
          aria-pressed={entry.done}
          disabled={!canEdit}
          onClick={event => {
            event.stopPropagation();
            onToggle(entry.id);
          }}
        >
          <Check size={13} aria-hidden />
        </button>
      ) : (
        <KindIcon kind={entry.kind} />
      )}
      <button type="button" className="agenda-chip-open" onClick={() => onOpen(entry.id)}>
        {entry.kind === 'deadline' && <Flag size={11} aria-hidden className="agenda-kind-icon" />}
        {showDate && <span className="agenda-time">{shortDate(entry.date)}</span>}
        {showTime && entry.time && <span className="agenda-time">{entry.time}</span>}
        <span className="agenda-chip-title">{entryTitle(entry)}</span>
        {assignee && <span className="agenda-assignee">{assignee}</span>}
      </button>
    </div>
  );
}
