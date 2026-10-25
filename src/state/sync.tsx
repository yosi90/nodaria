/* eslint-disable react-refresh/only-export-components -- provider y hook forman una única API de contexto */
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { Project } from '../domain/types';
import {
  ApiError,
  deleteRemoteProject,
  fetchMe,
  getRemoteProject,
  listRemoteProjects,
  OfflineError,
  putRemoteProject,
} from '../services/api';
import { IdentityChangedError } from '../services/identity';
import { prepareProject, saveVault, takeVault } from '../services/storage';
import {
  emptyMeta,
  isEmptyPlan,
  loadSyncMeta,
  planSync,
  saveSyncMeta,
  storedSyncAccount,
  unsyncedProjects,
  type SyncConflict,
  type SyncMeta,
} from '../services/sync';
import { useApp } from './AppContext';
import { useAuth } from './auth';
import { useGroups } from './groups';
import { useToast } from '../components/common/toasts';
import { PUSH_DELAY_MS, useRecurringSync } from './syncTriggers';

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
  /** Cierre de sesión pedido desde Nodaria: los proyectos se retiran sin avisar de un cierre inesperado. */
  markLeaving: () => void;
  /** Avisos de «último cambio gana» pendientes de mostrar. */
  conflicts: SyncConflict[];
  dismissConflicts: () => void;
}

const Context = createContext<SyncContextValue | null>(null);

const PERIODIC_MS = 5 * 60 * 1000;
/** Pasadas extra permitidas en una sincronización cuando la API responde 409. */
const MAX_PASSES = 3;

