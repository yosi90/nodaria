import { createProject, now, uid } from '../domain/factories';
import * as lib from '../domain/library';
import * as ops from '../domain/operations';
import type {
  AppState,
  FieldDefinition,
  FieldValue,
  OrphanStrategy,
  Position,
  Project,
  ProjectView,
  Relation,
  Schema,
  SchemaKind,
} from '../domain/types';

export type Action =
  | { type: 'set-project'; id: string }
  | { type: 'add-project'; name: string }
  | { type: 'rename-project'; name: string }
  | { type: 'delete-project' }
  | { type: 'duplicate-project' }
  | { type: 'import-project'; project: Project }
  | { type: 'add-schema'; name: string; kind: SchemaKind; id?: string }
  | { type: 'update-schema'; schema: Schema }
  | { type: 'delete-schema'; id: string; strategy: OrphanStrategy }
  | { type: 'add-field'; schemaId: string }
  | { type: 'add-library-field'; id?: string }
  | { type: 'update-library-field'; field: FieldDefinition }
  | { type: 'delete-library-field'; id: string }
  | { type: 'link-field'; schemaId: string; libraryId: string }
  | { type: 'unlink-field'; schemaId: string; libraryId: string }
  | { type: 'share-field'; schemaId: string; fieldId: string }
  | { type: 'delete-field'; schemaId: string; fieldId: string }
  | {
      type: 'add-node';
      typeId: string;
      parentId: string | null;
      id?: string;
      /** Estructura en la que `parentId` es el superior; `null` o ausente = jerarquía base. */
      structureId?: string | null;
      position?: Position | null;
    }
  | { type: 'move-nodes'; positions: Record<string, Position | null> }
  | { type: 'update-notes'; id: string; notes: string }
  | { type: 'update-view'; view: Partial<ProjectView> }
  | { type: 'update-node'; id: string; values: Record<string, FieldValue>; parentId: string | null }
  | { type: 'delete-node'; id: string }
  | {
      type: 'add-relation';
      typeId: string;
      sourceId: string;
      targetId: string;
      id?: string;
      values?: Record<string, FieldValue>;
      reverseName?: string;
    }
  | { type: 'update-relation'; relation: Relation }
  | { type: 'delete-relation'; id: string };

export function appReducer(state: AppState, action: Action): AppState {
  switch (action.type) {
    case 'set-project':
      return state.projects.some(p => p.id === action.id) ? { ...state, activeProjectId: action.id } : state;
    case 'add-project': {
      const project = createProject(action.name);
      return { ...state, projects: [...state.projects, project], activeProjectId: project.id };
    }
    case 'delete-project': {
      const remaining = state.projects.filter(p => p.id !== state.activeProjectId);
      const projects = remaining.length ? remaining : [createProject()];
      return { ...state, projects, activeProjectId: projects[0].id };
    }
    case 'duplicate-project': {
      const active = state.projects.find(p => p.id === state.activeProjectId);
      if (!active) return state;
      const stamp = now();
      const copy = {
        ...active,
        id: uid('project'),
        name: `${active.name} (copia)`,
        createdAt: stamp,
        updatedAt: stamp,
      };
      return { ...state, projects: [...state.projects, copy], activeProjectId: copy.id };
    }
    case 'import-project': {
      const clash = state.projects.some(p => p.id === action.project.id);
      const project = clash ? { ...action.project, id: uid('project') } : action.project;
      return { ...state, projects: [...state.projects, project], activeProjectId: project.id };
    }
  }
  const active = state.projects.find(p => p.id === state.activeProjectId);
  if (!active) return state;
  const next = projectReducer(active, action);
  if (next === active) return state;
  const stamped = { ...next, updatedAt: now() };
  return { ...state, projects: state.projects.map(p => (p.id === active.id ? stamped : p)) };
}

function projectReducer(p: Project, action: Action): Project {
  switch (action.type) {
    case 'rename-project':
      return { ...p, name: action.name };
    case 'add-schema':
      return ops.addSchema(p, action.name, action.kind, action.id);
    case 'update-schema':
      return ops.updateSchema(p, action.schema);
    case 'delete-schema':
      return ops.deleteSchema(p, action.id, action.strategy);
    case 'add-field':
      return ops.addField(p, action.schemaId);
    case 'add-library-field':
      return lib.addLibraryField(p, action.id);
    case 'update-library-field':
      return lib.updateLibraryField(p, action.field);
    case 'delete-library-field':
      return lib.deleteLibraryField(p, action.id);
    case 'link-field':
      return lib.linkField(p, action.schemaId, action.libraryId);
    case 'unlink-field':
      return lib.unlinkField(p, action.schemaId, action.libraryId);
    case 'share-field':
      return lib.shareField(p, action.schemaId, action.fieldId);
    case 'delete-field':
      return ops.deleteField(p, action.schemaId, action.fieldId);
    case 'add-node':
      return ops.addNodeUnder(
        p,
        action.typeId,
        action.structureId ?? null,
        action.parentId,
        action.id,
        action.position,
      );
    case 'move-nodes':
      return ops.moveNodes(p, action.positions);
    case 'update-notes':
      return ops.updateNotes(p, action.id, action.notes);
    case 'update-view':
      return ops.updateView(p, action.view);
    case 'update-node':
      return ops.updateNode(p, action.id, action.values, action.parentId);
    case 'delete-node':
      return ops.deleteNode(p, action.id);
    case 'add-relation':
      return ops.addRelation(p, action.typeId, action.sourceId, action.targetId, {
        id: action.id,
        values: action.values,
        reverseName: action.reverseName,
      });
    case 'update-relation':
      return ops.updateRelation(p, action.relation);
    case 'delete-relation':
      return ops.deleteRelation(p, action.id);
    default:
      return p;
  }
}
