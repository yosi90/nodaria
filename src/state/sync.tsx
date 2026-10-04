/* eslint-disable react-refresh/only-export-components -- provider y hook forman una única API de contexto */
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { Project } from '../domain/types';
import {
  ApiError,
  deleteRemoteProject,
  getRemoteProject,
  listRemoteProjects,
  OfflineError,
  putRemoteProject,
} from '../services/api';
import { prepareProject } from '../services/storage';
import {
  emptyMeta,
  isEmptyPlan,
  loadSyncMeta,
  planSync,
  saveSyncMeta,
  type SyncConflict,
  type SyncMeta,
} from '../services/sync';
import { useApp } from './AppContext';
import { useAuth } from './auth';

/** `off`: sin sesión. `offline`: no se llega a la API. `error`: la API respondió con error. */
export type SyncState = 'off' | 'idle' | 'syncing' | 'offline' | 'error';

export interface SyncStatus {
  state: SyncState;
  lastSyncAt: string | null;
  error: string | null;
}

interface SyncContextValue extends SyncStatus {
  syncNow: () => Promise<void>;
  /** Olvida el recuerdo de la cuenta en este navegador (al cerrar sesión o borrar la cuenta). */
  forgetAccount: () => void;
  /** Avisos de «último cambio gana» pendientes de mostrar. */
  conflicts: SyncConflict[];
  dismissConflicts: () => void;
}

const Context = createContext<SyncContextValue | null>(null);

/** Retardo tras un cambio local antes de subirlo. */
const PUSH_DELAY_MS = 2500;
const PERIODIC_MS = 5 * 60 * 1000;
/** Pasadas extra permitidas en una sincronización cuando la API responde 409. */
const MAX_PASSES = 3;

export function SyncProvider({ children }: { children: ReactNode }) {
  const { state, dispatch, reportRepairs } = useApp();
  const { status: authStatus, user, getToken } = useAuth();
  const [status, setStatus] = useState<SyncStatus>({ state: 'off', lastSyncAt: null, error: null });
  const [conflicts, setConflicts] = useState<SyncConflict[]>([]);

  const meta = useRef<SyncMeta>(emptyMeta());
  const projects = useRef<Project[]>(state.projects);
  projects.current = state.projects;
  const running = useRef<Promise<void> | null>(null);
  const rerun = useRef(false);

  const signedIn = authStatus === 'signed-in' && user !== null;
  const uid = user?.uid ?? null;

  // Una pasada completa: lista remota, plan, bajadas, subidas y borrados; repite si hubo 409.
  const runOnce = useCallback(async () => {
    const token = await getToken();
    if (!token) return;
    const found: SyncConflict[] = [];
    for (let pass = 0; pass < MAX_PASSES; pass++) {
      const remote = await listRemoteProjects(token);
      const plan = planSync(projects.current, remote, meta.current);
      found.push(...plan.conflicts);
      if (isEmptyPlan(plan)) break;

      const next: SyncMeta = { uid: meta.current.uid, projects: { ...meta.current.projects } };
      for (const id of plan.forgetMeta) delete next.projects[id];
      for (const entry of plan.adoptMeta)
        next.projects[entry.id] = { version: entry.version, updatedAt: entry.updatedAt };

      const upsert: Project[] = [];
      for (const item of plan.download) {
        const stored = await getRemoteProject(token, item.id);
        const { project, issues } = prepareProject(stored.document);
        if (issues.length) reportRepairs({ projectName: project.name, issues });
        upsert.push({ ...project, id: item.id });
        next.projects[item.id] = { version: stored.version, updatedAt: project.updatedAt };
      }
      for (const id of plan.removeLocal) delete next.projects[id];
      if (upsert.length || plan.removeLocal.length) {
        dispatch({ type: 'sync-apply', upsert, remove: plan.removeLocal });
      }

      let conflicted = false;
      for (const item of plan.upload) {
        try {
          const written = await putRemoteProject(token, item.project.id, item.project, item.baseVersion);
          next.projects[item.project.id] = { version: written.version, updatedAt: item.project.updatedAt };
        } catch (error) {
          if (error instanceof ApiError && error.status === 409) conflicted = true;
          else throw error;
        }
      }
      for (const item of plan.deleteRemote) {
        try {
          await deleteRemoteProject(token, item.id, item.baseVersion);
          delete next.projects[item.id];
        } catch (error) {
          if (error instanceof ApiError && (error.status === 409 || error.status === 404)) conflicted = true;
          else throw error;
        }
      }

      meta.current = next;
      saveSyncMeta(next);
      if (!conflicted) break;
    }
    if (found.length) setConflicts(current => [...current, ...found]);
  }, [getToken, dispatch, reportRepairs]);

  const syncNow = useCallback(async () => {
    if (!signedIn) return;
    if (running.current) {
      rerun.current = true;
      return running.current;
    }
    const job = (async () => {
      setStatus(current => ({ ...current, state: 'syncing' }));
      try {
        do {
          rerun.current = false;
          await runOnce();
        } while (rerun.current);
        setStatus({ state: 'idle', lastSyncAt: new Date().toISOString(), error: null });
      } catch (error) {
        if (error instanceof OfflineError) {
          setStatus(current => ({ ...current, state: 'offline', error: null }));
        } else {
          const message = error instanceof Error ? error.message : 'Error inesperado.';
          setStatus(current => ({ ...current, state: 'error', error: message }));
        }
      } finally {
        running.current = null;
      }
    })();
    running.current = job;
    return job;
  }, [signedIn, runOnce]);

  // Cambiar de cuenta carga su recuerdo; sin sesión, el motor se apaga.
  useEffect(() => {
    if (!signedIn || !uid) {
      meta.current = emptyMeta();
      setStatus({ state: 'off', lastSyncAt: null, error: null });
      return;
    }
    meta.current = loadSyncMeta(uid);
    void syncNow();
  }, [signedIn, uid, syncNow]);

  // Tras un cambio local, subida con retardo.
  useEffect(() => {
    if (!signedIn) return;
    const timer = window.setTimeout(() => void syncNow(), PUSH_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [signedIn, state.projects, syncNow]);

  // Cada cierto tiempo, al recuperar la conexión y al volver a la pestaña.
  useEffect(() => {
    if (!signedIn) return;
    const interval = window.setInterval(() => void syncNow(), PERIODIC_MS);
    const online = () => void syncNow();
    const visible = () => document.visibilityState === 'visible' && void syncNow();
    window.addEventListener('online', online);
    document.addEventListener('visibilitychange', visible);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener('online', online);
      document.removeEventListener('visibilitychange', visible);
    };
  }, [signedIn, syncNow]);

  const forgetAccount = useCallback(() => {
    meta.current = emptyMeta();
    saveSyncMeta(null);
  }, []);
  const dismissConflicts = useCallback(() => setConflicts([]), []);

  const value = useMemo<SyncContextValue>(
    () => ({ ...status, syncNow, forgetAccount, conflicts, dismissConflicts }),
    [status, syncNow, forgetAccount, conflicts, dismissConflicts],
  );
  return <Context.Provider value={value}>{children}</Context.Provider>;
}

export function useSync() {
  const value = useContext(Context);
  if (!value) throw new Error('useSync debe usarse dentro de SyncProvider');
  return value;
}
