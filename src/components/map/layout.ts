import { forceCollide, forceLink, forceManyBody, forceSimulation, forceX, forceY } from 'd3-force';
import { hierarchy, tree } from 'd3-hierarchy';
import { kinshipGraph, kinshipStructureLink } from '../../domain/kinship';
import { structureChildren, structureLinks } from '../../domain/structure';
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
export function treeLayout(
  p: Project,
  structureId: string | null,
  vertical = false,
  h = NODE_H,
): Map<string, Position> {
  const breadth = vertical ? NODE_W + 40 : h + ROW_GAP;
  const depthGap = vertical ? h + 90 : NODE_W + COL_GAP;
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
  structureId: string | null = null,
  fixed: Map<string, Position> = new Map(),
  h = NODE_H,
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
    return {
      id: n.id,
      typeId: n.typeId,
      x: (f?.x ?? 0) + NODE_W / 2,
      y: (f?.y ?? 0) + h / 2,
      fx: f ? f.x + NODE_W / 2 : undefined,
      fy: f ? f.y + h / 2 : undefined,
      vx: 0,
      vy: 0,
    };
  });
  const ids = new Set(nodes.map(n => n.id));
  const byId = new Map(nodes.map(n => [n.id, n]));
  // Ancla de cada nodo: su superior en la estructura o, si no tiene, el vecino más general al que esté
  // vinculado (un personaje con «Origen: Ahmaru» se agrupa bajo Ahmaru y no entre los de otra ciudad).
  const anchorOf = new Map<string, string>();
  structureLinks(p, structureId).forEach(l => {
    if (!anchorOf.has(l.childId) && ids.has(l.parentId)) anchorOf.set(l.childId, l.parentId);
  });
  const neighbours = new Map<string, string[]>();
  links.forEach(({ a, b }) => {
    if (!ids.has(a) || !ids.has(b) || a === b) return;
    neighbours.set(a, [...(neighbours.get(a) ?? []), b]);
    neighbours.set(b, [...(neighbours.get(b) ?? []), a]);
  });
  const degree = (id: string) => neighbours.get(id)?.length ?? 0;
  const hasChildren = new Set(structureLinks(p, structureId).map(l => l.parentId));
  // Forma parte de la estructura: tiene superior o subordinados en ella.
  const structural = (id: string) => anchorOf.has(id) || hasChildren.has(id);
  nodes.forEach(n => {
    // Solo los nodos sueltos en la estructura buscan ancla; los demás ya tienen su sitio.
    if (structural(n.id)) return;
    const candidates = (neighbours.get(n.id) ?? []).filter(other => anchorOf.get(other) !== n.id);
    if (!candidates.length) return;
    // Preferir un vecino de la estructura y, entre iguales, el más conectado (el «centro» del grupo).
    const best = candidates
      .map(id => ({ id, structural: structural(id) ? 1 : 0, degree: degree(id) }))
      .sort((x, y) => y.structural - x.structural || y.degree - x.degree)[0];
    if (best.structural || best.degree > degree(n.id)) anchorOf.set(n.id, best.id);
  });
  // Separación vertical con el ancla: la misma distancia que pide el vínculo, para que ambas fuerzas coincidan.
  const gap = Math.max(h + 150, NODE_W + 70);
  // Semilla: el bosque de anclas (cada nodo bajo la suya; los sin ancla, como raíces ordenadas por tipo)
  // colocado con un árbol de anchuras reales, de modo que cada grupo arranca con sitio propio y las
  // fuerzas solo relajan. Los nodos fijados conservan su posición manual.
  const childrenOf = new Map<string | null, string[]>();
  nodes
    .slice()
    .sort((a, b) => typeOrder.indexOf(a.typeId) - typeOrder.indexOf(b.typeId))
    .forEach(n => {
      const anchor = anchorOf.get(n.id) ?? null;
      childrenOf.set(anchor, [...(childrenOf.get(anchor) ?? []), n.id]);
    });
  const forest = (id: string | null): TreeDatum => ({ id, children: (childrenOf.get(id) ?? []).map(forest) });
  const laid = tree<TreeDatum>().nodeSize([NODE_W + 40, gap])(hierarchy(forest(null)));
  const seedX = new Map<string, number>();
  laid.each(d => {
    if (!d.data.id) return;
    seedX.set(d.data.id, d.x);
    const n = byId.get(d.data.id);
    if (!n || n.fx !== undefined) return;
    n.x = d.x;
    n.y = (d.depth - 1) * gap;
  });
  // Desplazamiento horizontal respecto al ancla que fijó la semilla: conserva la anchura de cada subárbol.
  const offsetX = (id: string) => (seedX.get(id) ?? 0) - (seedX.get(anchorOf.get(id) ?? '') ?? 0);
  const isAnchorPair = (a: string, b: string) => anchorOf.get(a) === b || anchorOf.get(b) === a;
  // Fuerza de agrupación: cada nodo anclado tiende a colocarse bajo su ancla, cerca de ella.
  const cluster = (alpha: number) => {
    nodes.forEach(n => {
      const anchor = anchorOf.get(n.id) && byId.get(anchorOf.get(n.id)!);
      if (!anchor || n.fx !== undefined) return;
      n.vx += (anchor.x + offsetX(n.id) - n.x) * 0.3 * alpha;
      n.vy += (anchor.y + gap - n.y) * 0.5 * alpha;
    });
  };
  const simulation = forceSimulation(nodes)
    .force(
      'link',
      forceLink(links.filter(l => ids.has(l.a) && ids.has(l.b)).map(l => ({ source: l.a, target: l.b })))
        .id(d => (d as { id: string }).id)
        .distance(NODE_W + 70)
        // Entre un nodo y su ancla la agrupación ya fija la geometría: el vínculo apenas tira.
        .strength(l =>
          isAnchorPair((l.source as unknown as { id: string }).id, (l.target as unknown as { id: string }).id)
            ? 0.05
            : 0.6,
        ),
    )
    .force('charge', forceManyBody().strength(-1400).distanceMax(900))
    // Radio algo mayor que la media diagonal de la tarjeta: las tarjetas son anchas y no deben pisarse.
    .force('collide', forceCollide(NODE_W * 0.62).iterations(3))
    // Los nodos sin ancla se agrupan por tipo y profundidad; los anclados siguen a su ancla.
    .force(
      'x',
      forceX<(typeof nodes)[number]>(d => typeX(d.typeId)).strength(d => (anchorOf.has(d.id) ? 0.01 : 0.08)),
    )
    .force(
      'y',
      forceY<(typeof nodes)[number]>(d => ((depths.get(d.id) ?? maxDepth) - maxDepth / 2) * gap).strength(d =>
        anchorOf.has(d.id) ? 0 : 0.3,
      ),
    )
    .force('cluster', cluster)
    .stop();
  simulation.tick(300);
  const result = new Map(nodes.map(n => [n.id, { x: Math.round(n.x - NODE_W / 2), y: Math.round(n.y - h / 2) }]));
  // Con nodos fijados no se desplaza el conjunto: sus posiciones manuales deben seguir siendo las mismas.
  return fixed.size ? result : normalize(result);
}

