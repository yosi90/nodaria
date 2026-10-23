import { describe, expect, it } from 'vitest';
import type { Box } from './edgeGeometry';
import { avoidingRoute, crossesAny } from './fkRouter';
import { TABLE_W, tableHeight } from './tableCard';

const table = (x: number, y: number, rows = 4): Box => ({ x, y, width: TABLE_W, height: tableHeight(rows) });
/** Los puntos de una ruta («M x y L x y Q …»), sin los de control de las esquinas. */
const pointsOf = (d: string) => {
  const numbers = d.match(/-?\d+(\.\d+)?/g)!.map(Number);
  const out: { x: number; y: number }[] = [];
  for (let i = 0; i < numbers.length; i += 2) out.push({ x: numbers[i], y: numbers[i + 1] });
  return out;
};
/** La tarjeta sin el borde, para que tocar su lado (donde salen y entran las líneas) no cuente. */
const inner = (b: Box): Box => ({ x: b.x + 1, y: b.y + 1, width: b.width - 2, height: b.height - 2 });

describe('rutas que esquivan las tablas', () => {
  it('rodea una tabla que está en medio', () => {
    const a = table(0, 0);
    const b = table(800, 0);
    const middle = table(400, -40, 8);
    const route = avoidingRoute(a, b, 1, 0, 0, [a, b, middle])!;
    expect(route).not.toBeNull();
    expect(crossesAny(pointsOf(route.d), [middle].map(inner))).toBe(false);
    expect(route.many).toMatchObject({ x: TABLE_W, dir: 1 });
    expect(route.one).toMatchObject({ x: 800, dir: -1 });
  });

  it('sin nada en medio, es la de siempre: sale por la derecha y entra por la izquierda', () => {
    const a = table(0, 0);
    const b = table(600, 200);
    const route = avoidingRoute(a, b, 0, 0, 0, [a, b])!;
    expect(route.many.dir).toBe(1);
    expect(route.one.dir).toBe(-1);
    // Tres tramos: salir, bajar y entrar (dos codos).
    expect(route.d.match(/Q/g)).toHaveLength(2);
  });

  it('no atraviesa ninguna tarjeta en un diagrama lleno, y va rápido', () => {
    const boxes: Box[] = [];
    for (let i = 0; i < 6; i++) for (let j = 0; j < 7; j++) boxes.push(table(i * 360, j * 220, 5));
    const started = performance.now();
    let routed = 0;
    for (let k = 0; k < 40; k++) {
      const a = boxes[k];
      const b = boxes[(k * 17 + 11) % boxes.length];
      if (a === b) continue;
      const route = avoidingRoute(a, b, 1, 0, 0, boxes);
      if (!route) continue;
      routed++;
      expect(crossesAny(pointsOf(route.d), boxes.map(inner))).toBe(false);
    }
    expect(routed).toBeGreaterThan(30);
    expect((performance.now() - started) / 40).toBeLessThan(40);
  });

  it('una autorreferencia sale y entra por el mismo lado', () => {
    const a = table(0, 0, 6);
    const route = avoidingRoute(a, a, 4, 0, 0, [a])!;
    expect(route.many.dir).toBe(route.one.dir);
    expect(crossesAny(pointsOf(route.d), [inner(a)])).toBe(false);
  });
});
