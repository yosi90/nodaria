import { CalendarClock, Flag, SquareCheckBig, StickyNote, type LucideIcon } from 'lucide-react';
import { MONTH_NAMES, type AgendaEntry, type AgendaKind } from '../../domain/agenda';

/* Piezas sin componentes de la vista «Calendario» (iconos, textos cortos), aparte para la recarga en caliente. */

export const KIND_ICONS: Record<AgendaKind, LucideIcon> = {
  note: StickyNote,
  task: SquareCheckBig,
  deadline: Flag,
  event: CalendarClock,
};

/** Tipo de arrastre de una entrada entre días. */
export const AGENDA_DRAG_TYPE = 'application/x-nodaria-agenda';

export const entryTitle = (e: AgendaEntry) => e.title.trim() || 'Sin título';

/** «22 oct 2026». */
export function shortDate(date: string): string {
  const [y, m, d] = date.split('-').map(Number);
  return `${d} ${MONTH_NAMES[m - 1].slice(0, 3)} ${y}`;
}

/** Iniciales para la insignia de la persona asignada. */
export const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map(part => part[0]!.toUpperCase())
    .join('') || '?';
