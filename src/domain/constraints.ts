import { inheritedSchemas } from './selectors';
import type { Project, Schema } from './types';

/*
 * Restricciones heredadas. Un tipo de entidad admite como subnodos lo que admite él más lo que
 * admiten sus ancestros (unión). Un tipo de relación toma «Desde» y «Hacia» de sí mismo o, si los
 * deja vacíos, del ancestro más cercano que los declare.
 */

/** Tipos de subnodo admitidos por un tipo de entidad, contando los heredados. */
export function effectiveChildTypes(p: Project, typeId: string): string[] {
  const ids = new Set<string>();
  inheritedSchemas(p, typeId).forEach(s => s.allowedChildTypeIds.forEach(id => ids.add(id)));
  return [...ids];
}

/** Extremos admitidos por un tipo de relación: los propios o, si están vacíos, los del ancestro más cercano. */
export function relationEnds(p: Project, schema: Schema): { source: string[]; target: string[] } {
  const chain = inheritedSchemas(p, schema.id).reverse(); // del propio al más lejano
  const pick = (key: 'sourceTypeIds' | 'targetTypeIds') => chain.find(s => s[key].length > 0)?.[key] ?? [];
  return { source: pick('sourceTypeIds'), target: pick('targetTypeIds') };
}

/** Lo que llega heredado y no está declarado en el propio tipo (para explicarlo en el editor). */
export function inheritedConstraints(p: Project, schema: Schema) {
  const ancestors = inheritedSchemas(p, schema.id).slice(0, -1);
  const children = [...new Set(ancestors.flatMap(a => a.allowedChildTypeIds))].filter(
    id => !schema.allowedChildTypeIds.includes(id),
  );
  const ends = relationEnds(p, schema);
  return {
    childTypeIds: children,
    sourceFrom: schema.sourceTypeIds.length
      ? null
      : (ancestors.reverse().find(a => a.sourceTypeIds.length > 0) ?? null),
    targetFrom: schema.targetTypeIds.length ? null : (ancestors.find(a => a.targetTypeIds.length > 0) ?? null),
    ends,
  };
}
