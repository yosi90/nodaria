import { describe, expect, it } from 'vitest';
import { field, node, project, relation, schema } from '../test/fixtures';
import { typeStats } from './stats';

const p = project({
  schemas: [
    schema('per', {
      name: 'Personaje',
      fields: [
        field('nombre', { isTitle: true }),
        field('raza', { type: 'select', options: ['Elfo', 'Enano'] }),
        field('rasgos', { type: 'tags' }),
        field('vivo', { type: 'boolean' }),
        field('edad', { type: 'number' }),
      ],
    }),
    schema('lugar', { name: 'Lugar' }),
    schema('abstracto', { name: 'Ser', isAbstract: true }),
    schema('ami', {}, 'relationship'),
  ],
  nodes: [
    node('a', 'per', null, { raza: 'Elfo', rasgos: ['terco', 'valiente'], vivo: true, edad: 30 }),
    node('b', 'per', null, { raza: 'Elfo', rasgos: ['valiente'], vivo: false }),
    node('c', 'per', null, { raza: 'Enano' }),
    node('v', 'lugar'),
  ],
  relations: [relation('r1', 'ami', 'a', 'b'), relation('r2', 'ami', 'a', 'c')],
});

describe('typeStats', () => {
  it('counts nodes and relations per concrete type with instances', () => {
    const stats = typeStats(p);
    expect(stats.map(t => [t.schema.id, t.nodes, t.averageRelations, t.withoutRelations])).toEqual([
      ['per', 3, 4 / 3, 0],
      ['lugar', 1, 0, 1],
    ]);
  });

  it('distributes list-like values, counting empties, and skips numbers and texts', () => {
    const [per] = typeStats(p);
    expect(per.distributions.map(d => d.field.id)).toEqual(['raza', 'rasgos', 'vivo']);
    const [raza, rasgos, vivo] = per.distributions;
    expect(raza.values).toEqual([
      { value: 'Elfo', count: 2 },
      { value: 'Enano', count: 1 },
    ]);
    expect(rasgos.values).toEqual([
      { value: 'valiente', count: 2 },
      { value: 'terco', count: 1 },
    ]);
    expect(rasgos.empty).toBe(1);
    // Un sí/no sin valor cuenta como «No».
    expect(vivo.values).toEqual([
      { value: 'No', count: 2 },
      { value: 'Sí', count: 1 },
    ]);
  });
});
