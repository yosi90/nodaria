import { describe, expect, it } from 'vitest';
import { node, project, relation, schema } from '../test/fixtures';
import { DEFAULT_PUBLICATION_OPTIONS, publicationSnapshot, publicationSummary } from './publication';
import type { AgendaEntry } from './agenda';

const IMAGE = 'data:image/jpeg;base64,AAAA';

function world() {
  return project({
    schemas: [
      schema('person'),
      schema('secret'),
      schema('spy', { parentTypeId: 'secret' }),
      schema('knows', {}, 'relationship'),
      schema('hidden-rel', {}, 'relationship'),
    ],
    nodes: [
      { ...node('ana', 'person', null, { portrait: IMAGE, name: 'Ana' }), notes: 'Le teme a [[Beto]]' },
      node('beto', 'person'),
      node('cell', 'secret'),
      node('agent', 'spy'),
      node('child', 'person', 'cell'),
    ],
    relations: [
      relation('r1', 'knows', 'ana', 'beto'),
      relation('r2', 'knows', 'ana', 'agent'),
      relation('r3', 'hidden-rel', 'ana', 'beto'),
    ],
    mapImage: { data: IMAGE, width: 10, height: 10, scale: 1 },
    agenda: [{ id: 'a1' } as AgendaEntry],
  });
}

describe('publicationSnapshot', () => {
  it('por defecto deja fuera las notas y la agenda, y conserva lo demás', () => {
    const snapshot = publicationSnapshot(world(), DEFAULT_PUBLICATION_OPTIONS);
    expect(snapshot.nodes.find(n => n.id === 'ana')?.notes).toBe('');
    expect(snapshot.agenda).toEqual([]);
    expect(snapshot.nodes).toHaveLength(5);
    expect(snapshot.nodes.find(n => n.id === 'ana')?.values.portrait).toBe(IMAGE);
    expect(snapshot.mapImage).not.toBeNull();
  });

  it('quita los tipos excluidos con sus subtipos como al borrarlos, sin tocar el esquema', () => {
    const snapshot = publicationSnapshot(world(), {
      ...DEFAULT_PUBLICATION_OPTIONS,
      excludedTypeIds: ['secret', 'hidden-rel'],
    });
    expect(snapshot.nodes.map(n => n.id)).toEqual(['ana', 'beto', 'child']);
    // El hijo de un nodo quitado sube a la raíz; sus relaciones se van.
    expect(snapshot.nodes.find(n => n.id === 'child')?.parentId).toBeNull();
    expect(snapshot.relations.map(r => r.id)).toEqual(['r1']);
    expect(snapshot.schemas).toHaveLength(5);
  });

  it('sin imágenes, quita las de las fichas y el fondo del mapa', () => {
    const snapshot = publicationSnapshot(world(), { ...DEFAULT_PUBLICATION_OPTIONS, images: false, notes: true });
    const ana = snapshot.nodes.find(n => n.id === 'ana')!;
    expect(ana.values).toEqual({ name: 'Ana' });
    expect(ana.notes).toContain('Beto');
    expect(snapshot.mapImage).toBeNull();
  });

  it('resume lo que se publicará', () => {
    expect(publicationSummary(world(), { ...DEFAULT_PUBLICATION_OPTIONS, excludedTypeIds: ['secret'] })).toEqual({
      nodes: 3,
      relations: 2,
      leftOutNodes: 2,
      notes: 0,
      hiddenNotes: 1,
      agenda: 1,
      tableRows: 0,
    });
  });
});
