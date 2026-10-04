import type { Position } from '../../domain/types';

/** Posición de una tarjeta con su altura (las tarjetas con líneas de atributos son más altas). */
export type Placed = Position & { h?: number };
const heightOf = (p: Placed) => p.h ?? NODE_H;
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

/** Parentesco que no forma familia (hermanos sin progenitores comunes, tíos, padrinos…). */
export interface KinLink {
  key: string;
  a: string;
  b: string;
  label: string;
  /** No cuadra con las generaciones del árbol: se resalta para revisarlo. */
  conflict?: boolean;
}

/**
 * Trazo ortogonal entre dos parientes: en la misma fila, un puente por encima de las tarjetas; en filas
 * distintas, bajada del superior, tramo horizontal en el hueco entre filas y bajada hasta el inferior.
 * Devuelve el trazo y el punto donde va la etiqueta.
 */
export function kinPath(a: Placed, b: Placed): { d: string; label: { x: number; y: number } } | null {
  if (Math.abs(a.y - b.y) < 1) {
    const [l, rt] = a.x < b.x ? [a, b] : [b, a];
    const lx = l.x + NODE_W / 2;
    const rx = rt.x + NODE_W / 2;
    if (rx - lx < 2) return null;
    const top = l.y;
    const y = top - 26;
    const r = Math.min(R, (rx - lx) / 2);
    return {
      d: `M${lx},${top} L${lx},${y + r} Q${lx},${y} ${lx + r},${y} L${rx - r},${y} Q${rx},${y} ${rx},${y + r} L${rx},${top}`,
      label: { x: (lx + rx) / 2, y: y - 5 },
    };
  }
  const [u, d] = a.y < b.y ? [a, b] : [b, a];
  const ux = u.x + NODE_W / 2;
  const uy = u.y + heightOf(u);
  const dx = d.x + NODE_W / 2;
  const dy = d.y;
  const busY = uy + 32;
  if (Math.abs(ux - dx) < 2) return { d: `M${ux},${uy} L${dx},${dy}`, label: { x: ux + 6, y: busY } };
  const dir = dx > ux ? 1 : -1;
  const r = Math.min(R, Math.abs(dx - ux) / 2, busY - uy, Math.max(1, dy - busY));
  return {
    d: `M${ux},${uy} L${ux},${busY - r} Q${ux},${busY} ${ux + dir * r},${busY} L${dx - dir * r},${busY} Q${dx},${busY} ${dx},${busY + r} L${dx},${dy}`,
    label: { x: (ux + dx) / 2, y: busY - 5 },
  };
}

/** Dibuja una familia: devuelve los trazos SVG (`d`). */
export function familyPaths(unit: FamilyUnit, positions: Map<string, Placed>): string[] {
  const parents = unit.parents.map(id => positions.get(id)).filter((p): p is Placed => Boolean(p));
  const children = unit.children.map(id => positions.get(id)).filter((p): p is Placed => Boolean(p));
  if (!parents.length) return [];
  const paths: string[] = [];
  // Puntos desde los que baja la línea de los progenitores.
  const starts: { x: number; y: number }[] = [];
  const [l, rt] = [...parents].sort((a, b) => a.x - b.x);
  if (parents.length === 2 && Math.abs(l.y - rt.y) < 1 && rt.x - l.x > NODE_W) {
    // Pareja contigua: barra entre ambos y bajada desde su centro.
    const y = l.y + Math.min(heightOf(l), heightOf(rt)) / 2;
    paths.push(`M${l.x + NODE_W},${y} L${rt.x},${y}`);
    starts.push({ x: (l.x + NODE_W + rt.x) / 2, y });
  } else parents.forEach(p => starts.push({ x: p.x + NODE_W / 2, y: p.y + heightOf(p) }));
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
