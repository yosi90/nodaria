import { allFields } from './selectors';
import type { Node, Project } from './types';

/*
 * Filtro por etiquetas de la leyenda del mapa (PENDIENTES.md, sección 4): con alguna etiqueta marcada en
 * `view.tagFilter`, el lienzo solo muestra los nodos que llevan al menos una de ellas en cualquier
 * atributo de tipo «Etiquetas». Sin ninguna marcada, no filtra.
 */

/** Etiquetas de un nodo, de todos sus atributos de tipo «Etiquetas», sin repetir. */
export function nodeTags(p: Project, node: Node): string[] {
  const tags = new Set<string>();
  for (const field of allFields(p, node.typeId)) {
    const value = node.values[field.id];
    if (field.type === 'tags' && Array.isArray(value)) value.forEach(tag => tags.add(String(tag)));
  }
  return [...tags];
}

/** Etiquetas usadas en el proyecto con cuántos nodos las llevan, de la más usada a la menos. */
export function projectTags(p: Project): { tag: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const node of p.nodes) for (const tag of nodeTags(p, node)) counts.set(tag, (counts.get(tag) ?? 0) + 1);
  return [...counts]
    .map(([tag, count]) => ({ tag, count }))
    .sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag, 'es'));
}

/** Si el nodo pasa el filtro de etiquetas de la vista. */
export function passesTagFilter(p: Project, node: Node, tagFilter: string[]): boolean {
  if (!tagFilter.length) return true;
  return nodeTags(p, node).some(tag => tagFilter.includes(tag));
}
