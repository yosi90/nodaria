export type FieldType =
  'text' | 'longText' | 'number' | 'boolean' | 'date' | 'select' | 'nodeRef' | 'nodeRefs' | 'computed';
export type SchemaKind = 'entity' | 'relationship';
export type RelationStyle = 'normal' | 'strong' | 'hidden';
export type FieldValue = string | number | boolean | string[] | null;

export interface FieldDefinition {
  id: string;
  key: string;
  label: string;
  type: FieldType;
  required: boolean;
  isTitle: boolean;
  description: string;
  defaultValue: FieldValue;
  options: string[];
  referenceTypeIds: string[];
  formula: string;
}
export interface Schema {
  id: string;
  name: string;
  kind: SchemaKind;
  isAbstract: boolean;
  parentTypeId: string | null;
  color: string;
  /** Nombre de un icono del catálogo de la interfaz; desconocido o vacío se muestra como genérico. */
  icon: string;
  description: string;
  fields: FieldDefinition[];
  allowedChildTypeIds: string[];
  sourceTypeIds: string[];
  targetTypeIds: string[];
  directed: boolean;
  relationStyle: RelationStyle;
}
/** Los valores de nodos y relaciones se indexan por `FieldDefinition.id`, no por su clave. */
export interface Node {
  id: string;
  typeId: string;
  parentId: string | null;
  values: Record<string, FieldValue>;
  createdAt: string;
}
export interface Relation {
  id: string;
  typeId: string;
  sourceId: string;
  targetId: string;
  values: Record<string, FieldValue>;
  createdAt: string;
}
export interface Project {
  /** Versión del formato de datos del proyecto; ver `src/services/migrations.ts`. */
  formatVersion: number;
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  schemas: Schema[];
  nodes: Node[];
  relations: Relation[];
}
export interface AppState {
  version: 3;
  activeProjectId: string;
  projects: Project[];
}
export type Selection = { kind: 'node' | 'relation'; id: string } | null;
/** Qué hacer con los subnodos de otros tipos cuando se borran los nodos de su padre. */
export type OrphanStrategy = 'lift' | 'cascade';
