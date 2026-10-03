import { describe, expect, it } from 'vitest';
import { node, project, relation, schema } from '../../test/fixtures';
import { forceLayout, NODE_W, radialLayout, treeLayout } from './layout';

const world = () =>
  project({
    schemas: [schema('t'), schema('vive', { structural: true, parentEnd: 'target' }, 'relationship')],
    nodes: [
      node('reino', 't'),
      node('ciudad', 't', 'reino'),
      node('a', 't', 'ciudad'),
      node('b', 't', 'ciudad'),
      node('suelto', 't'),
    ],
    relations: [relation('r1', 'vive', 'a', 'reino'), relation('r2', 'vive', 'b', 'reino')],
  });

describe('disposiciones', () => {
  it('la jerárquica coloca cada nivel en una columna y nunca pierde nodos', () => {
    const pos = treeLayout(world(), null);
    expect(pos.size).toBe(5);
    expect(pos.get('reino')!.x).toBe(0);
    expect(pos.get('ciudad')!.x).toBeGreaterThan(NODE_W);
    expect(pos.get('a')!.x).toBe(pos.get('b')!.x);
    expect(pos.get('a')!.y).not.toBe(pos.get('b')!.y);
  });

  it('con una relación estructural los nodos cuelgan del extremo superior', () => {
    const pos = treeLayout(world(), 'vive');
    expect(pos.get('a')!.x).toBeGreaterThan(pos.get('reino')!.x);
    expect(pos.get('ciudad')!.x).toBe(0);
  });

  it('un ciclo en la jerarquía no cuelga el cálculo ni pierde nodos', () => {
    const p = project({ schemas: [schema('t')], nodes: [node('x', 't', 'y'), node('y', 't', 'x')] });
    expect(treeLayout(p, null).size).toBe(2);
  });

  it('la de fuerzas es determinista y separa los nodos', () => {
    const p = world();
    const links = p.relations.map(r => ({ a: r.sourceId, b: r.targetId }));
    const one = forceLayout(p, links, treeLayout(p, null));
    const two = forceLayout(p, links, treeLayout(p, null));
    expect([...one.entries()]).toEqual([...two.entries()]);
    const points = [...one.values()];
    points.forEach((a, i) =>
      points.slice(i + 1).forEach(b => expect(Math.hypot(a.x - b.x, a.y - b.y)).toBeGreaterThan(NODE_W * 0.8)),
    );
  });

  it('la radial pone el foco en el centro y los no conectados debajo', () => {
    const p = world();
    const links = p.relations.map(r => ({ a: r.sourceId, b: r.targetId }));
    const pos = radialLayout(p, 'reino', links);
    const reino = pos.get('reino')!;
    const ya = pos.get('a')!;
    expect(Math.hypot(ya.x - reino.x, ya.y - reino.y)).toBeGreaterThan(200);
    expect(pos.get('suelto')!.y).toBeGreaterThan(reino.y);
  });
});

describe('genealogía', () => {
  it('la disposición vertical pone cada generación en una fila', () => {
    const pos = treeLayout(world(), null, true);
    expect(pos.get('reino')!.y).toBe(0);
    expect(pos.get('ciudad')!.y).toBeGreaterThan(pos.get('reino')!.y);
    expect(pos.get('a')!.y).toBe(pos.get('b')!.y);
    expect(pos.get('a')!.x).not.toBe(pos.get('b')!.x);
  });
});
