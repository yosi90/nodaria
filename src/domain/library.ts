import { createField } from './factories';
import type { FieldDefinition, FieldLink, FieldValue, Project, Schema, SchemaField } from './types';

/*
 * Biblioteca de atributos compartidos. Un atributo de la biblioteca se define una vez y se vincula
 * a varios tipos; conserva el mismo id en todos, así que los valores de los nodos no cambian al
 * compartir o dejar de compartir.
 */

export const isFieldLink = (f: SchemaField): f is FieldLink => 'ref' in f;

/** Atributos propios de un tipo (sin los vinculados de la biblioteca). */
export const ownFields = (schema: Schema): FieldDefinition[] =>
  schema.fields.filter((f): f is FieldDefinition => !isFieldLink(f));

/** Atributos declarados por un tipo, resolviendo los vínculos a la biblioteca. */
export function declaredFields(p: Project, schema: Schema): FieldDefinition[] {
  return schema.fields
    .map(f => (isFieldLink(f) ? p.fieldLibrary.find(l => l.id === f.ref) : f))
    .filter((f): f is FieldDefinition => Boolean(f));
}

export const libraryField = (p: Project, id: string) => p.fieldLibrary.find(f => f.id === id);

/** Tipos que tienen vinculado un atributo de la biblioteca. */
export const usersOfLibraryField = (p: Project, id: string) =>
  p.schemas.filter(s => s.fields.some(f => isFieldLink(f) && f.ref === id));

/** Clave única frente a las de la biblioteca y las propias del tipo indicado. */
function uniqueKey(taken: string[], base: string) {
  let key = base;
  let i = 2;
  while (taken.includes(key)) key = `${base}_${i++}`;
  return key;
}

export function addLibraryField(p: Project, id?: string): Project {
  const field = createField();
  if (id) field.id = id;
  field.key = uniqueKey(
    p.fieldLibrary.map(f => f.key),
    field.key,
  );
  return { ...p, fieldLibrary: [...p.fieldLibrary, field] };
}

export function updateLibraryField(p: Project, field: FieldDefinition): Project {
  if (!p.fieldLibrary.some(f => f.id === field.id)) return p;
  return { ...p, fieldLibrary: p.fieldLibrary.map(f => (f.id === field.id ? field : f)) };
}

/** Reordena la biblioteca según la lista de ids (los que falten conservan su posición relativa al final). */
export function reorderLibrary(p: Project, ids: string[]): Project {
  const byId = new Map(p.fieldLibrary.map(f => [f.id, f]));
  const ordered = ids.map(id => byId.get(id)).filter((f): f is FieldDefinition => Boolean(f));
  const rest = p.fieldLibrary.filter(f => !ids.includes(f.id));
  return { ...p, fieldLibrary: [...ordered, ...rest] };
}

/** Elimina un atributo de la biblioteca, sus vínculos y los valores guardados. */
export function deleteLibraryField(p: Project, id: string): Project {
  if (!p.fieldLibrary.some(f => f.id === id)) return p;
  return {
    ...p,
    fieldLibrary: p.fieldLibrary.filter(f => f.id !== id),
    schemas: p.schemas.map(s => ({ ...s, fields: s.fields.filter(f => !(isFieldLink(f) && f.ref === id)) })),
    nodes: p.nodes.map(n => withoutValue(n, id)),
    relations: p.relations.map(r => withoutValue(r, id)),
  };
}

/** Vincula un atributo compartido a un tipo (al final de su lista). */
export function linkField(p: Project, schemaId: string, libraryId: string): Project {
  const schema = p.schemas.find(s => s.id === schemaId);
  if (!schema || !libraryField(p, libraryId) || schema.fields.some(f => isFieldLink(f) && f.ref === libraryId))
    return p;
  return {
    ...p,
    schemas: p.schemas.map(s => (s.id === schemaId ? { ...s, fields: [...s.fields, { ref: libraryId }] } : s)),
  };
}

/** Quita el vínculo de un tipo y borra el valor en sus nodos si ya no reciben el atributo por otra vía. */
export function unlinkField(p: Project, schemaId: string, libraryId: string): Project {
  const schema = p.schemas.find(s => s.id === schemaId);
  if (!schema) return p;
  const next: Project = {
    ...p,
    schemas: p.schemas.map(s =>
      s.id === schemaId ? { ...s, fields: s.fields.filter(f => !(isFieldLink(f) && f.ref === libraryId)) } : s,
    ),
  };
  const stillHas = (typeId: string) =>
    chain(next, typeId).some(s => s.fields.some(f => isFieldLink(f) && f.ref === libraryId));
  return {
    ...next,
    nodes: next.nodes.map(n => (stillHas(n.typeId) ? n : withoutValue(n, libraryId))),
    relations: next.relations.map(r => (stillHas(r.typeId) ? r : withoutValue(r, libraryId))),
  };
}

/** Pasa un atributo propio a la biblioteca y deja un vínculo en su lugar; los valores no cambian. */
export function shareField(p: Project, schemaId: string, fieldId: string): Project {
  const schema = p.schemas.find(s => s.id === schemaId);
  const field = schema && ownFields(schema).find(f => f.id === fieldId);
  if (!schema || !field) return p;
  const shared = {
    ...field,
    key: uniqueKey(
      p.fieldLibrary.map(f => f.key),
      field.key,
    ),
  };
  return {
    ...p,
    fieldLibrary: [...p.fieldLibrary, shared],
    schemas: p.schemas.map(s =>
      s.id === schemaId
        ? { ...s, fields: s.fields.map(f => (!isFieldLink(f) && f.id === fieldId ? { ref: fieldId } : f)) }
        : s,
    ),
  };
}

function chain(p: Project, typeId: string): Schema[] {
  const result: Schema[] = [];
  const seen = new Set<string>();
  let cur = p.schemas.find(s => s.id === typeId);
  while (cur && !seen.has(cur.id)) {
    seen.add(cur.id);
    result.push(cur);
    cur = cur.parentTypeId ? p.schemas.find(s => s.id === cur!.parentTypeId) : undefined;
  }
  return result;
}

function withoutValue<T extends { values: Record<string, FieldValue> }>(item: T, fieldId: string): T {
  if (!(fieldId in item.values)) return item;
  const values = { ...item.values };
  delete values[fieldId];
  return { ...item, values };
}
