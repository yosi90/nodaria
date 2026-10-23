import type { Box } from './edgeGeometry';
import { roundedPath, rowY, type ForeignKeyRoute } from './tableCard';

/*
 * Rutas de las claves foráneas que esquivan las tablas (ROADMAP_DIAGRAMAS_BD.md, «Pendiente»). La línea sigue
 * saliendo del lateral de la fila de la columna y entrando por el de la clave primaria, siempre en ángulo
 * recto, pero rodea las tarjetas que encuentra en medio en vez de atravesarlas.
 *
 * Es una búsqueda A* sobre una rejilla dispersa: las coordenadas son los bordes de las tarjetas (con un
 * margen) y las de los extremos, así que hay pocos puntos y los tramos entre dos vecinos o están del todo
 * fuera de una tarjeta o del todo dentro. Cada giro cuesta como una distancia extra, para que salgan líneas
 * con pocos codos. Se prueban los cuatro pares de lados (salir por la izquierda o la derecha, entrar por la
 * izquierda o la derecha) y se queda la ruta más barata. Si no hay ruta (todo tapado), `null`: quien llama
 * usa la de siempre.
 */

type Point = { x: number; y: number };

/** Separación de la línea respecto a las tarjetas que rodea. */
const MARGIN = 12;
/** Lo que sale la línea del lateral antes de girar; cada carril, un poco más, para que no se monten. */
const STUB = 20;
const LANE_GAP = 8;
/** Lo que cuesta un giro, en píxeles de recorrido. */
const BEND = 40;
/** Solo cuentan las tarjetas cerca de las dos tablas: hasta aquí alrededor de ellas. */
const WINDOW = 360;
/** Rejillas más grandes se dejan con la ruta de siempre (no compensa el tiempo). */
const MAX_POINTS = 40000;

// Direcciones: 0 → +x, 1 → −x, 2 → +y, 3 → −y.
const DX = [1, -1, 0, 0];
const DY = [0, 0, 1, -1];
const opposite = (d: number) => d ^ 1;

class Heap {
  private items: { key: number; state: number }[] = [];
  get size() {
    return this.items.length;
  }
  push(key: number, state: number) {
    const items = this.items;
    items.push({ key, state });
    let i = items.length - 1;
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (items[parent].key <= items[i].key) break;
      [items[parent], items[i]] = [items[i], items[parent]];
      i = parent;
    }
  }
  pop() {
    const items = this.items;
    const top = items[0];
    const last = items.pop()!;
    if (items.length) {
      items[0] = last;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1;
        const r = l + 1;
        let m = i;
        if (l < items.length && items[l].key < items[m].key) m = l;
        if (r < items.length && items[r].key < items[m].key) m = r;
        if (m === i) break;
        [items[m], items[i]] = [items[i], items[m]];
        i = m;
      }
    }
    return top;
  }
}

const unique = (values: number[]) => [...new Set(values.map(v => Math.round(v * 2) / 2))].sort((a, b) => a - b);

interface Search {
  cost: number;
  points: Point[];
}

/**
 * La ruta más barata de `start` a `end` sin entrar en las tarjetas (ya con su margen). `startDir` es hacia
 * dónde sale (no puede volver atrás) y `endDir`, hacia dónde entra en la tabla destino.
 */
function search(start: Point, startDir: number, end: Point, endDir: number, obstacles: Box[]): Search | null {
  const xs = unique([start.x, end.x, ...obstacles.flatMap(o => [o.x - MARGIN, o.x + o.width + MARGIN])]);
  const ys = unique([start.y, end.y, ...obstacles.flatMap(o => [o.y - MARGIN, o.y + o.height + MARGIN])]);
  if (xs.length * ys.length > MAX_POINTS) return null;
  const inside = (x: number, y: number) =>
    obstacles.some(
      o => x > o.x - MARGIN && x < o.x + o.width + MARGIN && y > o.y - MARGIN && y < o.y + o.height + MARGIN,
    );
  const ny = ys.length;
  const index = (i: number, j: number) => i * ny + j;
  const si = xs.indexOf(Math.round(start.x * 2) / 2);
  const sj = ys.indexOf(Math.round(start.y * 2) / 2);
  const ei = xs.indexOf(Math.round(end.x * 2) / 2);
  const ej = ys.indexOf(Math.round(end.y * 2) / 2);
  if (inside(start.x, start.y) || inside(end.x, end.y)) return null;

  const best = new Map<number, number>();
  const previous = new Map<number, number>();
  const heap = new Heap();
  const heuristic = (i: number, j: number) => Math.abs(xs[i] - end.x) + Math.abs(ys[j] - end.y);
  const startState = index(si, sj) * 4 + startDir;
  best.set(startState, 0);
  heap.push(heuristic(si, sj), startState);
  while (heap.size) {
    const { state } = heap.pop();
    const cost = best.get(state)!;
    const dir = state % 4;
    const cell = (state - dir) / 4;
    const i = Math.floor(cell / ny);
    const j = cell % ny;
    if (i === ei && j === ej) {
      // Llega: si no viene ya en la dirección de entrada, le falta un giro.
      if (dir === opposite(endDir)) continue;
      const total = cost + (dir === endDir ? 0 : BEND);
      const points: Point[] = [];
      for (let s: number | undefined = state; s !== undefined; s = previous.get(s)) {
        const c = (s - (s % 4)) / 4;
        points.push({ x: xs[Math.floor(c / ny)], y: ys[c % ny] });
      }
      return { cost: total, points: points.reverse() };
    }
    for (let d = 0; d < 4; d++) {
      if (d === opposite(dir)) continue;
      const ni = i + DX[d];
      const nj = j + DY[d];
      if (ni < 0 || nj < 0 || ni >= xs.length || nj >= ny) continue;
      const midX = (xs[i] + xs[ni]) / 2;
      const midY = (ys[j] + ys[nj]) / 2;
      if (inside(xs[ni], ys[nj]) || inside(midX, midY)) continue;
      const step = Math.abs(xs[ni] - xs[i]) + Math.abs(ys[nj] - ys[j]) + (d === dir ? 0 : BEND);
      const next = index(ni, nj) * 4 + d;
      const nextCost = cost + step;
      if (nextCost >= (best.get(next) ?? Infinity)) continue;
      best.set(next, nextCost);
      previous.set(next, state);
      heap.push(nextCost + heuristic(ni, nj), next);
    }
  }
  return null;
}

