/*
 * Camino más corto entre dos nodos sobre los vínculos visibles del lienzo (relaciones, jerarquía y
 * referencias), sin tener en cuenta el sentido. Responde a «¿cómo se conecta A con B?».
 */

export interface PathLink {
  a: string;
  b: string;
}

/** Ids del camino más corto de `from` a `to` (ambos incluidos), o `null` si no hay. */
export function shortestPath(links: PathLink[], from: string, to: string): string[] | null {
  if (from === to) return [from];
  const adjacency = new Map<string, string[]>();
  links.forEach(({ a, b }) => {
    if (a === b) return;
    adjacency.set(a, [...(adjacency.get(a) ?? []), b]);
    adjacency.set(b, [...(adjacency.get(b) ?? []), a]);
  });
  const previous = new Map<string, string | null>([[from, null]]);
  const queue = [from];
  while (queue.length) {
    const current = queue.shift()!;
    for (const next of adjacency.get(current) ?? []) {
      if (previous.has(next)) continue;
      previous.set(next, current);
      if (next === to) {
        const path = [to];
        let step: string | null = current;
        while (step !== null) {
          path.unshift(step);
          step = previous.get(step) ?? null;
        }
        return path;
      }
      queue.push(next);
    }
  }
  return null;
}

/** Pares consecutivos de un camino, en ambos sentidos, para reconocer sus aristas. */
export function pathPairs(path: string[]): Set<string> {
  const pairs = new Set<string>();
  for (let i = 1; i < path.length; i++) {
    pairs.add(`${path[i - 1]}|${path[i]}`);
    pairs.add(`${path[i]}|${path[i - 1]}`);
  }
  return pairs;
}
