import { describe, expect, it } from 'vitest';
import { cardinalityIssues, cardinalityWarning, describeIssue } from './cardinality';
import { field, node, project, relation, schema } from '../test/fixtures';

const p = project({
  schemas: [
    schema('per', { name: 'Personaje', fields: [field('nombre', { isTitle: true })] }),
    schema('dios', { name: 'Deidad' }),
    // Dirigida: cada personaje venera como mucho a un dios; un dios no tiene límite de fieles.
    schema('venera', { name: 'Dios patrón', directed: true, maxPerSource: 1, maxPerTarget: null }, 'relationship'),
    // Sin sentido: como mucho dos parejas por nodo.
    schema('pareja', { name: 'Pareja', directed: false, maxPerSource: 2 }, 'relationship'),
    schema('amistad', { name: 'Amistad' }, 'relationship'),
  ],
  nodes: [
    node('a', 'per', null, { nombre: 'a' }),
    node('b', 'per', null, { nombre: 'b' }),
    node('c', 'per', null, { nombre: 'c' }),
    node('sol', 'dios'),
    node('luna', 'dios'),
  ],
  relations: [
    relation('r1', 'venera', 'a', 'sol'),
    relation('r2', 'venera', 'a', 'luna'),
    relation('r3', 'venera', 'b', 'sol'),
    relation('r4', 'pareja', 'a', 'b'),
    relation('r5', 'pareja', 'c', 'a'),
    relation('r6', 'amistad', 'a', 'b'),
  ],
});

describe('cardinality', () => {
  it('reports nodes over a limit, per end, for the whole project or one node', () => {
    const issues = cardinalityIssues(p);
    expect(issues.map(i => [i.node.id, i.schema.id, i.end, i.count, i.max])).toEqual([['a', 'venera', 'source', 2, 1]]);
    expect(describeIssue(p, issues[0])).toBe('a tiene 2 relaciones «Dios patrón» como origen; el máximo es 1.');
    expect(cardinalityIssues(p, 'b')).toEqual([]);
  });

  it('warns before creating a relation that would exceed a limit', () => {
    expect(cardinalityWarning(p, 'venera', 'b', 'luna')).toBe(
      'b ya tiene 1 relación «Dios patrón» como origen; el máximo es 1.',
    );
    expect(cardinalityWarning(p, 'venera', 'c', 'sol')).toBeNull();
    // Sin sentido: cuenta los dos extremos.
    expect(cardinalityWarning(p, 'pareja', 'a', 'c')).toBe('a ya tiene 2 relaciones «Pareja»; el máximo es 2.');
    expect(cardinalityWarning(p, 'pareja', 'b', 'c')).toBeNull();
    // Sin límites, nunca avisa.
    expect(cardinalityWarning(p, 'amistad', 'a', 'b')).toBeNull();
  });
});