/** Disposición radial: anillos por distancia (en saltos) al nodo de foco. */
export function radialLayout(p: Project, focusId: string, links: Link[], h = NODE_H): Map<string, Position> {
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
  const bottom = depth * RING_GAP + h + 80;
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
export function genealogyLayout(p: Project, structureId: string | null, h = NODE_H): Map<string, Position> {
  const genealogyId = genealogyStructure(p, structureId);
  const genealogical = p.schemas.some(s => s.id === genealogyId && s.genealogical);
  if (!genealogyId || !genealogical) return treeLayout(p, genealogyId, true, h);
  const graph = kinshipGraph(p, genealogyId);
  if (!graph.components.length) return treeLayout(p, genealogyId, true, h);
  const { parentsOf, childrenOf, couples, peers } = graph;

  const rowGap = h + 120;
  const coupleGap = 96;
  const unitGap = 70;
  const result = new Map<string, Position>();
  let offsetX = 0;

  // Cada componente conexo se dispone por separado y se coloca a la derecha del anterior.
  graph.components.forEach(componentIds => {
    const gen = new Map(componentIds.map(id => [id, graph.gen.get(id)!]));
    const rowOf = (id: string) => gen.get(id)!;
    const rowCount = Math.max(...gen.values()) + 1;

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
  bottom += h + 140;
  p.nodes.filter(n => !result.has(n.id)).forEach((n, i) => result.set(n.id, { x: i * (NODE_W + 40), y: bottom }));
  return normalize(result);
}

/**
 * Familias de la estructura genealógica: cada conjunto de progenitores con sus hijos comunes, y las
 * parejas (término «pareja») aunque no tengan hijos. Sirve para dibujar los conectores de familia.
 */
export function familyUnits(p: Project, genealogyId: string | null): { parents: string[]; children: string[] }[] {
  const terms = new Map(p.kinship.map(t => [t.id, t]));
  const kin = p.relations.filter(r => r.typeId === genealogyId);
  const parentsOf = new Map<string, Set<string>>();
  kin.forEach(r => {
    const link = kinshipStructureLink(p, r);
    if (link) parentsOf.set(link.childId, new Set([...(parentsOf.get(link.childId) ?? []), link.parentId]));
  });
  const units = new Map<string, { parents: string[]; children: string[] }>();
  const unitFor = (parents: string[]) => {
    const key = [...parents].sort().join('|');
    if (!units.has(key)) units.set(key, { parents: [...parents].sort(), children: [] });
    return units.get(key)!;
  };
  kin.forEach(r => {
    if (terms.get(r.kinshipId ?? '')?.couple && r.sourceId !== r.targetId) unitFor([r.sourceId, r.targetId]);
  });
  // El orden de los hijos sigue el de los nodos del proyecto (estable).
  p.nodes.forEach(n => {
    const parents = parentsOf.get(n.id);
    if (parents) unitFor([...parents]).children.push(n.id);
  });
  return [...units.values()];
}

/**
 * Disposición «Mapa»: los nodos colocados a mano se quedan donde están; los demás esperan en una
 * bandeja en filas bajo la imagen (o en el origen si no hay imagen), listos para arrastrarlos.
 */
export function trayLayout(p: Project, fixed: Map<string, Position>, imageHeight: number, h = NODE_H) {
  const result = new Map<string, Position>();
  const pending = p.nodes.filter(n => !fixed.has(n.id));
  const perRow = 6;
  pending.forEach((n, i) => {
    result.set(n.id, {
      x: (i % perRow) * (NODE_W + 24),
      y: imageHeight + 60 + Math.floor(i / perRow) * (h + 24),
    });
  });
  return result;
}

/** Disposición automática según el modo. `links` son las conexiones visibles (relaciones y jerarquía). */
export function autoLayout(
  p: Project,
  mode: LayoutMode,
  structureId: string | null,
  links: Link[],
  focusId: string | null,
  fixed: Map<string, Position> = new Map(),
  h = NODE_H,
) {
  if (mode === 'image') return trayLayout(p, fixed, (p.mapImage?.height ?? 0) * (p.mapImage?.scale ?? 1), h);
  if (mode === 'force') return forceLayout(p, links, structureId, fixed, h);
  if (mode === 'genealogy') return genealogyLayout(p, structureId, h);
  if (mode === 'radial' && focusId) return radialLayout(p, focusId, links, h);
  return treeLayout(p, structureId, false, h);
}
