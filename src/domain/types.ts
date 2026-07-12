export type FieldType = 'text' | 'longText' | 'number' | 'boolean' | 'date' | 'select' | 'nodeRef' | 'nodeRefs' | 'computed';
export type SchemaKind = 'entity' | 'relationship';
export type RelationStyle = 'normal' | 'strong' | 'hidden';
export type FieldValue = string | number | boolean | string[] | null;

export interface FieldDefinition {
  id: string; key: string; label: string; type: FieldType; required: boolean; isTitle: boolean;
  description: string; defaultValue: FieldValue; options: string[]; referenceTypeIds: string[]; formula: string;
}
export interface Schema {
  id: string; name: string; kind: SchemaKind; isAbstract: boolean; parentTypeId: string | null;
  color: string; description: string; fields: FieldDefinition[]; allowedChildTypeIds: string[];
  sourceTypeIds: string[]; targetTypeIds: string[]; directed: boolean; relationStyle: RelationStyle;
}
export interface Node { id: string; typeId: string; parentId: string | null; values: Record<string, FieldValue>; createdAt: string; }
export interface Relation { id: string; typeId: string; sourceId: string; targetId: string; values: Record<string, FieldValue>; createdAt: string; }
export interface Project { id: string; name: string; createdAt: string; updatedAt: string; schemas: Schema[]; nodes: Node[]; relations: Relation[]; }
export interface AppState { version: 2; activeProjectId: string; projects: Project[]; }
export type Selection = { kind: 'node' | 'relation'; id: string } | null;
