import { PROJECT_FORMAT_VERSION } from '../domain/constants';
import { createInitialState } from '../domain/factories';
import { repairProject } from '../domain/integrity';
import type { AppState, Project } from '../domain/types';
import * as database from './database';
import { migrateProject } from './migrations';

/*
 * Persistencia local. Desde el 2026-10-06 los proyectos viven en IndexedDB (`database.ts`), un
 * registro por proyecto, y cada guardado solo escribe los que cambiaron. `localStorage` se lee para
 * migrar y sigue de respaldo si el navegador no ofrece IndexedDB y nunca se migró.
 */

/** Clave histórica; se mantiene para conservar los proyectos de versiones anteriores. */
export const STORAGE_KEY = 'nodaria_state_v1';

/** Prefijo de las copias del texto guardado que no se pudo leer entero (una clave por carga fallida). */
export const RESCUE_PREFIX = 'nodaria_rescue_v1:';

/** Marca que deja el primer guardado en IndexedDB: a partir de ahí, sin IndexedDB no se arranca en blanco. */
export const BACKEND_KEY = 'nodaria_storage_v1';

/** Nombre con el que se informa cuando no se puede leer nada del texto guardado. */
export const ALL_PROJECTS = 'Todos los proyectos (el texto guardado está dañado)';

/** Nombre con el que se informa cuando la base del navegador ya no tiene lo que tuvo. */
export const MISSING_PROJECTS = 'Todos los proyectos (ya no están en este navegador)';

/** Datos guardados que no se pudieron abrir al cargar. */
export interface LoadDamage {
  /** Proyectos que no se pudieron leer, o `ALL_PROJECTS` / `MISSING_PROJECTS`. */
  lost: string[];
  /** Texto original tal como estaba guardado, para poder descargarlo; `null` si no queda nada. */
  raw: string | null;
  /**
   * Si el original quedó a salvo (copia apartada o registro intacto). Si no, no se debe guardar
   * nada encima hasta que el usuario lo descargue o renuncie a él.
   */
  rescued: boolean;
}

export interface LoadResult {
  state: AppState;
  /** Correcciones aplicadas al cargar, agrupadas por proyecto. */
  repairs: { projectName: string; issues: string[] }[];
  damage: LoadDamage | null;
}

/** Motivo por el que no se pudo guardar: sin espacio, o el navegador no deja guardar. */
export type SaveFailure = 'quota' | 'unavailable';

/** El almacenamiento no se puede leer y arrancar en blanco pondría en riesgo los datos. */
export class StorageUnavailableError extends Error {}

/** Migra y repara un proyecto en bruto, devolviendo las correcciones aplicadas. */
export function prepareProject(raw: unknown) {
  return repairProject(migrateProject((raw ?? {}) as Partial<Project>));
}

/** Prepara cada proyecto por separado: uno que no se puede migrar o reparar no arrastra a los demás. */
export function prepareProjects(items: unknown[]) {
  const repairs: LoadResult['repairs'] = [];
  const lost: { index: number; name: string }[] = [];
  const projects: Project[] = [];
  /** Proyectos que la carga cambió (formato antiguo o reparaciones): hay que volver a guardarlos. */
  const changed = new Set<string>();
  items.forEach((item, index) => {
    try {
      const { project, issues } = prepareProject(item);
      if (issues.length) repairs.push({ projectName: project.name, issues });
      if (issues.length || (item as { formatVersion?: unknown } | null)?.formatVersion !== PROJECT_FORMAT_VERSION)
        changed.add(project.id);
      projects.push(project);
    } catch {
      const name = (item as { name?: unknown } | null)?.name;
      lost.push({ index, name: typeof name === 'string' && name ? name : 'Proyecto sin nombre' });
    }
  });
  return { projects, repairs, lost, changed };
}

