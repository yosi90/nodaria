import { COLORS, PROJECT_FORMAT_VERSION } from './constants';
import { defaultCalendar } from './calendar';
import { defaultKinship } from './kinship';
import type { AppState, FieldDefinition, Project, ProjectView, Schema, SchemaKind } from './types';
export const uid = (prefix = 'id') => `${prefix}_${crypto.randomUUID?.() ?? Math.random().toString(36).slice(2)}`;
export const now = () => new Date().toISOString();
/** Largo máximo del nombre de un proyecto: el que admite la API al guardarlo (`api/src/routes/projects.ts`). */
export const PROJECT_NAME_MAX = 200;
/** El nombre de un proyecto recortado a `PROJECT_NAME_MAX`, para que siempre se pueda sincronizar. */
export const projectName = (name: string) => name.trim().slice(0, PROJECT_NAME_MAX).trim();

export function createProject(name = 'Mi primer mapa'): Project {
  const stamp = now();
  return {
    formatVersion: PROJECT_FORMAT_VERSION,
    id: uid('project'),
    name: projectName(name) || 'Mi primer mapa',
    createdAt: stamp,
    updatedAt: stamp,
    schemas: [],
    fieldLibrary: [],
    nodes: [],
    relations: [],
    mapImage: null,
    view: createView(),
    lenses: [],
    kinship: defaultKinship(),
    queries: [],
    folders: [],
    calendar: defaultCalendar(),
    kind: 'general',
    schemaFolders: [],
    agenda: [],
    origin: null,
    tableData: {},
    sqlQueries: [],
  };
}
export function createInitialState(): AppState {
  const project = createProject();
  return { version: 3, activeProjectId: project.id, projects: [project] };
}
export function createSchema(name: string, kind: SchemaKind): Schema {
  return {
    id: uid('type'),
    name,
    kind,
    isAbstract: false,
    parentTypeId: null,
    color: COLORS[Math.floor(Math.random() * COLORS.length)],
    icon: kind === 'entity' ? 'circle' : 'link',
    description: '',
    fields: [],
    allowedChildTypeIds: [],
    sourceTypeIds: [],
    targetTypeIds: [],
    directed: false,
    relationStyle: 'normal',
    structural: false,
    parentEnd: 'target',
    inverseName: '',
    reciprocal: false,
    genealogical: false,
    maxPerSource: null,
    maxPerTarget: null,
    yieldFieldIds: [],
    table: false,
    hiddenFieldIds: [],
    fieldOrder: [],
    sqlOverrides: {},
    dbEngine: null,
    embedded: false,
  };
}
export function createField(): FieldDefinition {
  return {
    id: uid('field'),
    key: 'nuevo_campo',
    label: 'Nuevo campo',
    type: 'text',
    required: false,
    isTitle: false,
    description: '',
    defaultValue: '',
    options: [],
    referenceTypeIds: [],
    formula: '',
    nonNegative: false,
    icon: null,
    optionIcons: {},
    nodeDisplay: 'none',
    optionDisplay: {},
    imageShape: 'rounded',
    imageBorder: true,
    portrait: false,
    visibleWhen: null,
    referenceWithin: null,
    maxItemsBy: null,
    sql: null,
  };
}
export function createView(): ProjectView {
  return {
    structureId: null,
    layout: 'tree',
    hiddenRelationTypeIds: [],
    hiddenEntityTypeIds: [],
    hiddenReferenceFieldIds: [],
    tagFilter: [],
    layoutFilters: {},
    showHierarchy: true,
    hierarchyOnlyIfUnrelated: true,
    edgeLabels: 'always',
    lensId: null,
    focusDepth: 0,
    looseNearLinks: true,
    sizeByCentrality: false,
    colorByCommunity: false,
  };
}
