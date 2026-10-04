/** Geometría de las líneas de relación entre tarjetas rectangulares del lienzo. */

export interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface Point {
  x: number;
  y: number;
}

const center = (b: Box): Point => ({ x: b.x + b.width / 2, y: b.y + b.height / 2 });

/** Punto del borde de `box` en la dirección que va de su centro hacia `toward`. */
export function borderPoint(box: Box, toward: Point): Point {
  const c = center(box);
  const dx = toward.x - c.x;
  const dy = toward.y - c.y;
  if (!dx && !dy) return c;
  const scale = Math.min(dx ? box.width / 2 / Math.abs(dx) : Infinity, dy ? box.height / 2 / Math.abs(dy) : Infinity);
  return { x: c.x + dx * scale, y: c.y + dy * scale };
}

/** Lado de una tarjeta por el que sale o entra una línea. */
export type Side = 'left' | 'right' | 'top' | 'bottom';

/**
 * Lados que se enfrentan entre dos tarjetas: si la otra queda sobre todo a un lado, por los
 * laterales; si queda sobre todo arriba o abajo, por arriba y abajo. Regla fija y previsible.
 */
export function facingSides(a: Box, b: Box): [Side, Side] {
  const ca = center(a);
  const cb = center(b);
  const dx = cb.x - ca.x;
  const dy = cb.y - ca.y;
  if (Math.abs(dx) >= Math.abs(dy)) return dx >= 0 ? ['right', 'left'] : ['left', 'right'];
  return dy >= 0 ? ['bottom', 'top'] : ['top', 'bottom'];
}

/** Punto de un lado de la tarjeta, desplazado `offset` a lo largo de ese lado desde su centro. */
export function sidePoint(box: Box, side: Side, offset = 0): Point {
  const c = center(box);
  if (side === 'left') return { x: box.x, y: c.y + offset };
  if (side === 'right') return { x: box.x + box.width, y: c.y + offset };
  if (side === 'top') return { x: c.x + offset, y: box.y };
  return { x: c.x + offset, y: box.y + box.height };
}

const outward = (side: Side): Point =>
  side === 'left'
    ? { x: -1, y: 0 }
    : side === 'right'
      ? { x: 1, y: 0 }
      : side === 'top'
        ? { x: 0, y: -1 }
        : { x: 0, y: 1 };

export interface Route {
  d: string;
  start: Point;
  end: Point;
  labelPos: Point;
  /** Punto de la curva en t ∈ [0, 1]. */
  pointAt: (t: number) => Point;
}

/**
 * Curva en S entre dos lados: sale perpendicular al lado de origen y entra perpendicular al de
 * destino. Es la ruta preferida; solo si atraviesa tarjetas se recurre a `routeRelation`.
 */
export function sideRoute(a: Box, b: Box, sideA: Side, sideB: Side, offsetA = 0, offsetB = 0): Route {
  const start = sidePoint(a, sideA, offsetA);
  const end = sidePoint(b, sideB, offsetB);
  const oa = outward(sideA);
  const ob = outward(sideB);
  const span = oa.x ? Math.abs(end.x - start.x) : Math.abs(end.y - start.y);
  const k = Math.max(40, Math.min(160, span * 0.5));
  const c1 = { x: start.x + oa.x * k, y: start.y + oa.y * k };
  const c2 = { x: end.x + ob.x * k, y: end.y + ob.y * k };
  const pointAt = (t: number): Point => {
    const u = 1 - t;
    return {
      x: u * u * u * start.x + 3 * u * u * t * c1.x + 3 * u * t * t * c2.x + t * t * t * end.x,
      y: u * u * u * start.y + 3 * u * u * t * c1.y + 3 * u * t * t * c2.y + t * t * t * end.y,
    };
  };
  return {
    d: `M${start.x},${start.y} C${c1.x},${c1.y} ${c2.x},${c2.y} ${end.x},${end.y}`,
    start,
    end,
    labelPos: pointAt(0.5),
    pointAt,
  };
}

/** Indica si una curva (muestreada) atraviesa alguna tarjeta. */
export function crossesBoxes(pointAt: (t: number) => Point, obstacles: Box[]) {
  for (let i = 1; i < SAMPLES; i++) {
    const { x, y } = pointAt(i / SAMPLES);
    if (
      obstacles.some(
        o =>
          x > o.x - CLEARANCE && x < o.x + o.width + CLEARANCE && y > o.y - CLEARANCE && y < o.y + o.height + CLEARANCE,
      )
    )
      return true;
  }
  return false;
}

/** Separación entre relaciones paralelas del mismo par de nodos. */
export const PARALLEL_GAP = 34;

