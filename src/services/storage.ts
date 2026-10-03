import { PROJECT_FORMAT_VERSION } from '../domain/constants';
import { createInitialState } from '../domain/factories';
import { repairProject } from '../domain/integrity';
import type { AppState, Project } from '../domain/types';
import { migrateProject } from './migrations';

/** Clave histórica; se mantiene para conservar los proyectos de versiones anteriores. */
export const STORAGE_KEY = 'nodaria_state_v1';

export interface LoadResult {
  state: AppState;
  /** Correcciones aplicadas al cargar, agrupadas por proyecto. */
  repairs: { projectName: string; issues: string[] }[];
}

/** Migra y repara un proyecto en bruto, devolviendo las correcciones aplicadas. */
export function prepareProject(raw: unknown) {
  return repairProject(migrateProject((raw ?? {}) as Partial<Project>));
}

export function loadState(): LoadResult {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { state: createInitialState(), repairs: [] };
    const parsed = JSON.parse(raw);
    const repairs: LoadResult['repairs'] = [];
    const projects: Project[] = (parsed.projects || []).map((item: unknown) => {
      const { project, issues } = prepareProject(item);
      if (issues.length) repairs.push({ projectName: project.name, issues });
      return project;
    });
    if (!projects.length) return { state: createInitialState(), repairs };
    const activeProjectId = projects.some(p => p.id === parsed.activeProjectId)
      ? parsed.activeProjectId
      : projects[0].id;
    return { state: { version: 3, activeProjectId, projects }, repairs };
  } catch {
    return { state: createInitialState(), repairs: [] };
  }
}

export function saveState(state: AppState) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
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
