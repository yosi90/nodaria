import { describe, expect, it } from 'vitest';
import { field, node, project, relation, schema } from '../test/fixtures';
import { structureChildren } from './structure';
import { canMoveInStructure, moveInStructure } from './structureMove';

const world = () =>
  project({
    schemas: [
      schema('lugar', { allowedChildTypeIds: ['lugar', 'personaje'] }),
      schema('personaje', { fields: [field('ciudad', { type: 'nodeRef', referenceTypeIds: ['lugar'] })] }),
      schema(
        'vive',
        { structural: true, parentEnd: 'target', sourceTypeIds: ['personaje'], targetTypeIds: ['lugar'] },
        'relationship',
      ),
      schema(
        'familia',
        { genealogical: true, sourceTypeIds: ['personaje'], targetTypeIds: ['personaje'] },
        'relationship',
      ),
    ],
    nodes: [
      node('reino', 'lugar'),
      node('ciudad', 'lugar', 'reino'),
      node('aldea', 'lugar', 'reino'),
      node('a', 'personaje', 'ciudad'),
      node('b', 'personaje', 'ciudad'),
      node('c', 'personaje'),
    ],
    relations: [relation('r1', 'vive', 'a', 'reino'), relation('r2', 'vive', 'b', 'reino')],
  });

const order = (p: ReturnType<typeof world>, structureId: string | null, parent: string | null) =>
  (structureChildren(p, structureId).get(parent) ?? []).map(n => n.id);

describe('mover en la jerarquía base', () => {
  it('anida, saca a la raíz y reordena hermanos', () => {
    let p = moveInStructure(world(), {
      structureId: null,
      nodeId: 'c',
      fromParentId: null,
      parentId: 'ciudad',
      beforeId: 'a',
    });
    expect(order(p, null, 'ciudad')).toEqual(['c', 'a', 'b']);
    p = moveInStructure(p, { structureId: null, nodeId: 'a', fromParentId: 'ciudad', parentId: null, beforeId: null });
    expect(p.nodes.find(n => n.id === 'a')!.parentId).toBeNull();
    expect(order(p, null, null).at(-1)).toBe('a');
    p = moveInStructure(p, {
      structureId: null,
      nodeId: 'aldea',
      fromParentId: 'reino',
      parentId: 'reino',
      beforeId: 'ciudad',
    });
    expect(order(p, null, 'reino')).toEqual(['aldea', 'ciudad']);
  });
  it('rechaza ciclos y tipos no admitidos', () => {
    const p = world();
    expect(canMoveInStructure(p, null, 'reino', 'ciudad')).toBe(false);
    expect(canMoveInStructure(p, null, 'reino', 'reino')).toBe(false);
    // Un personaje no admite subnodos
    expect(canMoveInStructure(p, null, 'b', 'a')).toBe(false);
    expect(
      moveInStructure(p, {
        structureId: null,
        nodeId: 'reino',
        fromParentId: null,
        parentId: 'ciudad',
        beforeId: null,
      }),
    ).toBe(p);
  });
});

describe('mover en otras estructuras', () => {
  it('relación estructural: cambia la relación con el superior y conserva el orden pedido', () => {
    let p = moveInStructure(world(), {
      structureId: 'vive',
      nodeId: 'a',
      fromParentId: 'reino',
      parentId: 'ciudad',
      beforeId: null,
    });
    expect(p.relations.filter(r => r.typeId === 'vive').map(r => `${r.sourceId}>${r.targetId}`)).toEqual([
      'b>reino',
      'a>ciudad',
    ]);
    p = moveInStructure(p, { structureId: 'vive', nodeId: 'c', fromParentId: null, parentId: 'reino', beforeId: 'b' });
    expect(order(p, 'vive', 'reino')).toEqual(['c', 'b']);
    p = moveInStructure(p, { structureId: 'vive', nodeId: 'b', fromParentId: 'reino', parentId: null, beforeId: null });
    expect(p.relations.some(r => r.typeId === 'vive' && r.sourceId === 'b')).toBe(false);
  });
  it('parentesco: colgar de un ascendiente crea la relación de hijo', () => {
    const p = moveInStructure(world(), {
      structureId: 'familia',
      nodeId: 'a',
      fromParentId: null,
      parentId: 'b',
      beforeId: null,
    });
    const r = p.relations.find(x => x.typeId === 'familia')!;
    expect(r.sourceId).toBe('a');
    expect(r.targetId).toBe('b');
    expect(r.kinshipId).toBe('hijo');
    expect(order(p, 'familia', 'b')).toEqual(['a']);
  });
  it('atributo de referencia: apunta al nuevo superior', () => {
    const p = moveInStructure(world(), {
      structureId: 'field:ciudad',
      nodeId: 'a',
      fromParentId: null,
      parentId: 'aldea',
      beforeId: null,
    });
    expect(p.nodes.find(n => n.id === 'a')!.values.ciudad).toBe('aldea');
    expect(canMoveInStructure(p, 'field:ciudad', 'reino', 'aldea')).toBe(false);
  });
});
