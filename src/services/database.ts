import type { Project } from '../domain/types';

/**
 * Base de datos del navegador (IndexedDB), sin dependencias. Tres almacenes:
 * - `projects`: un registro por proyecto, con su id como clave;
 * - `meta`: el registro `state` con el proyecto activo y el orden de la lista;
 * - `backups`: copias apartadas (el `localStorage` previo a la migración y los datos ilegibles).
 * Solo la usa `storage.ts`; las reglas de qué escribir viven allí.
 */

const DB_NAME = 'nodaria';
const DB_VERSION = 1;

export interface StoredMeta {
  activeProjectId: string;
  /** Orden de los proyectos en la lista. */
  order: string[];
}

export interface Backup {
  kind: 'legacy-localstorage' | 'rescue';
  savedAt: string;
  /** Texto original, tal como se leyó. */
  raw: string;
}

export interface WriteChanges {
  put: Project[];
  remove: string[];
  meta: StoredMeta;
  /** Copias que apartar en la misma transacción. */
  backups?: Backup[];
}

export function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB no está disponible'));
      return;
    }
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      for (const name of ['projects', 'meta', 'backups'])
        if (!db.objectStoreNames.contains(name)) db.createObjectStore(name);
    };
    request.onsuccess = () => {
      const db = request.result;
      // Una versión nueva abierta en otra pestaña necesita que esta suelte la base.
      db.onversionchange = () => db.close();
      resolve(db);
    };
    request.onerror = () => reject(request.error);
  });
}

const settled = <T>(request: IDBRequest<T>) =>
  new Promise<T>((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });

const committed = (tx: IDBTransaction) =>
  new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error ?? new DOMException('Transacción cancelada', 'AbortError'));
  });

/** Lee el estado general y todos los proyectos, cada uno con su clave. */
export async function readDatabase(db: IDBDatabase) {
  const tx = db.transaction(['meta', 'projects'], 'readonly');
  const projects = tx.objectStore('projects');
  const [meta, keys, values] = await Promise.all([
    settled(tx.objectStore('meta').get('state') as IDBRequest<StoredMeta | undefined>),
    settled(projects.getAllKeys()),
    settled(projects.getAll()),
  ]);
  return { meta, records: keys.map((key, i) => ({ id: String(key), value: values[i] as unknown })) };
}

/** Escribe y borra proyectos, el estado general y las copias en una sola transacción. */
export function writeDatabase(db: IDBDatabase, changes: WriteChanges) {
  const tx = db.transaction(['meta', 'projects', 'backups'], 'readwrite');
  const projects = tx.objectStore('projects');
  for (const project of changes.put) projects.put(project, project.id);
  for (const id of changes.remove) projects.delete(id);
  tx.objectStore('meta').put(changes.meta, 'state');
  const backups = tx.objectStore('backups');
  changes.backups?.forEach((backup, i) => backups.put(backup, `${backup.kind}:${backup.savedAt}:${i}`));
  return committed(tx);
}

/** Aparta copias y, en la misma transacción, retira los proyectos que contienen. */
export function backUpAndRemove(db: IDBDatabase, backups: Backup[], remove: string[]) {
  const tx = db.transaction(['projects', 'backups'], 'readwrite');
  const store = tx.objectStore('backups');
  backups.forEach((backup, i) => store.put(backup, `${backup.kind}:${backup.savedAt}:${i}`));
  for (const id of remove) tx.objectStore('projects').delete(id);
  return committed(tx);
}

/** Reserva de una cuenta: proyectos con cambios sin subir, apartados al cerrarse su sesión. */
export interface Vault {
  kind: 'vault';
  savedAt: string;
  projects: Project[];
}

const vaultKey = (account: string) => `vault:${account}`;

/** Aparta (sustituye) la reserva de una cuenta; sin proyectos, la borra. */
export function putVault(db: IDBDatabase, account: string, projects: Project[]) {
  const tx = db.transaction('backups', 'readwrite');
  const store = tx.objectStore('backups');
  if (projects.length)
    store.put({ kind: 'vault', savedAt: new Date().toISOString(), projects } satisfies Vault, vaultKey(account));
  else store.delete(vaultKey(account));
  return committed(tx);
}

/** Saca la reserva de una cuenta (la lee y la borra en la misma transacción). */
export async function takeVault(db: IDBDatabase, account: string): Promise<Project[]> {
  const tx = db.transaction('backups', 'readwrite');
  const store = tx.objectStore('backups');
  const found = (await settled(store.get(vaultKey(account)) as IDBRequest<Vault | undefined>)) ?? null;
  store.delete(vaultKey(account));
  await committed(tx);
  return found?.projects ?? [];
}

/**
 * Versión base de un proyecto compartido: la última que este navegador tiene del grupo, para combinar
 * con ella los cambios de aquí y los de otra persona (`merge.ts`). Sin proyecto, se borra.
 */
const sharedBaseKey = (id: string) => `shared-base:${id}`;

export function putSharedBase(db: IDBDatabase, id: string, project: Project | null) {
  const tx = db.transaction('backups', 'readwrite');
  const store = tx.objectStore('backups');
  if (project) store.put({ kind: 'shared-base', project }, sharedBaseKey(id));
  else store.delete(sharedBaseKey(id));
  return committed(tx);
}

export async function getSharedBase(db: IDBDatabase, id: string): Promise<Project | null> {
  const tx = db.transaction('backups', 'readonly');
  const found = await settled(
    tx.objectStore('backups').get(sharedBaseKey(id)) as IDBRequest<{ project: Project } | undefined>,
  );
  return found?.project ?? null;
}

export function clearBackups(db: IDBDatabase) {
  const tx = db.transaction('backups', 'readwrite');
  tx.objectStore('backups').clear();
  return committed(tx);
}
