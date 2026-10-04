import { forceCollide, forceLink, forceManyBody, forceSimulation, forceX, forceY } from 'd3-force';
import { hierarchy, tree } from 'd3-hierarchy';
import { kinshipStructureLink } from '../../domain/kinship';
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

/**
 * Disposición por fuerzas: los nodos conectados se atraen y todos se repelen. Parte de `seed`.
 * Los nodos con posición manual (`fixed`) no se mueven: el resto se acomoda alrededor sin pisarlos.
 */
export function forceLayout(
  p: Project,
  links: Link[],
  seed: Map<string, Position>,
  structureId: string | null = null,
  fixed: Map<string, Position> = new Map(),
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
    const f = fixed.get(n.id);
    const s = f ?? seed.get(n.id);
    return {
      id: n.id,
      typeId: n.typeId,
      x: (s?.x ?? 0) + NODE_W / 2,
      y: (s?.y ?? 0) + NODE_H / 2,
      fx: f ? f.x + NODE_W / 2 : undefined,
      fy: f ? f.y + NODE_H / 2 : undefined,
    };
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
  const result = new Map(nodes.map(n => [n.id, { x: Math.round(n.x - NODE_W / 2), y: Math.round(n.y - NODE_H / 2) }]));
  // Con nodos fijados no se desplaza el conjunto: sus posiciones manuales deben seguir siendo las mismas.
  return fixed.size ? result : normalize(result);
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

/**
 * Estructura que usa la disposición «Genealogía»: la elegida si es de parentesco; si no, el primer
 * tipo de relación genealógico del proyecto. Sin ninguno, la estructura elegida.
 */
export function genealogyStructure(p: Project, structureId: string | null): string | null {
  const genealogical = p.schemas.filter(s => s.kind === 'relationship' && s.genealogical);
  if (genealogical.some(s => s.id === structureId)) return structureId;
  return genealogical[0]?.id ?? structureId;
}

/**
 * Disposición genealógica: cada generación en una fila; las parejas (término «pareja» o progenitores
 * con hijos comunes) van juntas y sus hijos centrados debajo; los hermanos, contiguos. Los nodos sin
 * ningún parentesco (lugares, objetos…) se alinean en una fila aparte, debajo.
 */
export function genealogyLayout(p: Project, structureId: string | null): Map<string, Position> {
  const genealogyId = genealogyStructure(p, structureId);
  const genealogical = p.schemas.some(s => s.id === genealogyId && s.genealogical);
  if (!genealogical) return treeLayout(p, genealogyId, true);
  const ids = new Set(p.nodes.map(n => n.id));
  const terms = new Map(p.kinship.map(t => [t.id, t]));
  const kin = p.relations.filter(r => r.typeId === genealogyId && ids.has(r.sourceId) && ids.has(r.targetId));
  if (!kin.length) return treeLayout(p, genealogyId, true);

  // Vecinos con el salto de generación que impone cada término (+1: el destino está una fila más abajo).
  const neighbors = new Map<string, { other: string; delta: number }[]>();
  const push = (a: string, b: string, delta: number) =>
    neighbors.set(a, [...(neighbors.get(a) ?? []), { other: b, delta }]);
  const parentsOf = new Map<string, string[]>();
  const childrenOf = new Map<string, string[]>();
  const couples: [string, string][] = [];
  const peers = new Map<string, string[]>();
  kin.forEach(r => {
    const t = terms.get(r.kinshipId ?? '');
    const g = t?.generation ?? 0;
    push(r.sourceId, r.targetId, g);
    push(r.targetId, r.sourceId, -g);
    const link = kinshipStructureLink(p, r);
    if (link) {
      parentsOf.set(link.childId, [...(parentsOf.get(link.childId) ?? []), link.parentId]);
      childrenOf.set(link.parentId, [...(childrenOf.get(link.parentId) ?? []), link.childId]);
    } else if (g === 0) {
      if (t?.couple) couples.push([r.sourceId, r.targetId]);
      else {
        peers.set(r.sourceId, [...(peers.get(r.sourceId) ?? []), r.targetId]);
        peers.set(r.targetId, [...(peers.get(r.targetId) ?? []), r.sourceId]);
      }
    }
  });
  // Quienes comparten hijos también forman pareja.
  parentsOf.forEach(ps => {
    for (let i = 0; i < ps.length; i++) for (let j = i + 1; j < ps.length; j++) couples.push([ps[i], ps[j]]);
  });

  const rowGap = NODE_H + 90;
  const coupleGap = 28;
  const unitGap = 70;
  const result = new Map<string, Position>();
  let offsetX = 0;

  // Cada componente conexo se dispone por separado y se coloca a la derecha del anterior.
  const seen = new Set<string>();
  p.nodes.forEach(root => {
    if (seen.has(root.id) || !neighbors.has(root.id)) return;
    // Generación de cada nodo, por anchura desde el primero (los conflictos se resuelven con la primera asignación).
    const gen = new Map<string, number>([[root.id, 0]]);
    const queue = [root.id];
    seen.add(root.id);
    while (queue.length) {
      const id = queue.shift()!;
      (neighbors.get(id) ?? []).forEach(({ other, delta }) => {
        if (gen.has(other)) return;
        gen.set(other, gen.get(id)! + delta);
        seen.add(other);
        queue.push(other);
      });
    }
    const minGen = Math.min(...gen.values());
    const rowOf = (id: string) => gen.get(id)! - minGen;
    const rowCount = Math.max(...gen.values()) - minGen + 1;

    // Unidades por fila: parejas de la misma fila van juntas (unión de parejas encadenadas).
    const unitOf = new Map<string, string>();
    const find = (id: string): string => {
      const parent = unitOf.get(id) ?? id;
      if (parent === id) return id;
      const top = find(parent);
      unitOf.set(id, top);
      return top;
    };
    couples.forEach(([a, b]) => {
      if (gen.has(a) && gen.has(b) && rowOf(a) === rowOf(b)) unitOf.set(find(a), find(b));
    });
    const members = new Map<string, string[]>();
    [...gen.keys()].forEach(id => members.set(find(id), [...(members.get(find(id)) ?? []), id]));
    const rows: string[][] = Array.from({ length: rowCount }, () => []);
    members.forEach((_, unit) => rows[rowOf(unit)].push(unit));

    // Posición x (centro) de cada unidad; el centro de un nodo se deriva de su unidad.
    const unitX = new Map<string, number>();
    const widthOf = (unit: string) => members.get(unit)!.length * NODE_W + (members.get(unit)!.length - 1) * coupleGap;
    const nodeX = (id: string) => {
      const unit = find(id);
      const list = members.get(unit)!;
      const left = (unitX.get(unit) ?? 0) - widthOf(unit) / 2;
      return left + list.indexOf(id) * (NODE_W + coupleGap) + NODE_W / 2;
    };
    const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
    // Punto preferido de una unidad: media de sus parientes en la fila indicada (o de sus iguales en la misma fila).
    const desired = (unit: string, related: (id: string) => string[]) => {
      const list = members.get(unit)!;
      const xs = list.flatMap(id =>
        related(id)
          .filter(o => gen.has(o) && unitX.has(find(o)))
          .map(nodeX),
      );
      if (xs.length) return mean(xs)!;
      const same = list.flatMap(id =>
        (peers.get(id) ?? []).filter(o => gen.has(o) && find(o) !== unit && unitX.has(find(o))).map(nodeX),
      );
      return mean(same) ?? unitX.get(unit) ?? 0;
    };
    // Coloca las unidades de una fila lo más cerca posible de su punto preferido, sin pisarse.
    const place = (units: string[], want: Map<string, number>) => {
      const order = [...units].sort((a, b) => want.get(a)! - want.get(b)!);
      let right = -Infinity;
      const xs: number[] = [];
      order.forEach(unit => {
        const half = widthOf(unit) / 2;
        const x = Math.max(want.get(unit)!, right + unitGap + half);
        xs.push(x);
        right = x + half;
      });
      // El desplazamiento acumulado se reparte: la fila queda centrada sobre lo que pedía.
      const shift = mean(order.map((u, i) => xs[i] - want.get(u)!)) ?? 0;
      order.forEach((unit, i) => unitX.set(unit, xs[i] - shift));
    };
    rows.forEach(units => place(units, new Map(units.map((u, i) => [u, i * (NODE_W + unitGap)]))));
    for (let pass = 0; pass < 4; pass++) {
      for (let r = 1; r < rowCount; r++)
        place(rows[r], new Map(rows[r].map(u => [u, desired(u, id => parentsOf.get(id) ?? [])])));
      for (let r = rowCount - 2; r >= 0; r--)
        place(rows[r], new Map(rows[r].map(u => [u, desired(u, id => childrenOf.get(id) ?? [])])));
    }
    // Última pasada hacia abajo: los hijos quedan centrados bajo sus padres.
    for (let r = 1; r < rowCount; r++)
      place(rows[r], new Map(rows[r].map(u => [u, desired(u, id => parentsOf.get(id) ?? [])])));

    let minX = Infinity;
    let maxX = -Infinity;
    gen.forEach((_, id) => {
      minX = Math.min(minX, nodeX(id) - NODE_W / 2);
      maxX = Math.max(maxX, nodeX(id) + NODE_W / 2);
    });
    gen.forEach((_, id) => result.set(id, { x: offsetX + nodeX(id) - NODE_W / 2 - minX, y: rowOf(id) * rowGap }));
    offsetX += maxX - minX + NODE_W / 2 + unitGap;
  });

  // El resto (lugares, objetos…) se alinea en una fila aparte, debajo.
  let bottom = -Infinity;
  result.forEach(pos => (bottom = Math.max(bottom, pos.y)));
  bottom += NODE_H + 140;
  p.nodes.filter(n => !result.has(n.id)).forEach((n, i) => result.set(n.id, { x: i * (NODE_W + 40), y: bottom }));
  return normalize(result);
}

/** Disposición automática según el modo. `links` son las conexiones visibles (relaciones y jerarquía). */
export function autoLayout(
  p: Project,
  mode: LayoutMode,
  structureId: string | null,
  links: Link[],
  focusId: string | null,
  fixed: Map<string, Position> = new Map(),
) {
  if (mode === 'force') return forceLayout(p, links, treeLayout(p, structureId), structureId, fixed);
  if (mode === 'genealogy') return genealogyLayout(p, structureId);
  if (mode === 'radial' && focusId) return radialLayout(p, focusId, links);
  return treeLayout(p, structureId);
}
