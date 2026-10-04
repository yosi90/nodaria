import { describe, expect, it } from 'vitest';
import { field, node, project, relation, schema } from '../test/fixtures';
import { describeCondition, runQuery, type SavedQuery } from './queries';

const p = project({
  schemas: [
    schema('per', {
      name: 'Personaje',
      fields: [
        field('nombre', { isTitle: true }),
        field('dios', { type: 'nodeRef', referenceTypeIds: ['deidad'] }),
        field('edad', { type: 'number' }),
        field('rasgos', { type: 'tags' }),
        field('vivo', { type: 'boolean' }),
      ],
    }),
    schema('mago', { name: 'Mago', parentTypeId: 'per' }),
    schema('deidad', { name: 'Deidad', fields: [field('dn', { isTitle: true })] }),
    schema('escuela', { name: 'Escuela' }),
    schema('pertenece', { name: 'Pertenece', directed: true }, 'relationship'),
    schema('ami', { name: 'Amistad' }, 'relationship'),
  ],
  nodes: [
    node('sol', 'deidad', null, { dn: 'Solenne' }),
    node('esc', 'escuela'),
    node('a', 'per', 'esc', { nombre: 'Aria', dios: 'sol', edad: 30, rasgos: ['terca'], vivo: true }),
    node('b', 'per', null, { nombre: 'Bren', edad: 12, vivo: false }),
    node('m', 'mago', null, { nombre: 'Mira', dios: 'sol', edad: 40 }),
  ],
  relations: [relation('r1', 'pertenece', 'a', 'esc'), relation('r2', 'ami', 'a', 'b')],
});

const q = (conditions: SavedQuery['conditions'], typeId = 'per'): SavedQuery => ({
  id: 'q',
  name: 'q',
  typeId,
  conditions,
});
const ids = (query: SavedQuery) => runQuery(p, query).map(n => n.id);

describe('runQuery', () => {
  it('matches the type and its subtypes, with all conditions', () => {
    expect(ids(q([]))).toEqual(['a', 'b', 'm']);
    expect(ids(q([], 'mago'))).toEqual(['m']);
    expect(ids(q([{ kind: 'field', fieldId: 'dios', op: 'empty', value: '' }]))).toEqual(['b']);
    expect(ids(q([{ kind: 'field', fieldId: 'dios', op: 'equals', value: 'solenne' }]))).toEqual(['a', 'm']);
    expect(
      ids(
        q([
          { kind: 'field', fieldId: 'edad', op: 'gt', value: '18' },
          { kind: 'field', fieldId: 'vivo', op: 'equals', value: 'sí' },
        ]),
      ),
    ).toEqual(['a']);
    expect(ids(q([{ kind: 'field', fieldId: 'rasgos', op: 'contains', value: 'TERC' }]))).toEqual(['a']);
    expect(ids(q([{ kind: 'field', fieldId: 'edad', op: 'notEquals', value: '30' }]))).toEqual(['b', 'm']);
  });

  it('filters by relations, parents and children', () => {
    expect(ids(q([{ kind: 'relation', typeId: 'pertenece', presence: 'lacks', end: 'source' }]))).toEqual(['b', 'm']);
    expect(ids(q([{ kind: 'relation', typeId: null, presence: 'has', end: 'any' }]))).toEqual(['a', 'b']);
    expect(ids(q([{ kind: 'parent', presence: 'lacks' }]))).toEqual(['b', 'm']);
    expect(ids(q([{ kind: 'children', presence: 'has' }], 'escuela'))).toEqual(['esc']);
  });

  it('describes conditions in Spanish', () => {
    expect(describeCondition(p, 'per', { kind: 'field', fieldId: 'dios', op: 'empty', value: '' })).toBe(
      'dios está vacío',
    );
    expect(describeCondition(p, 'per', { kind: 'field', fieldId: 'edad', op: 'gt', value: '18' })).toBe(
      'edad es mayor que «18»',
    );
    expect(
      describeCondition(p, 'per', { kind: 'relation', typeId: 'pertenece', presence: 'lacks', end: 'source' }),
    ).toBe('sin relación Pertenece como origen');
    expect(describeCondition(p, 'per', { kind: 'children', presence: 'lacks' })).toBe('sin subnodos');
  });
});
