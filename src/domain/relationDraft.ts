import { relationEnds } from './constraints';
import { defaultValues } from './operations';
import { allFields, getNode, getSchema, typeMatches } from './selectors';
import type { FieldValue, Project } from './types';

export interface RelationDraft {
  typeId: string;
  iAmSource: boolean;
  otherId: string | null;
  values: Record<string, FieldValue>;
}

/** Cambia el tipo del editor conservando el sentido, el otro nodo y los atributos compatibles. */
export function changeRelationDraftType(
  p: Project,
  nodeId: string,
  draft: RelationDraft,
  typeId: string,
): RelationDraft {
  if (draft.typeId === typeId) return draft;
  const schema = getSchema(p, typeId);
  const me = getNode(p, nodeId);
  if (!schema || schema.kind !== 'relationship' || !me) return draft;
  const ends = relationEnds(p, schema);
  const fits = (source: boolean) => typeMatches(p, me.typeId, source ? ends.source : ends.target);
  let iAmSource = schema.genealogical || !schema.directed ? true : draft.iAmSource;
  if (!schema.genealogical && !fits(iAmSource) && fits(!iAmSource)) iAmSource = !iAmSource;
  const other = draft.otherId ? getNode(p, draft.otherId) : undefined;
  const otherId =
    fits(iAmSource) &&
    other &&
    other.id !== nodeId &&
    typeMatches(p, other.typeId, iAmSource ? ends.target : ends.source)
      ? other.id
      : null;

  const from = allFields(p, draft.typeId);
  const values = defaultValues(p, typeId);
  for (const field of allFields(p, typeId)) {
    if (field.type === 'computed') continue;
    const previous =
      from.find(f => f.id === field.id && f.type === field.type) ??
      from.find(f => f.key === field.key && f.type === field.type);
    if (previous && draft.values[previous.id] !== undefined) values[field.id] = draft.values[previous.id];
  }
  return { typeId, iAmSource, otherId, values };
}
