import { PROJECT_FORMAT_VERSION } from '../domain/constants';
import { createInitialState } from '../domain/factories';
import { repairProject } from '../domain/integrity';
import type { AppState, Project } from '../domain/types';
import { migrateProject } from './migrations';

/** Clave histórica; se mantiene para conservar los proyectos de versiones anteriores. */
export const STORAGE_KEY = 'nodaria_state_v1';

/** Prefijo de las copias del texto guardado que no se pudo leer entero (una clave por carga fallida). */
export const RESCUE_PREFIX = 'nodaria_rescue_v1:';

/** Nombre con el que se informa cuando no se puede leer nada del texto guardado. */
export const ALL_PROJECTS = 'Todos los proyectos (el texto guardado está dañado)';

/** Datos guardados que no se pudieron abrir al cargar. */
export interface LoadDamage {
  /** Proyectos que no se pudieron leer, o `ALL_PROJECTS`. */
  lost: string[];
  /** Texto original tal como estaba guardado, para poder descargarlo. */
  raw: string;
  /**
   * Si se apartó una copia del texto en el navegador (`RESCUE_PREFIX`). Si no cupo, no se debe
   * guardar nada encima hasta que el usuario descargue el original o renuncie a él.
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

/** Migra y repara un proyecto en bruto, devolviendo las correcciones aplicadas. */
export function prepareProject(raw: unknown) {
  return repairProject(migrateProject((raw ?? {}) as Partial<Project>));
}

/**
 * Lee el estado guardado. Cada proyecto se prepara por separado: si uno no se puede migrar o
 * reparar, los demás se cargan igualmente y el ilegible se informa en `lost`.
 */
export function parseState(raw: string): Omit<LoadResult, 'damage'> & { lost: string[] } {
  let parsed: { activeProjectId?: unknown; projects?: unknown };
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { state: createInitialState(), repairs: [], lost: [ALL_PROJECTS] };
  }
  if (!parsed || typeof parsed !== 'object' || !Array.isArray(parsed.projects))
    return { state: createInitialState(), repairs: [], lost: [ALL_PROJECTS] };

  const repairs: LoadResult['repairs'] = [];
  const lost: string[] = [];
  const projects: Project[] = [];
  for (const item of parsed.projects as unknown[]) {
    try {
      const { project, issues } = prepareProject(item);
      if (issues.length) repairs.push({ projectName: project.name, issues });
      projects.push(project);
    } catch {
      const name = (item as { name?: unknown } | null)?.name;
      lost.push(typeof name === 'string' && name ? name : 'Proyecto sin nombre');
    }
  }
  if (!projects.length) return { state: createInitialState(), repairs, lost };
  const activeProjectId = projects.some(p => p.id === parsed.activeProjectId)
    ? (parsed.activeProjectId as string)
    : projects[0].id;
  return { state: { version: 3, activeProjectId, projects }, repairs, lost };
}

export function loadState(): LoadResult {
  let raw: string | null;
  try {
    raw = localStorage.getItem(STORAGE_KEY);
  } catch {
    // Sin acceso al almacenamiento tampoco se podrá escribir encima: el guardado avisará.
    return { state: createInitialState(), repairs: [], damage: null };
  }
  if (!raw) return { state: createInitialState(), repairs: [], damage: null };
  const { state, repairs, lost } = parseState(raw);
  if (!lost.length) return { state, repairs, damage: null };
  return { state, repairs, damage: { lost, raw, rescued: storeRescue(raw) } };
}

/** Aparta el texto original antes de que el primer guardado lo sustituya. */
function storeRescue(raw: string) {
  try {
    localStorage.setItem(`${RESCUE_PREFIX}${new Date().toISOString()}`, raw);
    return true;
  } catch {
    return false;
  }
}

/** Guarda el estado; lanza si el navegador no lo permite (ver `saveFailureOf`). */
export function saveState(state: AppState) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
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
