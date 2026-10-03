import { createField, createProject, createSchema } from '../domain/factories';
import type { FieldDefinition, FieldValue, Node, Project, Relation, Schema, SchemaKind } from '../domain/types';

/** Constructores compactos para pruebas: ids legibles y valores por defecto razonables. */
export function schema(id: string, patch: Partial<Schema> = {}, kind: SchemaKind = 'entity'): Schema {
  return { ...createSchema(id, kind), id, ...patch };
}

export function field(id: string, patch: Partial<FieldDefinition> = {}): FieldDefinition {
  return { ...createField(), id, key: id, label: id, ...patch };
}

export function node(
  id: string,
  typeId: string,
  parentId: string | null = null,
  values: Record<string, FieldValue> = {},
): Node {
  return { id, typeId, parentId, values, createdAt: '2026-01-01T00:00:00.000Z', position: null, notes: '' };
}

export function relation(id: string, typeId: string, sourceId: string, targetId: string): Relation {
  return { id, typeId, sourceId, targetId, values: {}, createdAt: '2026-01-01T00:00:00.000Z' };
}

export function project(patch: Partial<Project> = {}): Project {
  return { ...createProject('Prueba'), id: 'p1', ...patch };
}
