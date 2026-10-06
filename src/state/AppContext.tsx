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
import {
  loadState,
  saveFailureOf,
  saveState,
  type LoadDamage,
  type LoadResult,
  type SaveFailure,
} from '../services/storage';
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
  /** Estado al que volvería un deshacer; permite saber si una acción concreta sigue siendo la última. */
  undoTarget: AppState | undefined;
  /** Correcciones aplicadas al cargar o importar datos, pendientes de mostrar al usuario. */
  repairs: LoadResult['repairs'];
  reportRepairs: (entry: LoadResult['repairs'][number]) => void;
  dismissRepairs: () => void;
  /** Por qué falló el último guardado en el navegador; `null` si se guardó bien. */
  saveFailure: SaveFailure | null;
  retrySave: () => void;
  /** Datos que no se pudieron abrir al cargar, pendientes de mostrar. */
  damage: LoadDamage | null;
  /** El usuario ya vio el aviso (y, si no se apartó copia, descargó el original o renunció a él). */
  resolveDamage: () => void;
  /** Hubo proyectos ilegibles al cargar: la sincronización debe recuperarlos, no darlos por borrados. */
  lostOnLoad: boolean;
}

const Context = createContext<AppContextValue | null>(null);

export function AppProvider({ children }: { children: ReactNode }) {
  const [initial] = useState(loadState);
  const [history, dispatchHistory] = useReducer(historyReducer, initial.state, createHistory);
  const [repairs, setRepairs] = useState(initial.repairs);
  const [damage, setDamage] = useState(initial.damage);
  const [saveFailure, setSaveFailure] = useState<SaveFailure | null>(null);
  const state = history.present;
  // Si el original no se pudo apartar, guardar lo sustituiría: se espera a que el usuario decida.
  const save = usePersistence(state, Boolean(damage && !damage.rescued), setSaveFailure);
  const lostOnLoad = Boolean(initial.damage);

  const dispatch = useCallback((action: Action) => dispatchHistory({ type: 'apply', action, at: Date.now() }), []);
  const undo = useCallback(() => dispatchHistory({ type: 'undo' }), []);
  const redo = useCallback(() => dispatchHistory({ type: 'redo' }), []);
  const dismissRepairs = useCallback(() => setRepairs([]), []);
  const resolveDamage = useCallback(() => setDamage(null), []);
  const reportRepairs = useCallback(
    (entry: LoadResult['repairs'][number]) => setRepairs(current => [...current, entry]),
    [],
  );
  const project = state.projects.find(p => p.id === state.activeProjectId) ?? state.projects[0];
  const canUndo = history.past.length > 0;
  const canRedo = history.future.length > 0;
  const undoTarget = history.past.at(-1);

  const value = useMemo(
    () => ({
      state,
      project,
      dispatch,
      undo,
      redo,
      canUndo,
      canRedo,
      undoTarget,
      repairs,
      reportRepairs,
      dismissRepairs,
      saveFailure,
      retrySave: save,
      damage,
      resolveDamage,
      lostOnLoad,
    }),
    [
      state,
      project,
      dispatch,
      undo,
      redo,
      canUndo,
      canRedo,
      undoTarget,
      repairs,
      reportRepairs,
      dismissRepairs,
      saveFailure,
      save,
      damage,
      resolveDamage,
      lostOnLoad,
    ],
  );
  return <Context.Provider value={value}>{children}</Context.Provider>;
}

/**
 * Guarda con retardo para no serializar todo el estado en cada pulsación, sin perder el último cambio.
 * Un fallo (sin espacio, almacenamiento bloqueado) no se pierde en un temporizador: se informa con
 * `onResult`, igual que el siguiente guardado correcto. Devuelve el guardado inmediato para reintentar.
 */
function usePersistence(state: AppState, paused: boolean, onResult: (failure: SaveFailure | null) => void) {
  const save = useCallback(() => {
    if (paused) return;
    try {
      saveState(state);
      onResult(null);
    } catch (error) {
      onResult(saveFailureOf(error));
    }
  }, [state, paused, onResult]);

  useEffect(() => {
    const timer = window.setTimeout(save, SAVE_DELAY_MS);
    const flushIfHidden = () => document.visibilityState === 'hidden' && save();
    window.addEventListener('beforeunload', save);
    document.addEventListener('visibilitychange', flushIfHidden);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener('beforeunload', save);
      document.removeEventListener('visibilitychange', flushIfHidden);
    };
  }, [save]);
  return save;
}

export function useApp() {
  const value = useContext(Context);
  if (!value) throw new Error('useApp debe usarse dentro de AppProvider');
  return value;
}
