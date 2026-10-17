/* eslint-disable react-refresh/only-export-components -- provider y hook forman una única API de contexto */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { now, uid } from '../domain/factories';
import type { Project } from '../domain/types';
import { ApiError, OfflineError } from '../services/api';
import {
  blockedReason,
  contentSignature,
  createGroup,
  deleteGroup,
  emptySharedMeta,
  getSharedProject,
  groupErrorMessage,
  leaveSpace,
  listGroups,
  loadSharedMeta,
  planShared,
  putSharedProject,
  refreshGroups,
  saveSharedMeta,
  storedSharedIds,
  type GroupInfo,
  type SharedMeta,
} from '../services/groups';
import { mergeProjects } from '../services/merge';
import { loadSharedBase, prepareProject, saveSharedBase } from '../services/storage';
import { sdk } from '../services/yosiftware';
import { useToast } from '../components/common/toasts';
import { useApp } from './AppContext';
import { useAuth } from './auth';

/*
 * Motor de los proyectos compartidos (docs/roadmaps/ROADMAP_COLABORACION.md). Lee los grupos de la
 * cuenta, baja y sube el proyecto de cada grupo con control de versión y aplica lo que el rol deja hacer
 * con el proyecto abierto. Va aparte de la sincronización de los proyectos propios (`sync.tsx`), que
 * excluye los compartidos. Si los dos lados cambiaron, combina las versiones con la base que guarda de
 * cada compartido (`merge.ts`). Los cambios de otros llegan por el canal del espacio del proyecto
 * abierto (hito 3), que también dice quién lo tiene abierto; además se leen cada minuto, al volver a la
 * pestaña y después de cada cambio de aquí, por si el canal no llega.
 */

interface GroupsContextValue {
  groups: GroupInfo[];
  /** El grupo del proyecto, si es compartido. */
  groupOf: (projectId: string) => GroupInfo | null;
  /** Si el proyecto es (o era hasta la última lectura) de un grupo: los propios no lo tocan. */
  isShared: (projectId: string) => boolean;
  syncShared: () => Promise<void>;
  /** Lee el feed en la API (tras aceptar una invitación) y sincroniza. */
  refresh: () => Promise<void>;
  share: (project: Project, name: string) => Promise<GroupInfo>;
  removeGroup: (group: GroupInfo, recipient: string) => Promise<void>;
  leave: (group: GroupInfo) => Promise<void>;
  /** Otras cuentas con el proyecto abierto ahora (ids en minúsculas), según el canal de su grupo. */
  present: string[];
}

const Context = createContext<GroupsContextValue | null>(null);

const PUSH_DELAY_MS = 2500;
const POLL_MS = 60 * 1000;
/** Tras aceptar una invitación, la plataforma tarda un momento en dejar el cambio en el feed. */
const REFRESH_RETRIES_MS = [0, 2000, 5000, 10000];
/** Vueltas seguidas como mucho cuando otra persona guarda mientras se combina. */
const MAX_PASSES = 3;

/** Los cambios de aquí que no pudieron subir se guardan como un proyecto propio aparte. */
const localCopy = (project: Project): Project => {
  const stamp = now();
  return { ...project, id: uid('project'), name: `${project.name} (tus cambios)`, createdAt: stamp, updatedAt: stamp };
};