export function SyncProvider({ children }: { children: ReactNode }) {
  const { state, dispatch, reportRepairs, lostOnLoad } = useApp();
  const { status: authStatus, user, restrictions, getToken, identity, isCurrent, tokenFor } = useAuth();
  // Los proyectos de los grupos van por su propio motor (`groups.tsx`): aquí ni se suben ni se borran.
  const { isShared, syncShared } = useGroups();
  // La función de avisos cambia con cada edición del proyecto: se usa desde una referencia.
  const toast = useToast();
  const toastRef = useRef(toast);
  toastRef.current = toast;
  const [status, setStatus] = useState<SyncStatus>({ state: 'off', lastSyncAt: null, error: null });
  const [conflicts, setConflicts] = useState<SyncConflict[]>([]);

  const meta = useRef<SyncMeta>(emptyMeta());
  const projects = useRef<Project[]>(state.projects);
  projects.current = state.projects;
  const running = useRef<Promise<void> | null>(null);
  const rerun = useRef(false);
  // Hasta la primera sincronización completa tras una carga con pérdidas, lo que falta se recupera.
  const recoverMissing = useRef(lostOnLoad);

  const signedIn = authStatus === 'signed-in' && user !== null;
  const uid = user?.id ?? null;
  // Con `creacion` limitada por moderación, la API no deja subir proyectos nuevos: se quedan aquí.
  const canCreate = !restrictions?.scopes.includes('creacion');
  const canCreateRef = useRef(canCreate);
  canCreateRef.current = canCreate;
  /** El recuerdo de la cuenta ya está cargado (tras preguntar a la API por la cuenta de antes). */
  const ready = useRef(false);
  /** Cerrar sesión desde Nodaria: no hace falta avisar de que se cerró. */
  const leaving = useRef(false);

  // Una pasada completa: lista remota, plan, bajadas, subidas y borrados; repite si hubo 409. Va atada a
  // la identidad con la que empieza: si la cuenta cambia por el camino (A → B, aunque luego vuelva A), lo
  // que llegue se descarta sin aplicarlo ni guardarlo (`ecosistema-kit/CAMBIO_DE_CUENTA.md`).
  const runOnce = useCallback(async () => {
    const who = identity();
    if (!ready.current || !who.account || meta.current.uid !== who.account) return;
    const token = await tokenFor(who);
    if (!token) return;
    const check = () => {
      if (!isCurrent(who) || meta.current.uid !== who.account) throw new IdentityChangedError();
    };
    const found: SyncConflict[] = [];
    for (let pass = 0; pass < MAX_PASSES; pass++) {
      const remote = (await listRemoteProjects(token)).filter(r => !isShared(r.id));
      check();
      const own = projects.current.filter(p => !isShared(p.id));
      for (const id of Object.keys(meta.current.projects)) if (isShared(id)) delete meta.current.projects[id];
      const plan = planSync(own, remote, meta.current, { recoverMissing: recoverMissing.current });
      found.push(...plan.conflicts);
      if (isEmptyPlan(plan)) break;

      const next: SyncMeta = { uid: meta.current.uid, projects: { ...meta.current.projects } };
      for (const id of plan.forgetMeta) delete next.projects[id];
      for (const entry of plan.adoptMeta)
        next.projects[entry.id] = { version: entry.version, updatedAt: entry.updatedAt };

      const upsert: Project[] = [];
      for (const item of plan.download) {
        const stored = await getRemoteProject(token, item.id);
        check();
        const { project, issues } = prepareProject(stored.document);
        if (issues.length) reportRepairs({ projectName: project.name, issues });
        upsert.push({ ...project, id: item.id });
        next.projects[item.id] = { version: stored.version, updatedAt: project.updatedAt };
      }
      for (const id of plan.removeLocal) delete next.projects[id];
      check();
      if (upsert.length || plan.removeLocal.length) {
        dispatch({ type: 'sync-apply', upsert, remove: plan.removeLocal });
      }

      let conflicted = false;
      for (const item of plan.upload) {
        if (item.baseVersion === 0 && !canCreateRef.current) continue;
        try {
          const written = await putRemoteProject(token, item.project.id, item.project, item.baseVersion);
          next.projects[item.project.id] = { version: written.version, updatedAt: item.project.updatedAt };
        } catch (error) {
          // Es de un grupo (se compartió desde otro dispositivo): lo lleva el motor de los compartidos.
          if (error instanceof ApiError && error.code === 'proyecto_compartido') void syncShared();
          else if (error instanceof ApiError && error.status === 409) conflicted = true;
          else if (error instanceof ApiError && error.code === 'creacion_limitada') canCreateRef.current = false;
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

      check();
      meta.current = next;
      saveSyncMeta(next);
      if (!conflicted) break;
    }
    recoverMissing.current = false;
    if (found.length) setConflicts(current => [...current, ...found]);
  }, [identity, isCurrent, tokenFor, dispatch, reportRepairs, isShared, syncShared]);

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
        // La cuenta cambió a mitad: no es un error; la nueva identidad pone su propio estado.
        if (error instanceof IdentityChangedError) return;
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

  /**
   * Los proyectos de una cuenta salen del navegador cuando su sesión termina: los que ya están en la
   * cuenta no hacen falta aquí y los que tienen cambios sin subir se apartan (sin enseñarse) hasta que
   * vuelva a entrar esa cuenta. El navegador queda como recién abierto. Devuelve cuántos se apartaron;
   * si no se pueden apartar, no se quita nada (antes que perder trabajo).
   */
  const lockAccount = useCallback(
    async (account: string, memory: SyncMeta) => {
      const pending = unsyncedProjects(projects.current, memory);
      await saveVault(account, pending);
      saveSyncMeta(null);
      dispatch({ type: 'reset-state' });
      return pending.length;
    },
    [dispatch],
  );

  // Cambiar de cuenta carga su recuerdo (preguntando antes a la API por la cuenta de antes de migrar,
  // para adoptar su recuerdo); sin sesión, el motor se apaga y los proyectos de la cuenta se retiran.
  useEffect(() => {
    // Hasta cargar el recuerdo de la cuenta nueva no se sincroniza nada (ni con el de la anterior).
    ready.current = false;
    if (!signedIn || !uid) {
      setStatus({ state: 'off', lastSyncAt: null, error: null });
      // Mientras se comprueba la sesión, o si la plataforma no responde, no se decide nada.
      if (authStatus !== 'signed-out') return;
      const account = meta.current.uid ?? storedSyncAccount();
      const memory = meta.current.uid ? meta.current : account ? loadSyncMeta(account) : emptyMeta();
      meta.current = emptyMeta();
      const own = leaving.current;
      leaving.current = false;
      if (!account) return;
      void lockAccount(account, memory)
        .then(kept => {
          if (own) return;
          toastRef.current({
            message: kept
              ? 'Tu sesión de Yosiftware se ha cerrado. Tus proyectos se han quitado de este navegador; los cambios sin subir te esperan aquí, ocultos, hasta que vuelvas a entrar.'
              : 'Tu sesión de Yosiftware se ha cerrado. Tus proyectos siguen en tu cuenta y se han quitado de este navegador.',
          });
        })
        .catch(() =>
          toastRef.current({
            message: 'Tu sesión se ha cerrado, pero no se pudieron apartar los cambios sin subir: siguen aquí.',
          }),
        );
      return;
    }
    let cancelled = false;
    void (async () => {
      setStatus(current => ({ ...current, state: 'syncing' }));
      try {
        const token = await getToken();
        const me = token ? await fetchMe(token) : null;
        if (cancelled) return;
        const legacy = me?.legacyAccount ?? null;
        // Lo que quede en el navegador de otra cuenta se aparta antes de mezclarlo con esta.
        const stored = storedSyncAccount();
        if (stored && stored !== uid && stored !== legacy) await lockAccount(stored, loadSyncMeta(stored));
        // Los cambios que esta cuenta dejó sin subir al cerrarse su sesión vuelven antes de sincronizar.
        const restored = await takeVault(uid);
        if (cancelled) return;
        if (restored.length) {
          dispatch({ type: 'sync-apply', upsert: restored, remove: [] });
          const ids = new Set(restored.map(p => p.id));
          projects.current = [...projects.current.filter(p => !ids.has(p.id)), ...restored];
        }
        meta.current = loadSyncMeta(uid, legacy);
        ready.current = true;
        void syncNow();
      } catch (error) {
        if (cancelled) return;
        setStatus({
          state: error instanceof OfflineError ? 'offline' : 'error',
          lastSyncAt: null,
          error: error instanceof OfflineError ? null : error instanceof Error ? error.message : 'Error inesperado.',
        });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [signedIn, uid, authStatus, getToken, syncNow, lockAccount, dispatch]);

  // Tras un cambio local, subida con retardo.
  useEffect(() => {
    if (!signedIn) return;
    const timer = window.setTimeout(() => void syncNow(), PUSH_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [signedIn, state.projects, syncNow]);

  // Cada cierto tiempo, al recuperar la conexión y al volver a la pestaña.
  useRecurringSync(syncNow, signedIn, { every: PERIODIC_MS });

  const forgetAccount = useCallback(() => {
    leaving.current = true;
    meta.current = emptyMeta();
    saveSyncMeta(null);
  }, []);
  const markLeaving = useCallback(() => {
    leaving.current = true;
  }, []);
  const dismissConflicts = useCallback(() => setConflicts([]), []);

  const value = useMemo<SyncContextValue>(
    () => ({ ...status, syncNow, forgetAccount, markLeaving, conflicts, dismissConflicts }),
    [status, syncNow, forgetAccount, markLeaving, conflicts, dismissConflicts],
  );
  return <Context.Provider value={value}>{children}</Context.Provider>;
}

export function useSync() {
  const value = useContext(Context);
  if (!value) throw new Error('useSync debe usarse dentro de SyncProvider');
  return value;
}
