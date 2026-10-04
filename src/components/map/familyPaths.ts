import type { Position } from '../../domain/types';
import { NODE_H, NODE_W } from './layout';

/** Una familia: conjunto de progenitores con sus hijos comunes. */
export interface FamilyUnit {
  parents: string[];
  children: string[];
}

const R = 12;

/** Trazo vertical de `from` a `to` en `x`, con esquina redondeada hacia `turn` (+1 derecha, −1 izquierda) al llegar a `to`. */
function drop(x: number, from: number, to: number, turn: 0 | 1 | -1) {
  if (!turn || Math.abs(to - from) < R + 1) return `M${x},${from} L${x},${to}`;
  const dir = to > from ? 1 : -1;
  return `M${x},${from} L${x},${to - dir * R} Q${x},${to} ${x + turn * R},${to}`;
}

/** Dibuja una familia: devuelve los trazos SVG (`d`). */
export function familyPaths(unit: FamilyUnit, positions: Map<string, Position>): string[] {
  const parents = unit.parents.map(id => positions.get(id)).filter((p): p is Position => Boolean(p));
  const children = unit.children.map(id => positions.get(id)).filter((p): p is Position => Boolean(p));
  if (!parents.length) return [];
  const paths: string[] = [];
  // Puntos desde los que baja la línea de los progenitores.
  const starts: { x: number; y: number }[] = [];
  const [l, rt] = [...parents].sort((a, b) => a.x - b.x);
  if (parents.length === 2 && Math.abs(l.y - rt.y) < 1 && rt.x - l.x > NODE_W) {
    // Pareja contigua: barra entre ambos y bajada desde su centro.
    const y = l.y + NODE_H / 2;
    paths.push(`M${l.x + NODE_W},${y} L${rt.x},${y}`);
    starts.push({ x: (l.x + NODE_W + rt.x) / 2, y });
  } else parents.forEach(p => starts.push({ x: p.x + NODE_W / 2, y: p.y + NODE_H }));
  if (!children.length) return paths;

  const ends = children.map(c => ({ x: c.x + NODE_W / 2, y: c.y }));
  const top = Math.max(...starts.map(s => s.y));
  const bottom = Math.min(...ends.map(e => e.y));
  const busY = bottom > top ? (top + bottom) / 2 : top + 40;
  const xs = [...starts, ...ends].map(p => p.x);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  if (maxX - minX < 2) {
    // Una sola vertical: progenitor justo encima del hijo.
    starts.forEach(s => ends.forEach(e => paths.push(`M${s.x},${s.y} L${e.x},${e.y}`)));
    return paths;
  }
  // En los extremos del bus, si solo llega una línea, la esquina se redondea; si llegan dos (una de
  // arriba y otra de abajo), se cruzan en recto.
  const count = (x: number) => xs.filter(v => Math.abs(v - x) < 1).length;
  const turnAt = (x: number): 0 | 1 | -1 =>
    count(x) > 1 ? 0 : Math.abs(x - minX) < 1 ? 1 : Math.abs(x - maxX) < 1 ? -1 : 0;
  const r = Math.min(R, (maxX - minX) / 2);
  const left = count(minX) > 1 ? minX : minX + r;
  const right = count(maxX) > 1 ? maxX : maxX - r;
  paths.push(`M${left},${busY} L${right},${busY}`);
  starts.forEach(s => paths.push(drop(s.x, s.y, busY, turnAt(s.x))));
  ends.forEach(e => paths.push(drop(e.x, e.y, busY, turnAt(e.x))));
  return paths;
}
