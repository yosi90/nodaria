import type { AppState } from '../domain/types';
import { appReducer, type Action } from './reducer';

export const HISTORY_LIMIT = 100;
/** Cambios consecutivos sobre el mismo elemento dentro de esta ventana se deshacen como uno solo. */
export const COALESCE_MS = 1000;

export interface History {
  past: AppState[];
  present: AppState;
  future: AppState[];
  lastGroup: string | null;
  lastAt: number;
}

export type HistoryAction = { type: 'apply'; action: Action; at: number } | { type: 'undo' } | { type: 'redo' };

export const createHistory = (present: AppState): History => ({
  past: [],
  present,
  future: [],
  lastGroup: null,
  lastAt: 0,
});

/** Las ediciones de campo se agrupan por elemento para no crear un paso por pulsación. */
function groupOf(action: Action) {
  if (action.type === 'update-node') return `node:${action.id}`;
  if (action.type === 'update-relation') return `relation:${action.relation.id}`;
  if (action.type === 'update-schema') return `schema:${action.schema.id}`;
  if (action.type === 'rename-project') return 'project-name';
  if (action.type === 'move-nodes') return `move:${Object.keys(action.positions).sort().join(',')}`;
  return null;
}

export function historyReducer(history: History, action: HistoryAction): History {
  if (action.type === 'undo') {
    const previous = history.past.at(-1);
    if (!previous) return history;
    return {
      past: history.past.slice(0, -1),
      present: previous,
      future: [history.present, ...history.future],
      lastGroup: null,
      lastAt: 0,
    };
  }
  if (action.type === 'redo') {
    const [next, ...future] = history.future;
    if (!next) return history;
    return { past: [...history.past, history.present], present: next, future, lastGroup: null, lastAt: 0 };
  }

  const present = appReducer(history.present, action.action);
  if (present === history.present) return history;
  // Cambiar de proyecto o de vista es navegación, no una edición: no ocupa un paso de deshacer.
  if (action.action.type === 'set-project' || action.action.type === 'update-view')
    return { ...history, present, lastGroup: null };

  const group = groupOf(action.action);
  const coalesce = group !== null && group === history.lastGroup && action.at - history.lastAt < COALESCE_MS;
  return {
    past: coalesce ? history.past : [...history.past, history.present].slice(-HISTORY_LIMIT),
    present,
    future: [],
    lastGroup: group,
    lastAt: action.at,
  };
}
