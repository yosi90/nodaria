import { forceCollide, forceLink, forceManyBody, forceSimulation, forceX, forceY } from 'd3-force';
import { hierarchy, tree } from 'd3-hierarchy';
import { structureChildren } from '../../domain/structure';
import type { LayoutMode, Position, Project } from '../../domain/types';

/*
 * Disposiciones automáticas del lienzo. Devuelven la esquina superior izquierda de cada nodo.
 * Son deterministas: con el mismo proyecto producen el mismo resultado.
 */

export const NODE_W = 200;
export const NODE_H = 58;
const COL_GAP = 110;
const ROW_GAP = 34;
const RING_GAP = 240;

export interface Link {
  a: string;
  b: string;
}

interface TreeDatum {
  id: string | null;
  children?: TreeDatum[];
}

/**
 * Árbol de la estructura con cada nodo una sola vez: un nodo con varios superiores cuelga del
 * primero que lo alcanza en orden de profundidad, y los ciclos se cortan.
 */
function structureTree(p: Project, structureId: string | null): TreeDatum {
  const children = structureChildren(p, structureId);
  const placed = new Set<string>();
  const build = (id: string | null): TreeDatum[] =>
    (children.get(id) ?? [])
      .filter(n => !placed.has(n.id) && placed.add(n.id))
      .map(n => ({ id: n.id, children: build(n.id) }));
  const roots = build(null);
  // Nodos que solo son alcanzables dentro de un ciclo: se añaden como raíces para no perderlos.
  p.nodes
    .filter(n => !placed.has(n.id))
    .forEach(n => {
      placed.add(n.id);
      roots.push({ id: n.id, children: build(n.id) });
    });
  return { id: null, children: roots };
}

/**
 * Disposición jerárquica según la estructura indicada: de izquierda a derecha, o de arriba abajo
 * (`vertical`, útil para genealogías: cada generación en una fila).
 */
export function treeLayout(p: Project, structureId: string | null, vertical = false): Map<string, Position> {
  const breadth = vertical ? NODE_W + 40 : NODE_H + ROW_GAP;
  const depthGap = vertical ? NODE_H + 90 : NODE_W + COL_GAP;
  const root = tree<TreeDatum>().nodeSize([breadth, depthGap])(hierarchy(structureTree(p, structureId)));
  const result = new Map<string, Position>();
  let min = Infinity;
  root.each(n => {
    if (n.data.id) min = Math.min(min, n.x);
  });
  root.each(n => {
    if (!n.data.id) return;
    const along = n.x - (min === Infinity ? 0 : min);
    const deep = (n.depth - 1) * depthGap;
    result.set(n.data.id, vertical ? { x: along, y: deep } : { x: deep, y: along });
  });
  return result;
}

/** Profundidad de cada nodo en la estructura (raíces = 0), cortando ciclos. */
function structureDepths(p: Project, structureId: string | null): Map<string, number> {
  const children = structureChildren(p, structureId);
  const depths = new Map<string, number>();
  const walk = (id: string | null, depth: number, path: Set<string>) => {
    (children.get(id) ?? []).forEach(n => {
      if (path.has(n.id)) return;
      if (!depths.has(n.id) || depths.get(n.id)! < depth) depths.set(n.id, depth);
      walk(n.id, depth + 1, new Set([...path, n.id]));
    });
  };
  walk(null, 0, new Set());
  return depths;
}