/** Estado con los proyectos leídos; sin ninguno, el inicial. */
function stateOf(projects: Project[], activeProjectId: unknown): AppState {
  if (!projects.length) return createInitialState();
  const active = projects.some(p => p.id === activeProjectId) ? (activeProjectId as string) : projects[0].id;
  return { version: 3, activeProjectId: active, projects };
}

/** Lee el texto de `localStorage` sin sustituir nada: `projects` queda vacío si no había nada legible. */
function readStateText(raw: string) {
  let parsed: { activeProjectId?: unknown; projects?: unknown };
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { activeProjectId: null, projects: [], repairs: [], lost: [ALL_PROJECTS] };
  }
  if (!parsed || typeof parsed !== 'object' || !Array.isArray(parsed.projects))
    return { activeProjectId: null, projects: [], repairs: [], lost: [ALL_PROJECTS] };
  const { projects, repairs, lost } = prepareProjects(parsed.projects);
  return { activeProjectId: parsed.activeProjectId, projects, repairs, lost: lost.map(l => l.name) };
}

/**
 * Lee el estado guardado. Cada proyecto se prepara por separado: si uno no se puede migrar o
 * reparar, los demás se cargan igualmente y el ilegible se informa en `lost`.
 */
export function parseState(raw: string): Omit<LoadResult, 'damage'> & { lost: string[] } {
  const { activeProjectId, projects, repairs, lost } = readStateText(raw);
  return { state: stateOf(projects, activeProjectId), repairs, lost };
}

/** Qué escribir en la base: los proyectos cambiados desde el último guardado (por referencia) y los que ya no están. */
export function planWrite(
  state: AppState,
  written: ReadonlyMap<string, Project>,
  stored: ReadonlySet<string>,
): database.WriteChanges {
  const ids = new Set(state.projects.map(p => p.id));
  return {
    put: state.projects.filter(p => written.get(p.id) !== p),
    remove: [...stored].filter(id => !ids.has(id)),
    meta: { activeProjectId: state.activeProjectId, order: state.projects.map(p => p.id) },
  };
}

/** Ordena los registros según la lista guardada; los que no figuran en ella van al final. */
export function orderRecords<T extends { id: string }>(records: T[], order: string[]) {
  const rank = new Map(order.map((id, i) => [id, i]));
  return [...records].sort((a, b) => (rank.get(a.id) ?? Infinity) - (rank.get(b.id) ?? Infinity));
}

/**
 * Combina los proyectos de la base con los que una pestaña de la versión anterior siguió guardando
 * en `localStorage` después de migrar: entran los que no existían y los que tienen un cambio más reciente.
 */
export function mergeLegacy(current: Project[], legacy: Project[]) {
  const byId = new Map(current.map(p => [p.id, p]));
  const time = (p: Project) => new Date(p.updatedAt).getTime();
  const newer = legacy.filter(p => {
    const known = byId.get(p.id);
    return !known || time(p) > time(known);
  });
  const replaced = new Map(newer.map(p => [p.id, p]));
  return {
    projects: [...current.map(p => replaced.get(p.id) ?? p), ...newer.filter(p => !byId.has(p.id))],
    newer,
  };
}

type Backend = { kind: 'indexeddb'; db: IDBDatabase } | { kind: 'localStorage' };

let backend: Backend = { kind: 'localStorage' };
/** Última versión de cada proyecto que se sabe escrita en la base. */
let written = new Map<string, Project>();
/** Ids que pueden estar en la base: se añaden antes de escribir y se quitan al confirmar el borrado. */
let stored = new Set<string>();
let marked = false;
let loading: Promise<LoadResult> | null = null;

const now = () => new Date().toISOString();

function readLocal(key: string) {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}
function writeLocal(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
    return true;
  } catch {
    return false;
  }
}
function removeLocal(key: string) {
  try {
    localStorage.removeItem(key);
  } catch {
    // Sin acceso: no hay nada que liberar.
  }
}
function localRescueKeys() {
  try {
    return Object.keys(localStorage).filter(key => key.startsWith(RESCUE_PREFIX));
  } catch {
    return [];
  }
}
const markIndexedDb = () => readLocal(BACKEND_KEY) === 'indexeddb' || writeLocal(BACKEND_KEY, 'indexeddb');

