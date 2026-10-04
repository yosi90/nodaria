import { describe, expect, it } from 'vitest';
import { field, node, project, relation, schema } from '../test/fixtures';
import { redundancyPairs } from './redundancy';

const p = project({
  schemas: [
    schema('per', {
      fields: [
        field('nombre', { isTitle: true }),
        field('raza', { type: 'select' }),
        field('oficio'),
        field('rasgos', { type: 'tags' }),
        field('retrato', { type: 'image' }),
      ],
    }),
    schema('lugar', { allowedChildTypeIds: ['per'] }),
    schema('ami', {}, 'relationship'),
  ],
  nodes: [
    node('vael', 'lugar'),
    node('sol', 'lugar'),
    // Gemelos: mismos atributos, mismo padre y mismos vecinos (el título y el retrato no cuentan).
    node('a', 'per', 'vael', {
      nombre: 'Aria',
      raza: 'Elfa',
      oficio: 'maga',
      rasgos: ['terca', 'valiente'],
      retrato: 'x',
    }),
    node('b', 'per', 'vael', {
      nombre: 'Bren',
      raza: 'elfa',
      oficio: 'Maga',
      rasgos: ['valiente', 'terca'],
      retrato: 'y',
    }),
    // Distinto en casi todo.
    node('c', 'per', 'sol', { nombre: 'Cato', raza: 'Enano', oficio: 'herrero' }),
    // Pocas señales: no se evalúa.
    node('d', 'per', null, { nombre: 'Dragga' }),
    node('e', 'per', null, { nombre: 'Elan' }),
    node('x', 'per', null, { nombre: 'Xul' }),
  ],
  relations: [relation('r1', 'ami', 'a', 'x'), relation('r2', 'ami', 'b', 'x'), relation('r3', 'ami', 'a', 'b')],
});

describe('redundancyPairs', () => {
  it('flags twins and ignores the pair relation between them, the title and images', () => {
    const pairs = redundancyPairs(p);
    expect(pairs.map(r => [r.a.id, r.b.id])).toEqual([['a', 'b']]);
    const [pair] = pairs;
    expect(pair.score).toBe(1);
    expect(pair.sharedFields.map(f => f.id)).toEqual(['raza', 'oficio', 'rasgos']);
    expect(pair.differingFields).toEqual([]);
    // Vecinos: x y el padre vael (la jerarquía cuenta como vínculo), compartidos; a–b no cuenta.
    expect(pair.sharedNeighbours).toBe(2);
    expect(pair.totalNeighbours).toBe(2);
  });

  it('respects the threshold', () => {
    expect(redundancyPairs(p, 0.3).map(r => [r.a.id, r.b.id])).toContainEqual(['a', 'b']);
    expect(redundancyPairs(p, 0.3).some(r => r.a.id === 'd')).toBe(false);
  });
});
