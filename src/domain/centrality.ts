import type { PathLink } from './paths';
import { referenceLinks } from './references';
import type { Project } from './types';

/*
 * Centralidad y puentes del grafo del proyecto. Los vínculos cuentan sin sentido y sin repetir:
 * relaciones, jerarquía «Dentro de» y referencias (las menciones en notas no).
 */

/** Vínculos del proyecto para el análisis, sin duplicados ni bucles. */
export function analysisLinks(p: Project): PathLink[] {
  const seen = new Set<string>();
  const result: PathLink[] = [];
  const add = (a: string, b: string) => {
    if (a === b) return;
    const key = a < b ? `${a}|${b}` : `${b}|${a}`;
    if (seen.has(key)) return;
    seen.add(key);
    result.push({ a, b });
  };
  const ids = new Set(p.nodes.map(n => n.id));
  p.relations.forEach(r => ids.has(r.sourceId) && ids.has(r.targetId) && add(r.sourceId, r.targetId));
  p.nodes.forEach(n => n.parentId && ids.has(n.parentId) && add(n.parentId, n.id));
  referenceLinks(p).forEach(l => add(l.sourceId, l.targetId));
  return result;
}

function adjacencyOf(links: PathLink[]) {
  const adjacency = new Map<string, Set<string>>();
  const touch = (id: string) => adjacency.get(id) ?? adjacency.set(id, new Set()).get(id)!;
  links.forEach(({ a, b }) => {
    if (a === b) return;
    touch(a).add(b);
    touch(b).add(a);
  });
  return adjacency;
}

/** Número de vecinos distintos de cada nodo. */
export function degreeCentrality(links: PathLink[]): Map<string, number> {
  return new Map([...adjacencyOf(links)].map(([id, set]) => [id, set.size]));
}

/**
 * Intermediación (Brandes): cuántos caminos más cortos entre pares pasan por cada nodo. Un nodo con
 * pocas conexiones puede tener mucha si une grupos que de otro modo estarían separados.
 */
export function betweenness(links: PathLink[]): Map<string, number> {
  const adjacency = adjacencyOf(links);
  const nodes = [...adjacency.keys()];
  const score = new Map(nodes.map(id => [id, 0]));
  for (const source of nodes) {
    const stack: string[] = [];
    const predecessors = new Map<string, string[]>(nodes.map(id => [id, []]));
    const sigma = new Map(nodes.map(id => [id, 0]));
    const distance = new Map(nodes.map(id => [id, -1]));
    sigma.set(source, 1);
    distance.set(source, 0);
    const queue = [source];
    while (queue.length) {
      const v = queue.shift()!;
      stack.push(v);
      for (const w of adjacency.get(v) ?? []) {
        if (distance.get(w)! < 0) {
          queue.push(w);
          distance.set(w, distance.get(v)! + 1);
        }
        if (distance.get(w) === distance.get(v)! + 1) {
          sigma.set(w, sigma.get(w)! + sigma.get(v)!);
          predecessors.get(w)!.push(v);
        }
      }
    }
    const delta = new Map(nodes.map(id => [id, 0]));
    while (stack.length) {
      const w = stack.pop()!;
      for (const v of predecessors.get(w)!) {
        delta.set(v, delta.get(v)! + (sigma.get(v)! / sigma.get(w)!) * (1 + delta.get(w)!));
      }
      if (w !== source) score.set(w, score.get(w)! + delta.get(w)!);
    }
  }
  // Grafo no dirigido: cada par se ha contado dos veces.
  score.forEach((value, id) => score.set(id, value / 2));
  return score;
}

export interface Bridges {
  /** Nodos cuya desaparición separaría el grafo en partes (puntos de articulación). */
  nodes: string[];
  /** Vínculos cuya desaparición separaría el grafo. */
  links: PathLink[];
}

/** Puentes del grafo (Tarjan): nodos y vínculos que mantienen unidos grupos que de otro modo quedarían sueltos. */
export function bridges(links: PathLink[]): Bridges {
  const adjacency = adjacencyOf(links);
  const discovered = new Map<string, number>();
  const low = new Map<string, number>();
  const articulation = new Set<string>();
  const bridgeLinks: PathLink[] = [];
  let time = 0;
  const visit = (u: string, parent: string | null) => {
    discovered.set(u, time);
    low.set(u, time);
    time++;
    let children = 0;
    for (const v of adjacency.get(u) ?? []) {
      if (v === parent) continue;
      if (!discovered.has(v)) {
        children++;
        visit(v, u);
        low.set(u, Math.min(low.get(u)!, low.get(v)!));
        if (low.get(v)! > discovered.get(u)!) bridgeLinks.push({ a: u, b: v });
        if (parent !== null && low.get(v)! >= discovered.get(u)!) articulation.add(u);
      } else {
        low.set(u, Math.min(low.get(u)!, discovered.get(v)!));
      }
    }
    if (parent === null && children > 1) articulation.add(u);
  };
  for (const id of adjacency.keys()) if (!discovered.has(id)) visit(id, null);
  return { nodes: [...articulation], links: bridgeLinks };
}
