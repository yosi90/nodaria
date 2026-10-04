import type { PathLink } from './paths';

/*
 * Comunidades: grupos de nodos más conectados entre sí que con el resto (método de Louvain,
 * modularidad sobre vínculos sin peso ni sentido). Determinista: los nodos se recorren en orden
 * estable. Devuelve las comunidades ordenadas de mayor a menor, con sus miembros ordenados por id.
 */

export interface Community {
  /** Índice estable (0 = la mayor). */
  index: number;
  members: string[];
}

function adjacencyOf(links: PathLink[]) {
  const adjacency = new Map<string, Map<string, number>>();
  const touch = (id: string) => adjacency.get(id) ?? adjacency.set(id, new Map()).get(id)!;
  links.forEach(({ a, b }) => {
    if (a === b) return;
    touch(a).set(b, (touch(a).get(b) ?? 0) + 1);
    touch(b).set(a, (touch(b).get(a) ?? 0) + 1);
  });
  return adjacency;
}

/** Una pasada de Louvain sobre un grafo ponderado: devuelve la comunidad de cada nodo. */
function louvainLevel(adjacency: Map<string, Map<string, number>>): Map<string, string> {
  const nodes = [...adjacency.keys()].sort();
  const degree = new Map(nodes.map(id => [id, [...adjacency.get(id)!.values()].reduce((s, w) => s + w, 0)]));
  const m2 = [...degree.values()].reduce((s, d) => s + d, 0); // 2m
  if (m2 === 0) return new Map(nodes.map(id => [id, id]));
  const community = new Map(nodes.map(id => [id, id]));
  const total = new Map(nodes.map(id => [id, degree.get(id)!])); // suma de grados por comunidad

  let improved = true;
  for (let round = 0; improved && round < 50; round++) {
    improved = false;
    for (const id of nodes) {
      const current = community.get(id)!;
      const k = degree.get(id)!;
      // Peso hacia cada comunidad vecina.
      const weights = new Map<string, number>();
      adjacency.get(id)!.forEach((w, other) => {
        if (other === id) return; // el peso interno (bucle) no cuenta como vecindad
        const c = community.get(other)!;
        weights.set(c, (weights.get(c) ?? 0) + w);
      });
      total.set(current, total.get(current)! - k);
      let best = current;
      let bestGain = (weights.get(current) ?? 0) - (total.get(current)! * k) / m2;
      [...weights.keys()].sort().forEach(c => {
        const gain = (weights.get(c) ?? 0) - (total.get(c)! * k) / m2;
        if (gain > bestGain + 1e-12) {
          bestGain = gain;
          best = c;
        }
      });
      total.set(best, total.get(best)! + k);
      if (best !== current) {
        community.set(id, best);
        improved = true;
      }
    }
  }
  return community;
}

export function detectCommunities(links: PathLink[]): Community[] {
  let adjacency = adjacencyOf(links);
  // Cada nodo original apunta a su comunidad actual (etiqueta del nivel en curso).
  let membership = new Map([...adjacency.keys()].map(id => [id, id]));
  for (let level = 0; level < 10; level++) {
    const assignment = louvainLevel(adjacency);
    const distinct = new Set(assignment.values());
    if (distinct.size === adjacency.size) break;
    membership = new Map([...membership].map(([id, label]) => [id, assignment.get(label)!]));
    // Agregar: cada comunidad pasa a ser un nodo; los pesos se suman.
    const next = new Map<string, Map<string, number>>();
    const touch = (id: string) => next.get(id) ?? next.set(id, new Map()).get(id)!;
    adjacency.forEach((edges, a) => {
      const ca = assignment.get(a)!;
      touch(ca);
      edges.forEach((w, b) => {
        // Los vínculos internos quedan como bucle del supernodo: su grado los conserva.
        const cb = assignment.get(b)!;
        touch(ca).set(cb, (touch(ca).get(cb) ?? 0) + w);
      });
    });
    adjacency = next;
  }
  const groups = new Map<string, string[]>();
  membership.forEach((label, id) => groups.set(label, [...(groups.get(label) ?? []), id]));
  return [...groups.values()]
    .map(members => members.sort())
    .sort((x, y) => y.length - x.length || x[0].localeCompare(y[0]))
    .map((members, index) => ({ index, members }));
}

/** Comunidad de cada nodo (índice), para colorear. Los nodos sin vínculos no aparecen. */
export function communityIndex(links: PathLink[]): Map<string, number> {
  const result = new Map<string, number>();
  detectCommunities(links).forEach(c => c.members.forEach(id => result.set(id, c.index)));
  return result;
}
