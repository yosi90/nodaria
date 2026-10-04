import { describe, expect, it } from 'vitest';
import { field, node, project, schema } from '../test/fixtures';
import { addNode, bulkPreview, bulkUpdateNodes, deleteNodes, fillDefaults, nodesMissingValue } from './operations';

const p = project({
  schemas: [
    schema('ser', {
      name: 'Ser',
      isAbstract: true,
      fields: [
        field('nombre', { isTitle: true }),
        field('estado', { type: 'select', options: ['vivo', 'muerto'], defaultValue: 'vivo' }),
      ],
    }),
    schema('per', {
      name: 'Personaje',
      parentTypeId: 'ser',
      fields: [field('edad', { key: 'edad', type: 'number' }), field('tags', { type: 'tags' })],
    }),
    schema('bestia', {
      name: 'Bestia',
      parentTypeId: 'ser',
      fields: [field('edad2', { key: 'edad', type: 'number' })],
    }),
    schema('lugar', { name: 'Lugar', allowedChildTypeIds: ['per'] }),
  ],
  nodes: [
    node('aria', 'per', null, { nombre: 'Aria', edad: 30, tags: ['noble'] }),
    node('bran', 'per', null, { nombre: 'Bran', estado: 'muerto' }),
    node('vael', 'lugar'),
    node('hijo', 'per', 'aria', { nombre: 'Hijo' }),
  ],
});

describe('typed and inherited defaults', () => {
  it('applies the inherited default when creating a node of a subtype', () => {
    const { project: next, nodeId } = addNode(p, 'per', null);
    expect(next.nodes.find(n => n.id === nodeId)?.values.estado).toBe('vivo');
  });

  it('fills blank values in existing nodes with the default', () => {
    expect(nodesMissingValue(p, 'estado').map(n => n.id)).toEqual(['aria', 'hijo']);
    const next = fillDefaults(p, 'estado');
    expect(next.nodes.find(n => n.id === 'aria')?.values.estado).toBe('vivo');
    expect(next.nodes.find(n => n.id === 'bran')?.values.estado).toBe('muerto');
  });
});

describe('bulk operations', () => {
  it('changes type keeping values by id and by key, and applying defaults', () => {
    const next = bulkUpdateNodes(p, ['aria'], { typeId: 'bestia' });
    const aria = next.nodes.find(n => n.id === 'aria')!;
    expect(aria.typeId).toBe('bestia');
    expect(aria.values.nombre).toBe('Aria');
    expect(aria.values.edad2).toBe(30);
    expect(aria.values.estado).toBe('vivo');
    expect(aria.values.tags).toBeUndefined();
  });

  it('moves only the nodes the destination admits and never creates cycles', () => {
    expect(bulkPreview(p, ['aria', 'bran', 'vael'], { parentId: 'vael' })).toMatchObject({ total: 3, moved: 2 });
    const next = bulkUpdateNodes(p, ['aria', 'bran', 'vael'], { parentId: 'vael' });
    expect(next.nodes.find(n => n.id === 'aria')?.parentId).toBe('vael');
    expect(next.nodes.find(n => n.id === 'vael')?.parentId).toBeNull();
    const root = bulkUpdateNodes(p, ['hijo'], { parentId: null });
    expect(root.nodes.find(n => n.id === 'hijo')?.parentId).toBeNull();
  });

  it('adds tags without duplicates only where the field exists', () => {
    const next = bulkUpdateNodes(p, ['aria', 'bran', 'vael'], { tags: { fieldId: 'tags', add: ['noble', 'rebelde'] } });
    expect(next.nodes.find(n => n.id === 'aria')?.values.tags).toEqual(['noble', 'rebelde']);
    expect(next.nodes.find(n => n.id === 'bran')?.values.tags).toEqual(['noble', 'rebelde']);
    expect(next.nodes.find(n => n.id === 'vael')?.values.tags).toBeUndefined();
  });

  it('deletes several nodes with their descendants', () => {
    const next = deleteNodes(p, ['aria', 'bran']);
    expect(next.nodes.map(n => n.id)).toEqual(['vael']);
  });
});
