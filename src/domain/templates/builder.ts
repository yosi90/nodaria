import { createField, createProject, createSchema, createView, uid } from '../factories';
import { defaultKinship } from '../kinship';
import type { SavedQuery } from '../queries';
import type {
  FieldDefinition,
  FieldLink,
  FieldValue,
  Lens,
  Node,
  Project,
  ProjectView,
  Relation,
  Schema,
  SchemaKind,
} from '../types';

/*
 * Constructor declarativo de proyectos de plantilla. Los ids de tipos, atributos y nodos son fijos
 * (legibles) para que el recorrido guiado y las pruebas puedan referirse a ellos; el id del
 * proyecto es nuevo en cada construcción, así que abrir dos veces el mismo ejemplo crea dos copias
 * independientes que el usuario puede modificar a su gusto.
 */

export type FieldSpec = Partial<Omit<FieldDefinition, 'id'>> & { id: string; label: string };

export function field(spec: FieldSpec): FieldDefinition {
  const key = spec.key ?? slug(spec.label);
  return { ...createField(), key, ...spec };
}

export const link = (ref: string): FieldLink => ({ ref });

export type SchemaSpec = Partial<Omit<Schema, 'id' | 'name' | 'kind'>> & { id: string; name: string };

export function entity(spec: SchemaSpec): Schema {
  return { ...createSchema(spec.name, 'entity'), ...spec, kind: 'entity' as SchemaKind };
}

export function relationType(spec: SchemaSpec & { directed?: boolean }): Schema {
  return { ...createSchema(spec.name, 'relationship'), icon: 'link', directed: true, ...spec, kind: 'relationship' };
}

export interface NodeSpec {
  id: string;
  type: string;
  parent?: string | null;
  values?: Record<string, FieldValue>;
  notes?: string;
}

export function node(spec: NodeSpec, createdAt: string): Node {
  return {
    id: spec.id,
    typeId: spec.type,
    parentId: spec.parent ?? null,
    values: spec.values ?? {},
    createdAt,
    positions: {},
    notes: spec.notes ?? '',
  };
}

export interface RelationSpec {
  id?: string;
  type: string;
  from: string;
  to: string;
  values?: Record<string, FieldValue>;
  kinship?: string;
  reverseName?: string;
}

export function relation(spec: RelationSpec, createdAt: string, index: number): Relation {
  return {
    id: spec.id ?? `${spec.type}_${index}`,
    typeId: spec.type,
    sourceId: spec.from,
    targetId: spec.to,
    values: spec.values ?? {},
    createdAt,
    reverseName: spec.reverseName ?? '',
    kinshipId: spec.kinship ?? null,
    kinshipNeutral: false,
  };
}

export interface LensSpec {
  id: string;
  name: string;
  view: Partial<ProjectView>;
}

export interface ProjectSpec {
  name: string;
  schemas: Schema[];
  fieldLibrary?: FieldDefinition[];
  nodes?: NodeSpec[];
  relations?: RelationSpec[];
  lenses?: LensSpec[];
  queries?: SavedQuery[];
  view?: Partial<ProjectView>;
}

export function buildProject(spec: ProjectSpec): Project {
  const base = createProject(spec.name);
  const stamp = base.createdAt;
  const view = { ...createView(), ...spec.view };
  const lenses: Lens[] = (spec.lenses ?? []).map(l => ({
    id: l.id,
    name: l.name,
    view: { ...createView(), ...l.view, lensId: l.id },
    positions: null,
  }));
  return {
    ...base,
    id: uid('project'),
    schemas: spec.schemas,
    fieldLibrary: spec.fieldLibrary ?? [],
    nodes: (spec.nodes ?? []).map(n => node(n, stamp)),
    relations: (spec.relations ?? []).map((r, i) => relation(r, stamp, i)),
    lenses,
    queries: spec.queries ?? [],
    kinship: defaultKinship(),
    view,
  };
}

function slug(label: string) {
  return label
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '');
}