/** Quita los puntos que no son codos (los que están en línea con el anterior y el siguiente). */
function corners(points: Point[]) {
  return points.filter((p, k) => {
    const prev = points[k - 1];
    const next = points[k + 1];
    if (!prev || !next) return true;
    return !((prev.x === p.x && p.x === next.x) || (prev.y === p.y && p.y === next.y));
  });
}

const overlaps = (a: Box, b: Box) =>
  a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;

/**
 * Ruta de una clave foránea de `a` (fila `sourceRow`) a `b` (fila `targetRow`) que rodea `obstacles` (todas
 * las tarjetas del lienzo, también `a` y `b`). `null` si no se encuentra.
 */
export function avoidingRoute(
  a: Box,
  b: Box,
  sourceRow: number,
  targetRow: number,
  lane: number,
  obstacles: Box[],
): ForeignKeyRoute | null {
  const sy = rowY(a, sourceRow);
  const ty = rowY(b, targetRow);
  const stub = STUB + Math.abs(lane) * LANE_GAP;
  const area: Box = {
    x: Math.min(a.x, b.x) - WINDOW,
    y: Math.min(a.y, b.y) - WINDOW,
    width: Math.max(a.x + a.width, b.x + b.width) - Math.min(a.x, b.x) + 2 * WINDOW,
    height: Math.max(a.y + a.height, b.y + b.height) - Math.min(a.y, b.y) + 2 * WINDOW,
  };
  const near = obstacles.filter(o => overlaps(o, area));
  let best: (Search & { sDir: 1 | -1; tDir: 1 | -1 }) | null = null;
  for (const sDir of [1, -1] as const) {
    for (const tDir of [1, -1] as const) {
      const side = { x: sDir === 1 ? a.x + a.width : a.x, y: sy };
      const entry = { x: tDir === 1 ? b.x + b.width : b.x, y: ty };
      const start = { x: side.x + sDir * stub, y: sy };
      const end = { x: entry.x + tDir * stub, y: ty };
      // Sale hacia fuera de `a`; entra en `b` moviéndose hacia ella (al revés de su lado).
      const found = search(start, sDir === 1 ? 0 : 1, end, tDir === 1 ? 1 : 0, near);
      if (!found) continue;
      const points = corners([side, ...found.points, entry]);
      const result = { cost: found.cost, points, sDir, tDir };
      if (!best || result.cost < best.cost) best = result;
    }
  }
  if (!best) return null;
  const start = best.points[0];
  const end = best.points[best.points.length - 1];
  return {
    d: roundedPath(best.points),
    many: { x: start.x, y: start.y, dir: best.sDir },
    one: { x: end.x, y: end.y, dir: best.tDir },
  };
}

/** Si un tramo horizontal o vertical de la ruta pasa por dentro de alguna tarjeta (para las pruebas). */
export function crossesAny(points: Point[], obstacles: Box[]) {
  return points.slice(1).some((p, k) => {
    const q = points[k];
    return obstacles.some(o => {
      const minX = Math.min(p.x, q.x);
      const maxX = Math.max(p.x, q.x);
      const minY = Math.min(p.y, q.y);
      const maxY = Math.max(p.y, q.y);
      return minX < o.x + o.width && maxX > o.x && minY < o.y + o.height && maxY > o.y;
    });
  });
}