/** Carga una sola vez por página (en desarrollo, StrictMode monta dos veces). */
export function loadState(): Promise<LoadResult> {
  loading ??= load();
  return loading;
}

async function load(): Promise<LoadResult> {
  let db: IDBDatabase;
  try {
    db = await database.openDatabase();
  } catch {
    // Si los datos ya estaban en IndexedDB, seguir con localStorage sería arrancar sin ellos.
    if (readLocal(BACKEND_KEY) === 'indexeddb')
      throw new StorageUnavailableError('No se puede abrir la base de datos del navegador.');
    return loadLocal();
  }
  backend = { kind: 'indexeddb', db };
  try {
    return await loadDatabase(db);
  } catch {
    throw new StorageUnavailableError('No se pueden leer los datos de la base del navegador.');
  }
}

/** Respaldo sin IndexedDB: todo el estado en una clave de `localStorage`. */
function loadLocal(): LoadResult {
  backend = { kind: 'localStorage' };
  const raw = readLocal(STORAGE_KEY);
  if (!raw) return { state: createInitialState(), repairs: [], damage: null };
  const { state, repairs, lost } = parseState(raw);
  if (!lost.length) return { state, repairs, damage: null };
  // Se aparta el original antes de que el primer guardado lo sustituya.
  const rescued = writeLocal(`${RESCUE_PREFIX}${now()}`, raw);
  return { state, repairs, damage: { lost, raw, rescued } };
}

async function loadDatabase(db: IDBDatabase): Promise<LoadResult> {
  const { meta, records } = await database.readDatabase(db);
  if (!meta && !records.length) {
    // La base estuvo en uso y está vacía: se borró fuera de la app. La cuenta puede recuperarlos.
    if (readLocal(BACKEND_KEY) === 'indexeddb')
      return {
        state: createInitialState(),
        repairs: [],
        damage: { lost: [MISSING_PROJECTS], raw: null, rescued: true },
      };
    return migrateLocal(db);
  }

  const ordered = orderRecords(records, meta?.order ?? []);
  const { projects, repairs, lost, changed } = prepareProjects(ordered.map(r => r.value));
  stored = new Set(records.map(r => r.id));
  let damage: LoadDamage | null = null;
  if (lost.length) {
    const unreadable = lost.map(l => ordered[l.index]);
    const raw = JSON.stringify({
      version: 3,
      activeProjectId: meta?.activeProjectId,
      projects: unreadable.map(r => r.value),
    });
    // Se apartan como copia; si no se puede, el registro se queda donde está y ningún guardado lo toca.
    await database
      .backUpAndRemove(
        db,
        [{ kind: 'rescue', savedAt: now(), raw }],
        unreadable.map(r => r.id),
      )
      .catch(() => undefined);
    for (const record of unreadable) stored.delete(record.id);
    damage = { lost: lost.map(l => l.name), raw, rescued: true };
  }

  // Lo leído tal cual no se reescribe hasta que cambie; lo migrado o reparado se guarda en el primer guardado.
  written = new Map(projects.filter(p => !changed.has(p.id)).map(p => [p.id, p]));
  let loaded = projects;
  const legacyRaw = readLocal(STORAGE_KEY);
  if (legacyRaw) {
    const legacy = readStateText(legacyRaw);
    const merged = mergeLegacy(projects, legacy.projects);
    loaded = merged.projects;
    for (const p of merged.newer) stored.add(p.id);
    try {
      await database.writeDatabase(db, {
        ...planWrite(stateOf(loaded, meta?.activeProjectId), new Map(), new Set()),
        put: merged.newer,
        backups: [{ kind: 'legacy-localstorage', savedAt: now(), raw: legacyRaw }],
      });
      removeLocal(STORAGE_KEY);
      for (const p of merged.newer) written.set(p.id, p);
    } catch {
      // Sin escribir no se libera: el primer guardado volverá a intentarlo con todo.
    }
    repairs.push(...legacy.repairs.filter(r => merged.newer.some(p => p.name === r.projectName)));
  }

  marked = markIndexedDb();
  return { state: stateOf(loaded, meta?.activeProjectId), repairs, damage };
}

