/* eslint-disable react-refresh/only-export-components -- provider y hook forman una única API de contexto */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  useState,
  type ReactNode,
} from 'react';
import type { AppState, Project } from '../domain/types';
import { loadState, saveState, type LoadResult } from '../services/storage';
import { createHistory, historyReducer } from './history';
import type { Action } from './reducer';

export type { Action } from './reducer';

const SAVE_DELAY_MS = 400;

interface AppContextValue {
  state: AppState;
  project: Project;
  dispatch: (action: Action) => void;
  undo: () => void;
  redo: () => void;
  canUndo: boolean;
  canRedo: boolean;
  /** Correcciones aplicadas al cargar o importar datos, pendientes de mostrar al usuario. */
  repairs: LoadResult['repairs'];
  reportRepairs: (entry: LoadResult['repairs'][number]) => void;
  dismissRepairs: () => void;
}

const Context = createContext<AppContextValue | null>(null);

export function AppProvider({ children }: { children: ReactNode }) {
  const [initial] = useState(loadState);
  const [history, dispatchHistory] = useReducer(historyReducer, initial.state, createHistory);
  const [repairs, setRepairs] = useState(initial.repairs);
  const state = history.present;
  usePersistence(state);

  const dispatch = useCallback((action: Action) => dispatchHistory({ type: 'apply', action, at: Date.now() }), []);
  const undo = useCallback(() => dispatchHistory({ type: 'undo' }), []);
  const redo = useCallback(() => dispatchHistory({ type: 'redo' }), []);
  const dismissRepairs = useCallback(() => setRepairs([]), []);
  const reportRepairs = useCallback(
    (entry: LoadResult['repairs'][number]) => setRepairs(current => [...current, entry]),
    [],
  );
  const project = state.projects.find(p => p.id === state.activeProjectId) ?? state.projects[0];
  const canUndo = history.past.length > 0;
  const canRedo = history.future.length > 0;

  const value = useMemo(
    () => ({ state, project, dispatch, undo, redo, canUndo, canRedo, repairs, reportRepairs, dismissRepairs }),
    [state, project, dispatch, undo, redo, canUndo, canRedo, repairs, reportRepairs, dismissRepairs],
  );
  return <Context.Provider value={value}>{children}</Context.Provider>;
}

/** Guarda con retardo para no serializar todo el estado en cada pulsación, sin perder el último cambio. */
function usePersistence(state: AppState) {
  useEffect(() => {
    const timer = window.setTimeout(() => saveState(state), SAVE_DELAY_MS);
    const flush = () => saveState(state);
    const flushIfHidden = () => document.visibilityState === 'hidden' && flush();
    window.addEventListener('beforeunload', flush);
    document.addEventListener('visibilitychange', flushIfHidden);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener('beforeunload', flush);
      document.removeEventListener('visibilitychange', flushIfHidden);
    };
  }, [state]);
}

export function useApp() {
  const value = useContext(Context);
  if (!value) throw new Error('useApp debe usarse dentro de AppProvider');
  return value;
}
