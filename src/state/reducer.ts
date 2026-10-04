import { createInitialState, createProject, now, uid } from '../domain/factories';
import * as lib from '../domain/library';
import * as ops from '../domain/operations';
import { moveInStructure, type StructureMove } from '../domain/structureMove';
import type { SavedQuery } from '../domain/queries';
import type {
  AppState,
  FieldDefinition,
  FieldValue,
  KinshipTerm,
  OrphanStrategy,
  Position,
  Project,
  ProjectView,
  Relation,
  Schema,
  SchemaKind,
  LayoutMode,
  MapImage,
} from '../domain/types';

export type Action =
  | { type: 'set-project'; id: string }
  | { type: 'add-project'; name: string }
  | { type: 'rename-project'; name: string }
  | { type: 'delete-project' }
  | { type: 'duplicate-project' }
  | { type: 'import-project'; project: Project }
  /** Resultado de una sincronización: sustituye o añade proyectos y quita otros, sin re-sellar `updatedAt`. */
  | { type: 'sync-apply'; upsert: Project[]; remove: string[] }
  /** Vacía el navegador (al cerrar sesión sin conservar los proyectos). */
  | { type: 'reset-state' }
  | { type: 'add-schema'; name: string; kind: SchemaKind; id?: string }
  | { type: 'update-schema'; schema: Schema }
  | { type: 'delete-schema'; id: string; strategy: OrphanStrategy }
  | { type: 'add-field'; schemaId: string; preset?: Partial<FieldDefinition> }
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
  | { type: 'move-nodes'; positions: Record<string, Position | null>; layout?: LayoutMode }
  | { type: 'update-notes'; id: string; notes: string }
  | ({ type: 'move-in-structure' } & StructureMove)
  | { type: 'update-view'; view: Partial<ProjectView> }
  | { type: 'save-lens'; name: string; includePositions: boolean; id?: string }
  | { type: 'rename-lens'; id: string; name: string }
  | { type: 'delete-lens'; id: string }
  | { type: 'apply-lens'; id: string }
  | { type: 'update-kinship'; kinship: KinshipTerm[] }
  | { type: 'set-map-image'; image: MapImage | null }
  | { type: 'set-map-scale'; scale: number }
  | { type: 'save-query'; query: SavedQuery }
  | { type: 'delete-query'; id: string }
  | { type: 'update-node'; id: string; values: Record<string, FieldValue>; parentId: string | null }
  | { type: 'delete-node'; id: string }
  | { type: 'duplicate-node'; id: string; withRelations?: boolean; newId?: string }
  | { type: 'duplicate-schema'; id: string; newId?: string }
  | {
      type: 'add-relation';
      typeId: string;
      sourceId: string;
      targetId: string;
      id?: string;
      values?: Record<string, FieldValue>;
      reverseName?: string;
      kinshipId?: string | null;
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
    case 'sync-apply': {
      const incoming = new Map(action.upsert.map(p => [p.id, p]));
      const removed = new Set(action.remove);
      const kept = state.projects.filter(p => !removed.has(p.id)).map(p => incoming.get(p.id) ?? p);
      const added = action.upsert.filter(p => !state.projects.some(existing => existing.id === p.id));
      const projects = [...kept, ...added];
      if (!projects.length) projects.push(createProject());
      const activeProjectId = projects.some(p => p.id === state.activeProjectId)
        ? state.activeProjectId
        : projects[0].id;
      return { ...state, projects, activeProjectId };
    }
    case 'reset-state':
      return createInitialState();
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
      return ops.addField(p, action.schemaId, action.preset);
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
      return ops.moveNodes(p, action.positions, action.layout);
    case 'move-in-structure':
      return moveInStructure(p, action);
    case 'update-notes':
      return ops.updateNotes(p, action.id, action.notes);
    case 'update-view':
      // Cualquier cambio manual desliga la configuración de la vista guardada.
      return ops.updateView(p, { ...action.view, lensId: action.view.lensId ?? null });
    case 'save-lens':
      return ops.saveLens(p, action.name, action.includePositions, action.id);
    case 'rename-lens':
      return ops.renameLens(p, action.id, action.name);
    case 'delete-lens':
      return ops.deleteLens(p, action.id);
    case 'apply-lens':
      return ops.applyLens(p, action.id);
    case 'set-map-image':
      return ops.setMapImage(p, action.image);
    case 'save-query':
      return {
        ...p,
        queries: p.queries.some(q => q.id === action.query.id)
          ? p.queries.map(q => (q.id === action.query.id ? action.query : q))
          : [...p.queries, action.query],
      };
    case 'delete-query':
      return { ...p, queries: p.queries.filter(q => q.id !== action.id) };
    case 'set-map-scale':
      return ops.setMapScale(p, action.scale);
    case 'update-kinship':
      return ops.updateKinship(p, action.kinship);
    case 'update-node':
      return ops.updateNode(p, action.id, action.values, action.parentId);
    case 'duplicate-node':
      return ops.duplicateNode(p, action.id, action.withRelations, action.newId).project;
    case 'duplicate-schema':
      return ops.duplicateSchema(p, action.id, action.newId).project;
    case 'delete-node':
      return ops.deleteNode(p, action.id);
    case 'add-relation':
      return ops.addRelation(p, action.typeId, action.sourceId, action.targetId, {
        id: action.id,
        values: action.values,
        reverseName: action.reverseName,
        kinshipId: action.kinshipId,
      });
    case 'update-relation':
      return ops.updateRelation(p, action.relation);
    case 'delete-relation':
      return ops.deleteRelation(p, action.id);
    default:
      return p;
  }
}
