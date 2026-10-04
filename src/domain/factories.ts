import { COLORS, PROJECT_FORMAT_VERSION } from './constants';
import { defaultKinship } from './kinship';
import type { AppState, FieldDefinition, Project, ProjectView, Schema, SchemaKind } from './types';
export const uid = (prefix = 'id') => `${prefix}_${crypto.randomUUID?.() ?? Math.random().toString(36).slice(2)}`;
export const now = () => new Date().toISOString();
export const slugify = (value: string) =>
  value
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '');
export function createProject(name = 'Mi primer mapa'): Project {
  const stamp = now();
  return {
    formatVersion: PROJECT_FORMAT_VERSION,
    id: uid('project'),
    name,
    createdAt: stamp,
    updatedAt: stamp,
    schemas: [],
    fieldLibrary: [],
    nodes: [],
    relations: [],
    view: createView(),
    lenses: [],
    kinship: defaultKinship(),
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
    icon: null,
    optionIcons: {},
    nodeDisplay: 'none',
    optionDisplay: {},
  };
}
export function createView(): ProjectView {
  return {
    structureId: null,
    layout: 'tree',
    hiddenRelationTypeIds: [],
    hiddenEntityTypeIds: [],
    hiddenReferenceFieldIds: [],
    showHierarchy: true,
    hierarchyOnlyIfUnrelated: true,
    edgeLabels: 'always',
    lensId: null,
    focusDepth: 0,
  };
}
