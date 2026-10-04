import { describe, expect, it } from 'vitest';
import { field, node, project, relation, schema } from '../test/fixtures';
import { analysisLinks, betweenness, bridges, degreeCentrality } from './centrality';

// Dos triángulos (a,b,c) y (d,e,f) unidos por el puente c–d.
const links = [
  { a: 'a', b: 'b' },
  { a: 'b', b: 'c' },
  { a: 'c', b: 'a' },
  { a: 'c', b: 'd' },
  { a: 'd', b: 'e' },
  { a: 'e', b: 'f' },
  { a: 'f', b: 'd' },
];

describe('centrality', () => {
  it('counts distinct neighbours', () => {
    const degree = degreeCentrality(links);
    expect(degree.get('c')).toBe(3);
    expect(degree.get('a')).toBe(2);
  });

  it('gives the bridge ends the highest betweenness', () => {
    const score = betweenness(links);
    expect(score.get('c')).toBe(score.get('d'));
    expect(score.get('c')!).toBeGreaterThan(score.get('a')!);
    // c está en todos los caminos de {a,b} a {d,e,f}: 2×3 = 6 pares, más ninguno dentro de su triángulo.
    expect(score.get('c')).toBe(6);
    expect(score.get('a')).toBe(0);
  });

  it('finds articulation nodes and bridge links', () => {
    const result = bridges(links);
    expect(result.nodes.sort()).toEqual(['c', 'd']);
    expect(result.links).toEqual([{ a: 'c', b: 'd' }]);
    expect(bridges([{ a: 'x', b: 'y' }])).toEqual({ nodes: [], links: [{ a: 'x', b: 'y' }] });
  });

  it('builds analysis links from relations, hierarchy and references without duplicates', () => {
    const p = project({
      schemas: [
        schema('per', { fields: [field('ref', { type: 'nodeRef' })] }),
        schema('lugar', { allowedChildTypeIds: ['per'] }),
        schema('ami', {}, 'relationship'),
      ],
      nodes: [node('l', 'lugar'), node('a', 'per', 'l', { ref: 'b' }), node('b', 'per', null, { ref: 'a' })],
      relations: [relation('r1', 'ami', 'a', 'b'), relation('r2', 'ami', 'b', 'a')],
    });
    expect(analysisLinks(p)).toEqual([
      { a: 'a', b: 'b' },
      { a: 'l', b: 'a' },
    ]);
  });
});
