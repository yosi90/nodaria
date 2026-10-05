import type { Project } from '../domain/types';

/**
 * Reglas de sincronización entre los proyectos locales (localStorage) y los de la cuenta.
 * Son funciones puras: el motor (`src/state/sync.tsx`) las ejecuta contra la API.
 *
 * Por proyecto se recuerda qué versión del servidor se sincronizó y con qué `updatedAt`
 * local (`SyncMeta`). Comparando ambos lados con ese recuerdo se sabe quién cambió:
 * - cambió solo lo local → subir; cambió solo lo remoto → bajar;
 * - cambiaron los dos → gana el `updatedAt` más reciente (y se avisa);
 * - borrado en un lado y sin cambios en el otro → se propaga el borrado.
 * Los proyectos vacíos que nunca se sincronizaron no se suben.
 */

export const SYNC_META_KEY = 'nodaria_sync_v1';

export interface SyncedVersion {
  version: number;
  /** `Project.updatedAt` local en el momento de sincronizar. */
  updatedAt: string;
}

export interface SyncMeta {
  uid: string | null;
  projects: Record<string, SyncedVersion>;
}

/** Resumen que devuelve `GET /api/projects`. */
export interface RemoteSummary {
  id: string;
  name: string;
  version: number;
  updatedAt: string;
  serverUpdatedAt: string;
  deletedAt: string | null;
  sizeBytes: number;
}

export interface SyncConflict {
  id: string;
  name: string;
  winner: 'local' | 'remote';
}

export interface SyncPlan {
  upload: { project: Project; baseVersion: number }[];
  download: { id: string; version: number }[];
  removeLocal: string[];
  deleteRemote: { id: string; baseVersion: number }[];
  /** Entradas del recuerdo que ya no apuntan a nada. */
  forgetMeta: string[];
  /** Ambos lados tienen el mismo contenido (mismo `updatedAt`): basta con recordarlo. */
  adoptMeta: { id: string; version: number; updatedAt: string }[];
  conflicts: SyncConflict[];
}

export const emptyMeta = (uid: string | null = null): SyncMeta => ({ uid, projects: {} });

export function loadSyncMeta(uid: string): SyncMeta {
  try {
    const stored = JSON.parse(localStorage.getItem(SYNC_META_KEY) ?? 'null') as SyncMeta | null;
    if (stored && stored.uid === uid && stored.projects && typeof stored.projects === 'object') return stored;
  } catch {
    // Sin recuerdo válido: se parte de cero para esta cuenta.
  }
  return emptyMeta(uid);
}

export function saveSyncMeta(meta: SyncMeta | null) {
  try {
    if (meta) localStorage.setItem(SYNC_META_KEY, JSON.stringify(meta));
    else localStorage.removeItem(SYNC_META_KEY);
  } catch {
    // Sin almacenamiento: el recuerdo dura lo que la sesión.
  }
}

/** Un proyecto recién creado y sin contenido; no merece ocupar la cuenta. */
export function isBlankProject(p: Project) {
  return (
    p.schemas.length === 0 &&
    p.fieldLibrary.length === 0 &&
    p.nodes.length === 0 &&
    p.relations.length === 0 &&
    p.lenses.length === 0 &&
    p.folders.length === 0 &&
    p.mapImage === null
  );
}

const time = (iso: string) => new Date(iso).getTime();

export function planSync(local: Project[], remote: RemoteSummary[], meta: SyncMeta): SyncPlan {
  const plan: SyncPlan = {
    upload: [],
    download: [],
    removeLocal: [],
    deleteRemote: [],
    forgetMeta: [],
    adoptMeta: [],
    conflicts: [],
  };
  const remoteById = new Map(remote.map(r => [r.id, r]));
  const localById = new Map(local.map(p => [p.id, p]));
  const ids = new Set([...localById.keys(), ...remoteById.keys(), ...Object.keys(meta.projects)]);
  const accountHasProjects = remote.some(r => !r.deletedAt);

  for (const id of ids) {
    const L = localById.get(id);
    const R = remoteById.get(id);
    const M = meta.projects[id];

    if (L && !R) {
      // Un proyecto vacío de un navegador recién abierto sobra si la cuenta ya tiene contenido.
      if (!M && isBlankProject(L)) {
        if (accountHasProjects) plan.removeLocal.push(id);
        continue;
      }
      plan.upload.push({ project: L, baseVersion: 0 });
      continue;
    }

    if (!L && R) {
      if (R.deletedAt) {
        if (M) plan.forgetMeta.push(id);
      } else if (!M) {
        plan.download.push({ id, version: R.version });
      } else if (R.version === M.version) {
        // Se borró aquí sin cambios en la cuenta: se propaga el borrado.
        plan.deleteRemote.push({ id, baseVersion: R.version });
      } else {
        // Se borró aquí pero otro dispositivo lo cambió después: se recupera.
        plan.download.push({ id, version: R.version });
        plan.conflicts.push({ id, name: R.name, winner: 'remote' });
      }
      continue;
    }

    if (!L && !R) {
      if (M) plan.forgetMeta.push(id);
      continue;
    }

    if (!L || !R) continue;

    if (R.deletedAt) {
      const localUntouched = M ? L.updatedAt === M.updatedAt : isBlankProject(L);
      if (localUntouched) plan.removeLocal.push(id);
      else plan.upload.push({ project: L, baseVersion: R.version });
      continue;
    }

    const localChanged = !M || L.updatedAt !== M.updatedAt;
    const remoteChanged = !M || R.version !== M.version;
    if (!localChanged && !remoteChanged) continue;
    if (localChanged && !remoteChanged) {
      plan.upload.push({ project: L, baseVersion: R.version });
      continue;
    }
    if (!localChanged && remoteChanged) {
      plan.download.push({ id, version: R.version });
      continue;
    }

    const localTime = time(L.updatedAt);
    const remoteTime = time(R.updatedAt);
    if (localTime === remoteTime) {
      plan.adoptMeta.push({ id, version: R.version, updatedAt: L.updatedAt });
    } else if (localTime > remoteTime) {
      plan.upload.push({ project: L, baseVersion: R.version });
      if (M) plan.conflicts.push({ id, name: L.name, winner: 'local' });
    } else {
      plan.download.push({ id, version: R.version });
      if (M) plan.conflicts.push({ id, name: R.name, winner: 'remote' });
    }
  }

  return plan;
}

export const isEmptyPlan = (plan: SyncPlan) =>
  plan.upload.length === 0 &&
  plan.download.length === 0 &&
  plan.removeLocal.length === 0 &&
  plan.deleteRemote.length === 0 &&
  plan.forgetMeta.length === 0 &&
  plan.adoptMeta.length === 0;
