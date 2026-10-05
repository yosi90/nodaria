import { describe, expect, it } from 'vitest';
import { createView } from './factories';
import { viewForLayout } from './layoutFilters';
import { addSchema } from './operations';
import { project, schema } from '../test/fixtures';
import type { Project } from './types';

const base = (): Project =>
  project({
    schemas: [
      schema('personaje'),
      schema('lugar'),
      schema('amistad', { sourceTypeIds: ['personaje'], targetTypeIds: ['personaje'] }, 'relationship'),
      schema(
        'parentesco',
        { genealogical: true, sourceTypeIds: ['personaje'], targetTypeIds: ['personaje'] },
        'relationship',
      ),
    ],
    view: { ...createView(), layout: 'tree', hiddenRelationTypeIds: ['parentesco'], hiddenReferenceFieldIds: ['f1'] },
  });

describe('viewForLayout', () => {
  it('keeps the filters of each layout apart', () => {
    let p = base();
    // Primera visita a Genealogía: oculta los tipos que ningún parentesco admite y conserva lo demás.
    let patch = viewForLayout(p, 'genealogy');
    expect(patch.layout).toBe('genealogy');
    expect(patch.hiddenEntityTypeIds).toEqual(['lugar']);
    expect(patch.hiddenReferenceFieldIds).toEqual(['f1']);
    expect(patch.layoutFilters?.tree).toEqual({
      hiddenEntityTypeIds: [],
      hiddenRelationTypeIds: ['parentesco'],
      hiddenReferenceFieldIds: ['f1'],
    });
    p = { ...p, view: { ...p.view, ...patch } };

    // En Genealogía se cambian filtros: no afectan al árbol.
    p = { ...p, view: { ...p.view, hiddenRelationTypeIds: ['amistad'], hiddenReferenceFieldIds: [] } };
    patch = viewForLayout(p, 'tree');
    expect(patch.hiddenEntityTypeIds).toEqual([]);
    expect(patch.hiddenRelationTypeIds).toEqual(['parentesco']);
    expect(patch.hiddenReferenceFieldIds).toEqual(['f1']);
    expect(patch.layoutFilters?.genealogy).toEqual({
      hiddenEntityTypeIds: ['lugar'],
      hiddenRelationTypeIds: ['amistad'],
      hiddenReferenceFieldIds: [],
    });
    p = { ...p, view: { ...p.view, ...patch } };

    // Volver a Genealogía recupera exactamente lo decidido allí.
    patch = viewForLayout(p, 'genealogy');
    expect(patch.hiddenEntityTypeIds).toEqual(['lugar']);
    expect(patch.hiddenRelationTypeIds).toEqual(['amistad']);
    expect(patch.hiddenReferenceFieldIds).toEqual([]);
  });

  it('hides kinship by default when leaving genealogy for a new layout', () => {
    const p = base();
    const inGenealogy = { ...p, view: { ...p.view, layout: 'genealogy' as const, hiddenEntityTypeIds: ['lugar'] } };
    const patch = viewForLayout(inGenealogy, 'force');
    expect(patch.hiddenEntityTypeIds).toEqual([]);
    expect(patch.hiddenRelationTypeIds).toEqual(['parentesco']);
  });

  it('does nothing when the layout does not change', () => {
    expect(viewForLayout(base(), 'tree')).toEqual({});
  });
});

describe('tipos creados después de visitar Genealogía', () => {
  const base = () =>
    project({
      schemas: [
        schema('per', { name: 'Personaje' }),
        schema('familia', { genealogical: true, sourceTypeIds: ['per'], targetTypeIds: ['per'] }, 'relationship'),
      ],
    });

  it('nacen ocultos en Genealogía si el parentesco no los admite, estando en esa disposición', () => {
    let p = base();
    p = { ...p, view: { ...p.view, layout: 'genealogy', hiddenEntityTypeIds: [] } };
    p = addSchema(p, 'Raza', 'entity', 'raza');
    expect(p.view.hiddenEntityTypeIds).toEqual(['raza']);
    // Un tipo de relación no entra en la lista de entidades ocultas.
    p = addSchema(p, 'Amistad', 'relationship', 'amistad');
    expect(p.view.hiddenEntityTypeIds).toEqual(['raza']);
  });

  it('se añaden a los filtros guardados de Genealogía cuando la disposición activa es otra', () => {
    let p = base();
    p = {
      ...p,
      view: {
        ...p.view,
        layout: 'tree',
        layoutFilters: {
          genealogy: { hiddenEntityTypeIds: [], hiddenRelationTypeIds: [], hiddenReferenceFieldIds: [] },
        },
      },
    };
    p = addSchema(p, 'Raza', 'entity', 'raza');
    expect(p.view.layoutFilters.genealogy?.hiddenEntityTypeIds).toEqual(['raza']);
    expect(p.view.hiddenEntityTypeIds).toEqual([]);
  });

  it('no toca nada si Genealogía no se ha visitado todavía', () => {
    const p = addSchema(base(), 'Raza', 'entity', 'raza');
    expect(p.view.layoutFilters.genealogy).toBeUndefined();
    expect(p.view.hiddenEntityTypeIds).toEqual([]);
  });
});