/** Primera carga con IndexedDB: se traen el estado y las copias de `localStorage`, y se libera. */
async function migrateLocal(db: IDBDatabase): Promise<LoadResult> {
  const raw = readLocal(STORAGE_KEY);
  const rescues = localRescueKeys().flatMap(key => {
    const text = readLocal(key);
    return text ? [{ key, text }] : [];
  });
  if (!raw && !rescues.length) return { state: createInitialState(), repairs: [], damage: null };

  const { state, repairs, lost } = raw
    ? parseState(raw)
    : { state: createInitialState(), repairs: [], lost: [] as string[] };
  const savedAt = now();
  const backups: database.Backup[] = [
    ...(raw ? [{ kind: 'legacy-localstorage' as const, savedAt, raw }] : []),
    ...rescues.map(r => ({ kind: 'rescue' as const, savedAt: r.key.slice(RESCUE_PREFIX.length), raw: r.text })),
  ];
  try {
    await database.writeDatabase(db, { ...planWrite(state, new Map(), new Set()), backups });
  } catch {
    // La base no admite la escritura: se sigue con localStorage, que aún tiene los datos.
    return loadLocal();
  }
  written = new Map(state.projects.map(p => [p.id, p]));
  stored = new Set(written.keys());
  marked = markIndexedDb();
  removeLocal(STORAGE_KEY);
  for (const r of rescues) removeLocal(r.key);
  // El original quedó copiado en la base: lo ilegible está a salvo.
  return { state, repairs, damage: lost.length ? { lost, raw, rescued: true } : null };
}

/** Guarda el estado; rechaza si el navegador no lo permite (ver `saveFailureOf`). */
export async function saveState(state: AppState) {
  if (backend.kind === 'localStorage') {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    return;
  }
  const changes = planWrite(state, written, stored);
  for (const p of changes.put) stored.add(p.id);
  await database.writeDatabase(backend.db, changes);
  for (const p of changes.put) written.set(p.id, p);
  for (const id of changes.remove) {
    written.delete(id);
    stored.delete(id);
  }
  if (!marked) marked = markIndexedDb();
}

/** Borra las copias apartadas (al vaciar el navegador). */
export async function clearBackups() {
  for (const key of localRescueKeys()) removeLocal(key);
  if (backend.kind === 'indexeddb') await database.clearBackups(backend.db);
}

export function saveFailureOf(error: unknown): SaveFailure {
  const quota =
    error instanceof DOMException &&
    (error.name === 'QuotaExceededError' ||
      error.name === 'NS_ERROR_DOM_QUOTA_REACHED' ||
      error.code === 22 ||
      error.code === 1014);
  return quota ? 'quota' : 'unavailable';
}

export function serializeProject(project: Project) {
  return JSON.stringify(
    { app: 'Nodaria', version: PROJECT_FORMAT_VERSION, exportedAt: new Date().toISOString(), project },
    null,
    2,
  );
}

/** Lee una exportación de Nodaria (actual o antigua). Lanza un error si el texto no es un proyecto. */
export function parseProject(text: string) {
  const data = JSON.parse(text);
  const raw = data?.project ?? data;
  const isProject =
    raw &&
    typeof raw === 'object' &&
    !Array.isArray(raw) &&
    (Array.isArray(raw.schemas) || Array.isArray(raw.nodes)) &&
    Array.isArray(raw.schemas ?? []) &&
    Array.isArray(raw.nodes ?? []) &&
    Array.isArray(raw.relations ?? []);
  if (!isProject) throw new Error('Formato no reconocido');
  return prepareProject(raw);
}
