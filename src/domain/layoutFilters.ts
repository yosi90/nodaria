import { relationEnds } from './constraints';
import { typeMatches } from './selectors';
import type { LayoutFilters, LayoutMode, Project, ProjectView } from './types';

/*
 * Cada disposición del lienzo tiene sus propios filtros (entidades, relaciones y referencias ocultas).
 * Los de la disposición activa viven en `view.hiddenEntityTypeIds`, `view.hiddenRelationTypeIds` y
 * `view.hiddenReferenceFieldIds`; los de las demás se guardan en `view.layoutFilters[modo]` y se
 * intercambian al cambiar de disposición. Todo forma parte del proyecto: se sincroniza y no depende
 * del navegador.
 */

export const activeFilters = (view: ProjectView): LayoutFilters => ({
  hiddenEntityTypeIds: view.hiddenEntityTypeIds,
  hiddenRelationTypeIds: view.hiddenRelationTypeIds,
  hiddenReferenceFieldIds: view.hiddenReferenceFieldIds,
});

const genealogySchemas = (p: Project) => p.schemas.filter(s => s.kind === 'relationship' && s.genealogical);

/**
 * Filtros iniciales de una disposición que nunca se ha visitado. Genealogía oculta los tipos de
 * entidad que ningún parentesco admite; las demás parten de los filtros actuales y, al salir de
 * Genealogía por primera vez, vuelven a mostrar todo salvo el parentesco (extenso e intrincado).
 */
export function defaultFilters(p: Project, mode: LayoutMode): LayoutFilters {
  const kinship = genealogySchemas(p);
  const current = activeFilters(p.view);
  if (mode === 'genealogy') {
    const admitted = kinship.flatMap(s => {
      const ends = relationEnds(p, s);
      return [...ends.source, ...ends.target];
    });
    return {
      hiddenEntityTypeIds: p.schemas
        .filter(s => s.kind === 'entity' && !s.isAbstract && !typeMatches(p, s.id, admitted))
        .map(s => s.id),
      hiddenRelationTypeIds: current.hiddenRelationTypeIds,
      hiddenReferenceFieldIds: current.hiddenReferenceFieldIds,
    };
  }
  const base =
    p.view.layout === 'genealogy'
      ? { hiddenEntityTypeIds: [], hiddenRelationTypeIds: [], hiddenReferenceFieldIds: [] }
      : current;
  return {
    ...base,
    hiddenRelationTypeIds: [...new Set([...base.hiddenRelationTypeIds, ...kinship.map(s => s.id)])],
  };
}

/** Cambios de la vista al pasar a otra disposición: guarda los filtros actuales y aplica los de la nueva. */
export function viewForLayout(p: Project, mode: LayoutMode): Partial<ProjectView> {
  const { view } = p;
  if (mode === view.layout) return {};
  const layoutFilters = { ...view.layoutFilters, [view.layout]: activeFilters(view) };
  const next = layoutFilters[mode] ?? defaultFilters(p, mode);
  return { layout: mode, ...next, layoutFilters };
}
