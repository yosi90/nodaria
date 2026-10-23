/* eslint-disable react-refresh/only-export-components -- provider y hook forman una única API de contexto */
import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from 'react';
import type { LayoutMode, Project, Selection } from '../domain/types';

/** Encuadre transitorio por proyecto; no modifica datos ni el historial de deshacer. */
export interface MapViewportMemory {
  viewport: { x: number; y: number; zoom: number };
  revealKey: number;
  frameKey: string;
  layout: LayoutMode;
  mapImage: Project['mapImage'];
}

export type View =
  'map' | 'table' | 'schema' | 'relations' | 'properties' | 'health' | 'timeline' | 'calendar' | 'community';
/** Las vistas de un proyecto (todas menos «Comunidad», que no depende del proyecto abierto). */
export type ProjectView = Exclude<View, 'community'>;

/** Dónde se está dentro de «Comunidad» (docs/roadmaps/ROADMAP_COMUNIDAD.md). */
export type CommunityTab = 'inicio' | 'descubrir' | 'personas' | 'chats' | 'publicados' | 'persona';
export interface CommunityRoute {
  tab: CommunityTab;
  /** En «persona», de quién es el perfil. */
  person: string | null;
  /** En «chats», la conversación abierta. */
  conversation: number | null;
}

/**
 * Petición para la vista «Calendario» desde otra vista: abrir una entrada (`created`: recién creada, con
 * el título listo para escribir). `key` cambia en cada petición para que la vista la atienda una sola vez.
 */
export interface AgendaRequest {
  key: number;
  entryId: string;
  created: boolean;
}
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
  /** Nodo aislado en el lienzo: solo se ven sus vecinos. Guarda la disposición previa para restaurarla al salir. */
  isolated: { nodeId: string; previousLayout: LayoutMode } | null;
  agendaRequest: AgendaRequest | null;
  community: CommunityRoute;
  /** La última vista del proyecto, para volver desde «Comunidad». */
  projectView: ProjectView;
}

interface NavigationContextValue extends NavigationState {
  getMapViewport: (projectId: string) => MapViewportMemory | undefined;
  rememberMapViewport: (projectId: string, memory: MapViewportMemory) => void;
  setView: (view: View) => void;
  /** Selecciona; con `reveal`, el lienzo centra el elemento. Cambia a la vista de mapa si hace falta. */
  select: (selection: Selection, options?: { reveal?: boolean }) => void;
  /** Olvida la selección y su historial sin cambiar de vista (al cambiar de proyecto). */
  clearSelection: () => void;
  isolate: (nodeId: string, previousLayout: LayoutMode) => void;
  clearIsolation: () => void;
  back: () => void;
  forward: () => void;
  canBack: boolean;
  canForward: boolean;
  setPaletteOpen: (open: boolean) => void;
  openHelp: (topic?: HelpTopic) => void;
  closeHelp: () => void;
  /** Va a la vista «Calendario» con una entrada abierta (`created`: la acaba de crear quien llama). */
  openAgendaEntry: (entryId: string, created?: boolean) => void;
  /** La vista ya atendió la petición. */
  clearAgendaRequest: () => void;
  /** Va a «Comunidad» (a la pestaña, persona o conversación que se pida). */
  openCommunity: (route?: Partial<CommunityRoute>) => void;
}

const Context = createContext<NavigationContextValue | null>(null);
const HISTORY_LIMIT = 50;

const sameSelection = (a: Selection, b: Selection) => a?.kind === b?.kind && a?.id === b?.id;

export function NavigationProvider({ children }: { children: ReactNode }) {
  const mapViewports = useRef(new Map<string, MapViewportMemory>());
  const getMapViewport = useCallback((projectId: string) => mapViewports.current.get(projectId), []);
  const rememberMapViewport = useCallback((projectId: string, memory: MapViewportMemory) => {
    mapViewports.current.set(projectId, memory);
  }, []);
  const [state, setState] = useState<NavigationState>({
    view: 'map',
    selection: null,
    past: [],
    future: [],
    revealKey: 0,
    paletteOpen: false,
    help: null,
    isolated: null,
    agendaRequest: null,
    community: { tab: 'inicio', person: null, conversation: null },
    projectView: 'map',
  });

  const setView = useCallback(
    (view: View) =>
      setState(s => (s.view === view ? s : { ...s, view, projectView: view === 'community' ? s.projectView : view })),
    [],
  );
  const openCommunity = useCallback(
    (route: Partial<CommunityRoute> = {}) =>
      setState(s => ({
        ...s,
        view: 'community',
        community: {
          tab: route.tab ?? (route.person ? 'persona' : route.conversation ? 'chats' : s.community.tab),
          person: route.person ?? (route.tab && route.tab !== 'persona' ? null : s.community.person),
          conversation: route.conversation ?? (route.tab === 'chats' ? s.community.conversation : null),
        },
      })),
    [],
  );
  const select = useCallback(
    (selection: Selection, options?: { reveal?: boolean }) =>
      setState(s => {
        const revealKey = options?.reveal ? s.revealKey + 1 : s.revealKey;
        if (sameSelection(s.selection, selection)) return { ...s, view: 'map', projectView: 'map', revealKey };
        // Deseleccionar no crea un paso en el historial; seleccionar algo sí.
        const past = selection && s.selection ? [...s.past, s.selection].slice(-HISTORY_LIMIT) : s.past;
        return { ...s, view: 'map', projectView: 'map', selection, past, future: selection ? [] : s.future, revealKey };
      }),
    [],
  );
  const clearSelection = useCallback(
    () =>
      setState(s =>
        s.selection || s.past.length || s.future.length || s.isolated
          ? { ...s, selection: null, past: [], future: [], isolated: null }
          : s,
      ),
    [],
  );
  const isolate = useCallback(
    (nodeId: string, previousLayout: LayoutMode) =>
      setState(s => ({ ...s, isolated: { nodeId, previousLayout: s.isolated?.previousLayout ?? previousLayout } })),
    [],
  );
  const clearIsolation = useCallback(() => setState(s => (s.isolated ? { ...s, isolated: null } : s)), []);
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
  const openAgendaEntry = useCallback(
    (entryId: string, created = false) =>
      setState(s => ({
        ...s,
        view: 'calendar',
        projectView: 'calendar',
        agendaRequest: { key: (s.agendaRequest?.key ?? 0) + 1, entryId, created },
      })),
    [],
  );
  const clearAgendaRequest = useCallback(
    () => setState(s => (s.agendaRequest ? { ...s, agendaRequest: null } : s)),
    [],
  );

  const value = useMemo<NavigationContextValue>(
    () => ({
      ...state,
      getMapViewport,
      rememberMapViewport,
      setView,
      select,
      clearSelection,
      isolate,
      clearIsolation,
      back,
      forward,
      canBack: state.past.length > 0,
      canForward: state.future.length > 0,
      setPaletteOpen,
      openHelp,
      closeHelp,
      openAgendaEntry,
      clearAgendaRequest,
      openCommunity,
    }),
    [
      state,
      getMapViewport,
      rememberMapViewport,
      setView,
      select,
      clearSelection,
      isolate,
      clearIsolation,
      back,
      forward,
      setPaletteOpen,
      openHelp,
      closeHelp,
      openAgendaEntry,
      clearAgendaRequest,
      openCommunity,
    ],
  );
  return <Context.Provider value={value}>{children}</Context.Provider>;
}

export function useNavigation() {
  const value = useContext(Context);
  if (!value) throw new Error('useNavigation debe usarse dentro de NavigationProvider');
  return value;
}