export function GroupsProvider({ children }: { children: ReactNode }) {
  const { state, dispatch, setActionGuard, reportRepairs } = useApp();
  const { status, user, getToken } = useAuth();
  const toast = useToast();
  const toastRef = useRef(toast);

  const [groups, setGroups] = useState<GroupInfo[]>([]);
  const groupsRef = useRef<GroupInfo[]>([]);
  const meta = useRef<SharedMeta>(emptySharedMeta());
  // Lo que recordaba el navegador vale desde el arranque, antes de leer los grupos.
  const known = useRef<Set<string>>(storedSharedIds());
  const projects = useRef<Project[]>(state.projects);
  const queue = useRef<Promise<unknown>>(Promise.resolve());
  const signedIn = status === 'signed-in' && user !== null;
  const uidRef = useRef<string | null>(user?.id ?? null);
  // Lo último que se ha pintado, para el motor y los manejadores (que corren fuera del render).
  useLayoutEffect(() => {
    toastRef.current = toast;
    projects.current = state.projects;
    uidRef.current = user?.id ?? null;
  });

  const publish = useCallback((list: GroupInfo[]) => {
    groupsRef.current = list;
    setGroups(list);
    known.current = new Set([...Object.keys(meta.current.projects), ...list.flatMap(g => g.projects.map(p => p.id))]);
  }, []);

  const saveMeta = useCallback((next: SharedMeta) => {
    meta.current = next;
    saveSharedMeta(next);
    known.current = new Set([
      ...Object.keys(next.projects),
      ...groupsRef.current.flatMap(g => g.projects.map(p => p.id)),
    ]);
  }, []);

  /** Las operaciones van en fila: crear, borrar y sincronizar nunca se cruzan. */
  const enqueue = useCallback(<T,>(job: () => Promise<T>): Promise<T> => {
    const next = queue.current.then(job, job);
    queue.current = next.catch(() => undefined);
    return next;
  }, []);

  /** Una vuelta; devuelve si hace falta otra (otra persona guardó mientras se combinaba). */
  const runOnce = useCallback(
    async (fresh: boolean): Promise<boolean> => {
      const token = await getToken();
      if (!token || !uidRef.current || meta.current.uid !== uidRef.current) return false;
      const list = await (fresh ? refreshGroups(token) : listGroups(token));
      publish(list);

      const local = projects.current;
      const localById = new Map(local.map(p => [p.id, p]));
      const signatures: Record<string, string> = {};
      for (const id of Object.keys(meta.current.projects)) {
        const L = localById.get(id);
        if (L) signatures[id] = await contentSignature(L);
      }
      const plan = planShared(local, list, meta.current, signatures);
      const next: SharedMeta = { uid: meta.current.uid, projects: { ...meta.current.projects } };
      const upsert: Project[] = [];
      /** Copias de lo de aquí, con el id del compartido del que salen. */
      const copies: { from: string; project: Project }[] = [];
      const remove: string[] = [];
      /** Versiones base que guardar (la última del grupo que queda aquí); `null` la borra. */
      const bases = new Map<string, Project | null>();
      let again = false;

      for (const item of plan.upload) {
        try {
          const written = await putSharedProject(token, item.group, item.project.id, item.project, item.baseVersion);
          next.projects[item.project.id] = {
            group: item.group,
            version: written.version,
            signature: signatures[item.project.id],
          };
          bases.set(item.project.id, item.project);
        } catch (error) {
          if (!(error instanceof ApiError) || (error.status !== 409 && error.status !== 403)) throw error;
          // Otra persona guardó antes: se combinan. El rol ya no deja: se baja la del grupo y lo de aquí queda aparte.
          if (error.status === 409) plan.merge.push({ group: item.group, id: item.project.id });
          else {
            plan.download.push({ group: item.group, id: item.project.id, keepLocal: true });
            toastRef.current({ message: groupErrorMessage(error), duration: 9000 });
          }
        }
      }

      for (const item of plan.merge) {
        const L = localById.get(item.id);
        const base = await loadSharedBase(item.id);
        // Sin la versión base (otro navegador, o sin IndexedDB) no se puede combinar: lo de aquí queda aparte.
        if (!L || !base) {
          plan.download.push({ group: item.group, id: item.id, keepLocal: true });
          continue;
        }
        const stored = await getSharedProject(token, item.group, item.id);
        const remote: Project = { ...prepareProject(stored.document).project, id: item.id, view: L.view };
        const { project: combined, conflicts } = mergeProjects(base, L, remote);
        const repaired: Project = { ...prepareProject(combined).project, id: item.id, view: L.view };
        if (conflicts.length) {
          copies.push({ from: item.id, project: localCopy(L) });
          toastRef.current({
            message: `«${remote.name}»: otra persona cambió ${conflicts.length === 1 ? 'un dato' : `${conflicts.length} datos`} que tú también cambiaste, y se queda su versión. Lo demás se ha juntado; tu versión completa está en «${L.name} (tus cambios)».`,
            duration: 12000,
          });
        }
        const [remoteSignature, combinedSignature] = [await contentSignature(remote), await contentSignature(repaired)];
        if (combinedSignature === remoteSignature) {
          upsert.push(repaired);
          next.projects[item.id] = { group: item.group, version: stored.version, signature: remoteSignature };
          bases.set(item.id, repaired);
          continue;
        }
        try {
          const written = await putSharedProject(token, item.group, item.id, repaired, stored.version);
          upsert.push(repaired);
          next.projects[item.id] = { group: item.group, version: written.version, signature: combinedSignature };
          bases.set(item.id, repaired);
        } catch (error) {
          if (!(error instanceof ApiError) || error.status !== 409) throw error;
          // Otra persona volvió a guardar: se repite con su versión. La copia, si la hubo, ya está.
          again = true;
        }
      }

      for (const item of plan.download) {
        const L = localById.get(item.id);
        const stored = await getSharedProject(token, item.group, item.id);
        const { project, issues } = prepareProject(stored.document);
        if (issues.length) reportRepairs({ projectName: project.name, issues });
        // La vista del mapa es de cada persona: se conserva la de aquí.
        const merged: Project = { ...project, id: item.id, view: L?.view ?? project.view };
        const signature = await contentSignature(merged);
        if (item.keepLocal && L && (signatures[item.id] ?? (await contentSignature(L))) !== signature) {
          copies.push({ from: item.id, project: localCopy(L) });
          toastRef.current({
            message: `«${project.name}» cambió en el grupo mientras lo editabas aquí. Tus cambios están en «${L.name} (tus cambios)».`,
            duration: 12000,
          });
        }
        upsert.push(merged);
        next.projects[item.id] = { group: item.group, version: stored.version, signature };
        bases.set(item.id, merged);
      }

      for (const item of plan.release) {
        const L = localById.get(item.id);
        if (L && item.keepLocal) copies.push({ from: item.id, project: localCopy(L) });
        if (L) {
          remove.push(item.id);
          toastRef.current({
            message: item.keepLocal
              ? `Ya no tienes acceso al grupo de «${L.name}». Tus cambios sin subir están en «${L.name} (tus cambios)».`
              : `Ya no tienes acceso al grupo de «${L.name}»: se ha quitado de este navegador.`,
            duration: 9000,
          });
        }
        delete next.projects[item.id];
        bases.set(item.id, null);
      }

      // Lo que se editó aquí mientras se bajaba no se pisa: se resuelve (combinando) en la siguiente vuelta.
      const current = new Map(projects.current.map(p => [p.id, p]));
      const skipped = new Set(upsert.filter(p => current.get(p.id) !== localById.get(p.id)).map(p => p.id));
      const safeUpsert = upsert.filter(p => !skipped.has(p.id));
      const safeCopies = copies.filter(copy => !skipped.has(copy.from)).map(copy => copy.project);
      for (const id of skipped) {
        const before = meta.current.projects[id];
        if (before) next.projects[id] = before;
        else delete next.projects[id];
        bases.delete(id);
        again = true;
      }

      if (safeUpsert.length || safeCopies.length || remove.length) {
        dispatch({
          type: 'sync-apply',
          upsert: [...safeUpsert, ...safeCopies],
          remove,
          fresh: safeUpsert.length + remove.length > 0,
        });
      }
      for (const [id, project] of bases) await saveSharedBase(id, project).catch(() => undefined);
      saveMeta(next);
      return again;
    },
    [getToken, publish, saveMeta, dispatch, reportRepairs],
  );

  const run = useCallback(
    (fresh = false) =>
      enqueue(async () => {
        for (let pass = 0; pass < MAX_PASSES; pass++) if (!(await runOnce(fresh && pass === 0))) break;
      }).catch(error => {
        if (!(error instanceof OfflineError))
          console.warn('No se pudieron sincronizar los proyectos compartidos', error);
      }),
    [enqueue, runOnce],
  );

  const syncShared = useCallback(() => run(false), [run]);
  const refresh = useCallback(() => run(true), [run]);

  // Al entrar, el recuerdo de la cuenta; sin sesión, nada (el recuerdo se queda para cuando vuelva).
  useEffect(() => {
    if (!signedIn || !user) {
      // Sin sesión no hay grupos (lo que se enseña lo filtra `visible`); el motor se para.
      groupsRef.current = [];
      meta.current = emptySharedMeta();
      return;
    }
    meta.current = loadSharedMeta(user.id);
    void syncShared();
  }, [signedIn, user, syncShared]);

  // Tras un cambio de aquí en un compartido, se sube con retardo.
  const previous = useRef(new Map<string, Project>());
  useEffect(() => {
    const changed = state.projects.some(p => known.current.has(p.id) && previous.current.get(p.id) !== p);
    previous.current = new Map(state.projects.map(p => [p.id, p]));
    if (!signedIn || !changed) return;
    const timer = window.setTimeout(() => void syncShared(), PUSH_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [signedIn, state.projects, syncShared]);

  // Los cambios de otros: cada minuto con la pestaña visible, al volver a ella y al recuperar la conexión.
  useEffect(() => {
    if (!signedIn) return;
    const tick = () => document.visibilityState === 'visible' && void syncShared();
    const interval = window.setInterval(tick, POLL_MS);
    window.addEventListener('online', tick);
    document.addEventListener('visibilitychange', tick);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener('online', tick);
      document.removeEventListener('visibilitychange', tick);
    };
  }, [signedIn, syncShared]);

  // Al aceptar una invitación en la ventana del SDK: la API lee el feed y el proyecto del grupo baja.
  useEffect(() => {
    if (!signedIn) return;
    const accepted = (event: WindowEventMap['yosiftware:espacio']) => {
      if (event.detail.tipo !== 'aceptada') return;
      const spaceId = event.detail.espacio?.id ?? null;
      void (async () => {
        for (const delay of REFRESH_RETRIES_MS) {
          if (delay) await new Promise(resolve => window.setTimeout(resolve, delay));
          await refresh();
          const group = groupsRef.current.find(g => spaceId === null || g.spaceId === spaceId);
          const projectId = group?.projects[0]?.id;
          if (group && projectId && projects.current.some(p => p.id === projectId)) {
            dispatch({ type: 'set-project', id: projectId });
            toastRef.current({ message: `Ya estás en el grupo «${group.name}».` });
            return;
          }
        }
        toastRef.current({ message: 'Invitación aceptada. El proyecto del grupo aparecerá en un momento.' });
      })();
    };
    window.addEventListener('yosiftware:espacio', accepted);
    return () => window.removeEventListener('yosiftware:espacio', accepted);
  }, [signedIn, refresh, dispatch]);

  // El canal del grupo del proyecto abierto: lo que otros guardan llega al momento, y quién lo tiene abierto.
  const activeGroup = signedIn ? groups.find(g => g.projects.some(p => p.id === state.activeProjectId)) : undefined;
  const spaceId = activeGroup?.spaceId ?? null;
  const [presence, setPresence] = useState<{ space: number; ids: string[] } | null>(null);
  useEffect(() => {
    const espacios = sdk()?.espacios;
    if (!spaceId || !espacios?.canal) return;
    const channel = espacios.canal(spaceId, message => {
      switch (message.tipo) {
        case 'mensaje': {
          const { tipo, id, version } = message.datos as { tipo?: string; id?: string; version?: number };
          // Lo que guardó este navegador ya está aquí.
          if (tipo === 'proyecto' && id && (meta.current.projects[id]?.version ?? 0) >= (version ?? 0)) return;
          void syncShared();
          return;
        }
        case 'abierto':
        case 'presencia':
          setPresence({ space: spaceId, ids: message.presentes.map(id => id.toLowerCase()) });
          return;
        default:
          // Lo perdido ya no se conserva, o ya no es miembro: se relee todo de la API.
          void syncShared();
      }
    });
    return () => channel.cerrar();
  }, [spaceId, syncShared]);
  const present = useMemo(
    () => (presence && presence.space === spaceId ? presence.ids.filter(id => id !== user?.id) : []),
    [presence, spaceId, user],
  );

  // El rol decide qué se puede cambiar en el compartido abierto.
  useEffect(() => {
    setActionGuard((action, appState) => {
      const id = appState.activeProjectId;
      const group = groupsRef.current.find(g => g.projects.some(p => p.id === id));
      if (!group) return true;
      const reason = blockedReason(action.type, group);
      if (reason) toastRef.current({ message: reason, duration: 7000 });
      return reason === null;
    });
    return () => setActionGuard(null);
  }, [setActionGuard]);

  const share = useCallback(
    (project: Project, name: string) =>
      enqueue(async () => {
        const token = await getToken();
        if (!token || !uidRef.current) throw new ApiError(401, 'no_autenticado', 'Tienes que entrar con tu cuenta.');
        const signature = await contentSignature(project);
        const group = await createGroup(token, crypto.randomUUID(), name, project);
        const shared = group.projects.find(p => p.id === project.id);
        const base = meta.current.uid === uidRef.current ? meta.current : emptySharedMeta(uidRef.current);
        if (shared) {
          await saveSharedBase(project.id, project).catch(() => undefined);
          saveMeta({
            uid: uidRef.current,
            projects: { ...base.projects, [project.id]: { group: group.id, version: shared.version, signature } },
          });
        }
        publish([...groupsRef.current.filter(g => g.id !== group.id), group]);
        return group;
      }),
    [enqueue, getToken, saveMeta, publish],
  );

  const removeGroup = useCallback(
    async (group: GroupInfo, recipient: string) => {
      await enqueue(async () => {
        const token = await getToken();
        if (!token) throw new ApiError(401, 'no_autenticado', 'Tienes que entrar con tu cuenta.');
        await deleteGroup(token, group.id, recipient);
      });
      await syncShared();
    },
    [enqueue, getToken, syncShared],
  );

  const leave = useCallback(
    async (group: GroupInfo) => {
      await leaveSpace(group.spaceId);
      await refresh();
    },
    [refresh],
  );

  const visible = useMemo(() => (signedIn ? groups : []), [signedIn, groups]);
  const groupOf = useCallback(
    (projectId: string) => visible.find(g => g.projects.some(p => p.id === projectId)) ?? null,
    [visible],
  );
  const isShared = useCallback((projectId: string) => known.current.has(projectId), []);

  const value = useMemo(
    () => ({ groups: visible, groupOf, isShared, syncShared, refresh, share, removeGroup, leave, present }),
    [visible, groupOf, isShared, syncShared, refresh, share, removeGroup, leave, present],
  );
  return <Context.Provider value={value}>{children}</Context.Provider>;
}

export function useGroups() {
  const value = useContext(Context);
  if (!value) throw new Error('useGroups debe usarse dentro de GroupsProvider');
  return value;
}
