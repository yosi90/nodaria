import { describe, expect, it } from 'vitest';
import { bendFor, borderPoint, relationPath, routeRelation, type Box } from './edgeGeometry';

const box = (x: number, y: number): Box => ({ x, y, width: 200, height: 60 });

describe('geometría de relaciones', () => {
  it('borderPoint cae en el borde en la dirección pedida', () => {
    expect(borderPoint(box(0, 0), { x: 100, y: 500 })).toEqual({ x: 100, y: 60 });
    expect(borderPoint(box(0, 0), { x: 900, y: 30 })).toEqual({ x: 200, y: 30 });
  });

  it('entre nodos apilados, la línea va del borde inferior del de arriba al superior del de abajo', () => {
    const { start, end } = relationPath(box(0, 0), box(0, 100), 0);
    expect(start).toEqual({ x: 100, y: 60 });
    expect(end).toEqual({ x: 100, y: 100 });
  });

  it('los extremos nunca quedan dentro de las tarjetas', () => {
    const a = box(0, 0);
    const b = box(0, 300);
    const { start, end } = relationPath(a, b, 40);
    const inside = (p: { x: number; y: number }, r: Box) =>
      p.x > r.x + 0.01 && p.x < r.x + r.width - 0.01 && p.y > r.y + 0.01 && p.y < r.y + r.height - 0.01;
    expect(inside(start, a)).toBe(false);
    expect(inside(end, b)).toBe(false);
  });

  it('las relaciones paralelas se reparten a ambos lados', () => {
    expect(bendFor(0, 2, 100)).toBe(-bendFor(1, 2, 100));
    expect(bendFor(1, 3, 100)).toBe(0);
    expect(bendFor(0, 1, 1000)).toBe(48);
  });
});

describe('esquivar tarjetas', () => {
  it('una relación entre nodos alineados con otros en medio se curva hasta no atravesarlos', () => {
    const a = box(0, 0);
    const middle = [box(0, 100), box(0, 200)];
    const b = box(0, 300);
    const path = routeRelation(a, b, bendFor(0, 1, 300), [a, ...middle, b], a, b);
    // El punto medio de la curva queda fuera de las tarjetas intermedias.
    expect(path.labelPos.x < 0 || path.labelPos.x > 200).toBe(true);
    expect(path.anchor).not.toBe('middle');
  });

  it('sin obstáculos conserva la curvatura base', () => {
    const a = box(0, 0);
    const b = box(400, 0);
    const path = routeRelation(a, b, 0, [a, b], a, b);
    expect(path.d).toBe(relationPath(a, b, 0).d);
  });
});
