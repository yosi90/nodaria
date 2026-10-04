import { describe, expect, it } from 'vitest';
import { field, node, project, relation, schema } from '../test/fixtures';
import { isIncomplete, worldHealth } from './health';

const p = project({
  schemas: [
    schema('per', {
      name: 'Personaje',
      fields: [
        field('nombre', { isTitle: true, required: true }),
        field('edad', { type: 'number', required: true }),
        field('dios', { type: 'nodeRef', referenceTypeIds: ['dios'] }),
      ],
    }),
    schema('dios', { name: 'Deidad', fields: [field('dn', { isTitle: true })] }),
    schema('lugar', { name: 'Lugar' }),
    schema('abstracto', { name: 'Ser', isAbstract: true }),
    schema('venera', { name: 'Venera', directed: true, maxPerSource: 1 }, 'relationship'),
    schema('odia', { name: 'Odia' }, 'relationship'),
  ],
  nodes: [
    node('sol', 'dios', null, { dn: 'Solenne' }),
    // Completa, conectada, referencia válida.
    node('aria', 'per', null, { nombre: 'Aria', edad: 30, dios: 'sol' }),
    // Sin edad, referencia a un nodo que no existe y mención sin destino.
    { ...node('bren', 'per', null, { nombre: 'Bren', dios: 'nadie' }), notes: 'Amigo de [[Aria]] y de [[Nadie]].' },
    // Referencia a un tipo no admitido (un personaje como dios).
    node('cato', 'per', null, { nombre: 'Cato', edad: 20, dios: 'aria' }),
    // Aislado.
    node('solo', 'per', null, { nombre: 'Solo', edad: 1 }),
  ],
  relations: [
    relation('r1', 'venera', 'aria', 'sol'),
    relation('r2', 'venera', 'aria', 'sol'),
    relation('r3', 'venera', 'cato', 'sol'),
  ],
});

describe('worldHealth', () => {
  const report = worldHealth(p);

  it('finds isolated nodes, counting references and mentions as connections', () => {
    expect(report.isolated.map(n => n.id)).toEqual(['solo']);
  });

  it('lists incomplete sheets with their missing required fields', () => {
    expect(report.incomplete.map(s => [s.node.id, s.missing.map(f => f.id)])).toEqual([['bren', ['edad']]]);
    expect(isIncomplete(p, p.nodes[1])).toBe(false);
  });

  it('lists unused concrete types, entity and relation alike', () => {
    expect(report.unusedTypes.map(s => s.id)).toEqual(['lugar', 'odia']);
  });

  it('reports cardinality, broken references and unresolved mentions', () => {
    expect(report.cardinality.map(i => [i.node.id, i.count, i.max])).toEqual([['aria', 2, 1]]);
    expect(report.brokenReferences.map(b => [b.node.id, b.targetId, b.reason])).toEqual([
      ['bren', 'nadie', 'missing'],
      ['cato', 'aria', 'type'],
    ]);
    expect(report.unresolvedMentions.map(m => [m.node.id, m.name])).toEqual([['bren', 'Nadie']]);
    expect(report.total).toBe(1 + 1 + 2 + 1 + 2 + 1);
  });
});