/** Disposición por fuerzas: los nodos conectados se atraen y todos se repelen. Parte de `seed`. */
export function forceLayout(
  p: Project,
  links: Link[],
  seed: Map<string, Position>,
  structureId: string | null = null,
): Map<string, Position> {
  // Profundidad en la estructura: los nodos más generales (raíces) arriba y, en cascada, sus dependientes.
  const depths = structureDepths(p, structureId);
  const maxDepth = Math.max(0, ...depths.values());
  // Tipos ordenados por su profundidad media, para agrupar horizontalmente los del mismo tipo.
  const typeDepth = new Map<string, number[]>();
  p.nodes.forEach(n => typeDepth.set(n.typeId, [...(typeDepth.get(n.typeId) ?? []), depths.get(n.id) ?? 0]));
  const typeOrder = [...typeDepth.entries()]
    .map(([typeId, ds]) => ({ typeId, mean: ds.reduce((a, b) => a + b, 0) / ds.length }))
    .sort((a, b) => a.mean - b.mean)
    .map(t => t.typeId);
  const typeX = (typeId: string) => (typeOrder.indexOf(typeId) - (typeOrder.length - 1) / 2) * (NODE_W + 160);
  const nodes = p.nodes.map(n => {
    const s = seed.get(n.id);
    return { id: n.id, typeId: n.typeId, x: (s?.x ?? 0) + NODE_W / 2, y: (s?.y ?? 0) + NODE_H / 2 };
  });
  const ids = new Set(nodes.map(n => n.id));
  const simulation = forceSimulation(nodes)
    .force(
      'link',
      forceLink(links.filter(l => ids.has(l.a) && ids.has(l.b)).map(l => ({ source: l.a, target: l.b })))
        .id(d => (d as { id: string }).id)
        .distance(NODE_W + 70)
        .strength(0.6),
    )
    .force('charge', forceManyBody().strength(-1400).distanceMax(900))
    // Radio algo mayor que la media diagonal de la tarjeta: las tarjetas son anchas y no deben pisarse.
    .force('collide', forceCollide(NODE_W * 0.62).iterations(3))
    .force('x', forceX<(typeof nodes)[number]>(d => typeX(d.typeId)).strength(0.08))
    .force(
      'y',
      forceY<(typeof nodes)[number]>(d => ((depths.get(d.id) ?? maxDepth) - maxDepth / 2) * (NODE_H + 150)).strength(
        0.3,
      ),
    )
    .stop();
  simulation.tick(300);
  return normalize(new Map(nodes.map(n => [n.id, { x: n.x - NODE_W / 2, y: n.y - NODE_H / 2 }])));
}

/** Disposición radial: anillos por distancia (en saltos) al nodo de foco. */
export function radialLayout(p: Project, focusId: string, links: Link[]): Map<string, Position> {
  const adjacency = new Map<string, string[]>();
  links.forEach(({ a, b }) => {
    adjacency.set(a, [...(adjacency.get(a) ?? []), b]);
    adjacency.set(b, [...(adjacency.get(b) ?? []), a]);
  });
  const ids = new Set(p.nodes.map(n => n.id));
  const start = ids.has(focusId) ? focusId : p.nodes[0]?.id;
  if (!start) return new Map();
  const visited = new Set([start]);
  const build = (id: string): TreeDatum => ({
    id,
    children: (adjacency.get(id) ?? []).filter(n => ids.has(n) && !visited.has(n) && visited.add(n)).map(build),
  });
  const unlaid = hierarchy(build(start));
  const depth = unlaid.height || 1;
  const root = tree<TreeDatum>()
    .size([2 * Math.PI, depth * RING_GAP])
    .separation((a, b) => (a.parent === b.parent ? 1 : 2) / Math.max(1, a.depth))(unlaid);
  const result = new Map<string, Position>();
  root.each(n => {
    if (!n.data.id) return;
    const radius = n.depth * RING_GAP;
    result.set(n.data.id, { x: Math.cos(n.x - Math.PI / 2) * radius, y: Math.sin(n.x - Math.PI / 2) * radius });
  });
  // Los nodos no conectados con el foco se alinean debajo de los anillos.
  const unreached = p.nodes.filter(n => !result.has(n.id));
  const bottom = depth * RING_GAP + NODE_H + 80;
  unreached.forEach((n, i) => result.set(n.id, { x: (i - (unreached.length - 1) / 2) * (NODE_W + 40), y: bottom }));
  return normalize(result);
}

function normalize(positions: Map<string, Position>) {
  let minX = Infinity;
  let minY = Infinity;
  positions.forEach(pos => {
    minX = Math.min(minX, pos.x);
    minY = Math.min(minY, pos.y);
  });
  if (!Number.isFinite(minX)) return positions;
  positions.forEach((pos, id) => positions.set(id, { x: Math.round(pos.x - minX), y: Math.round(pos.y - minY) }));
  return positions;
}

/** Disposición automática según el modo. `links` son las conexiones visibles (relaciones y jerarquía). */
export function autoLayout(
  p: Project,
  mode: LayoutMode,
  structureId: string | null,
  links: Link[],
  focusId: string | null,
) {
  if (mode === 'force') return forceLayout(p, links, treeLayout(p, structureId), structureId);
  if (mode === 'genealogy') return treeLayout(p, structureId, true);
  if (mode === 'radial' && focusId) return radialLayout(p, focusId, links);
  return treeLayout(p, structureId);
}
