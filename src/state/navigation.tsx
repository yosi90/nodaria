/* eslint-disable react-refresh/only-export-components -- provider y hook forman una única API de contexto */
import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import type { Selection } from '../domain/types';

export type View = 'map' | 'table' | 'schema' | 'relations' | 'properties' | 'health';
export type HelpTopic = 'start' | 'shortcuts' | 'formulas';

interface NavigationState {
  view: View;
  selection: Selection;
  /** Historial de selecciones para «atrás» y «adelante». */
  past: Selection[];
  future: Selection[];
  /** Cambia cuando una selección debe centrarse en el lienzo. */
  revealKey: number;
  paletteOpen: boolean;
  /** Tema de ayuda abierto, o ninguno. */
  help: HelpTopic | null;
}

interface NavigationContextValue extends NavigationState {
  setView: (view: View) => void;
  /** Selecciona; con `reveal`, el lienzo centra el elemento. Cambia a la vista de mapa si hace falta. */
  select: (selection: Selection, options?: { reveal?: boolean }) => void;
  back: () => void;
  forward: () => void;
  canBack: boolean;
  canForward: boolean;
  setPaletteOpen: (open: boolean) => void;
  openHelp: (topic?: HelpTopic) => void;
  closeHelp: () => void;
}

const Context = createContext<NavigationContextValue | null>(null);
const HISTORY_LIMIT = 50;

const sameSelection = (a: Selection, b: Selection) => a?.kind === b?.kind && a?.id === b?.id;

export function NavigationProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<NavigationState>({
    view: 'map',
    selection: null,
    past: [],
    future: [],
    revealKey: 0,
    paletteOpen: false,
    help: null,
  });

  const setView = useCallback((view: View) => setState(s => (s.view === view ? s : { ...s, view })), []);
  const select = useCallback(
    (selection: Selection, options?: { reveal?: boolean }) =>
      setState(s => {
        const revealKey = options?.reveal ? s.revealKey + 1 : s.revealKey;
        if (sameSelection(s.selection, selection)) return { ...s, view: 'map', revealKey };
        // Deseleccionar no crea un paso en el historial; seleccionar algo sí.
        const past = selection && s.selection ? [...s.past, s.selection].slice(-HISTORY_LIMIT) : s.past;
        return { ...s, view: 'map', selection, past, future: selection ? [] : s.future, revealKey };
      }),
    [],
  );
  const back = useCallback(
    () =>
      setState(s => {
        const previous = s.past.at(-1);
        if (!previous) return s;
        return {
          ...s,
          view: 'map',
          selection: previous,
          past: s.past.slice(0, -1),
          future: s.selection ? [s.selection, ...s.future] : s.future,
          revealKey: s.revealKey + 1,
        };
      }),
    [],
  );
  const forward = useCallback(
    () =>
      setState(s => {
        const [next, ...future] = s.future;
        if (!next) return s;
        return {
          ...s,
          view: 'map',
          selection: next,
          past: s.selection ? [...s.past, s.selection] : s.past,
          future,
          revealKey: s.revealKey + 1,
        };
      }),
    [],
  );
  const setPaletteOpen = useCallback((paletteOpen: boolean) => setState(s => ({ ...s, paletteOpen })), []);
  const openHelp = useCallback((topic: HelpTopic = 'start') => setState(s => ({ ...s, help: topic })), []);
  const closeHelp = useCallback(() => setState(s => ({ ...s, help: null })), []);

  const value = useMemo<NavigationContextValue>(
    () => ({
      ...state,
      setView,
      select,
      back,
      forward,
      canBack: state.past.length > 0,
      canForward: state.future.length > 0,
      setPaletteOpen,
      openHelp,
      closeHelp,
    }),
    [state, setView, select, back, forward, setPaletteOpen, openHelp, closeHelp],
  );
  return <Context.Provider value={value}>{children}</Context.Provider>;
}

export function useNavigation() {
  const value = useContext(Context);
  if (!value) throw new Error('useNavigation debe usarse dentro de NavigationProvider');
  return value;
}