/**
 * Curva cuadrática de `a` a `b`. `bend` desplaza el punto de control en perpendicular a la
 * recta entre centros, siempre respecto a `normalFrom` → `normalTo`, para que las relaciones
 * paralelas se abran hacia lados opuestos sea cual sea su sentido.
 */
export function relationPath(a: Box, b: Box, bend: number, normalFrom: Box = a, normalTo: Box = b) {
  const ca = center(a);
  const cb = center(b);
  const na = center(normalFrom);
  const nb = center(normalTo);
  const length = Math.hypot(nb.x - na.x, nb.y - na.y) || 1;
  const normal = { x: -(nb.y - na.y) / length, y: (nb.x - na.x) / length };
  const control = { x: (ca.x + cb.x) / 2 + normal.x * bend, y: (ca.y + cb.y) / 2 + normal.y * bend };
  const start = borderPoint(a, control);
  const end = borderPoint(b, control);
  // Punto medio de la curva (t = 0,5), donde se coloca la etiqueta.
  const labelPos = { x: (start.x + 2 * control.x + end.x) / 4, y: (start.y + 2 * control.y + end.y) / 4 };
  const pointAt = (t: number): Point => {
    const u = 1 - t;
    return {
      x: u * u * start.x + 2 * u * t * control.x + t * t * end.x,
      y: u * u * start.y + 2 * u * t * control.y + t * t * end.y,
    };
  };
  return {
    d: `M${start.x},${start.y} Q${control.x},${control.y} ${end.x},${end.y}`,
    start,
    control,
    end,
    labelPos,
    pointAt,
  };
}

/**
 * Curvatura de cada relación: una sola entre dos nodos va casi recta (con una ligera curva
 * proporcional a la distancia para no ocultarse tras nodos alineados); varias se abren en abanico.
 */
export function bendFor(index: number, count: number, distance: number) {
  if (count <= 1) return Math.min(48, distance * 0.12);
  return (index - (count - 1) / 2) * PARALLEL_GAP;
}

const SAMPLES = 16;
const CLEARANCE = 6;

/** Indica si la curva atraviesa alguna tarjeta (los extremos ya quedan fuera por construcción). */
function crosses(start: Point, control: Point, end: Point, obstacles: Box[]) {
  for (let i = 1; i < SAMPLES; i++) {
    const t = i / SAMPLES;
    const u = 1 - t;
    const x = u * u * start.x + 2 * u * t * control.x + t * t * end.x;
    const y = u * u * start.y + 2 * u * t * control.y + t * t * end.y;
    if (
      obstacles.some(
        o =>
          x > o.x - CLEARANCE && x < o.x + o.width + CLEARANCE && y > o.y - CLEARANCE && y < o.y + o.height + CLEARANCE,
      )
    )
      return true;
  }
  return false;
}

const BEND_STEP = 45;
const MAX_STEPS = 7;

/**
 * Como `relationPath`, pero si la curva atraviesa otras tarjetas prueba curvaturas mayores,
 * alternando lados y empezando por el de `baseBend`, hasta encontrar una que las esquive.
 * Devuelve también hacia qué lado queda la etiqueta respecto de la línea.
 */
export function routeRelation(a: Box, b: Box, baseBend: number, obstacles: Box[], normalFrom: Box, normalTo: Box) {
  const minX = Math.min(a.x, b.x) - BEND_STEP * MAX_STEPS;
  const maxX = Math.max(a.x + a.width, b.x + b.width) + BEND_STEP * MAX_STEPS;
  const minY = Math.min(a.y, b.y) - BEND_STEP * MAX_STEPS;
  const maxY = Math.max(a.y + a.height, b.y + b.height) + BEND_STEP * MAX_STEPS;
  const nearby = obstacles.filter(
    o => o !== a && o !== b && o.x < maxX && o.x + o.width > minX && o.y < maxY && o.y + o.height > minY,
  );
  const side = baseBend < 0 ? -1 : 1;
  const candidates = [baseBend];
  for (let k = 1; k <= MAX_STEPS; k++)
    candidates.push(baseBend + side * k * BEND_STEP, baseBend - side * k * BEND_STEP);
  let chosen = relationPath(a, b, baseBend, normalFrom, normalTo);
  for (const bend of candidates) {
    const path = relationPath(a, b, bend, normalFrom, normalTo);
    if (!crosses(path.start, path.control, path.end, nearby)) {
      chosen = path;
      break;
    }
  }
  // La etiqueta se aparta hacia el lado al que se curva la línea, para no taparla.
  const chordMid = { x: (chosen.start.x + chosen.end.x) / 2, y: (chosen.start.y + chosen.end.y) / 2 };
  const offsetX = chosen.labelPos.x - chordMid.x;
  const anchor: 'start' | 'end' | 'middle' = offsetX > 2 ? 'start' : offsetX < -2 ? 'end' : 'middle';
  return { ...chosen, anchor };
}
