import { describe, expect, it } from 'vitest';
import { field, node, project, schema } from '../test/fixtures';
import { changeRelationDraftType, type RelationDraft } from './relationDraft';

const p = project({
  fieldLibrary: [field('shared')],
  schemas: [
    schema('person'),
    schema('company'),
    schema('base', { fields: [field('inherited')] }, 'relationship'),
    schema(
      'old',
      {
        directed: true,
        parentTypeId: 'base',
        fields: [
          { ref: 'shared' },
          field('old-title', { key: 'title' }),
          field('old-count', { key: 'count', type: 'number' }),
          field('old-flag', { key: 'flag', type: 'boolean' }),
          field('removed'),
        ],
      },
      'relationship',
    ),
    schema(
      'new',
      {
        directed: true,
        parentTypeId: 'base',
        fields: [
          { ref: 'shared' },
          field('new-title', { key: 'title', defaultValue: 'Default' }),
          field('new-count', { key: 'count', type: 'number', defaultValue: 42 }),
          field('new-flag', { key: 'flag', type: 'boolean', defaultValue: true }),
          field('new-field', { defaultValue: 'New' }),
        ],
      },
      'relationship',
    ),
    schema('restricted', { sourceTypeIds: ['person'], targetTypeIds: ['company'], directed: true }, 'relationship'),
    schema('restricted-child', { parentTypeId: 'restricted', directed: true }, 'relationship'),
    schema('incompatible', { fields: [field('old-count', { key: 'count', type: 'text' })] }, 'relationship'),
    schema('genealogy', { directed: true, genealogical: true }, 'relationship'),
  ],
  nodes: [node('me', 'person'), node('other', 'person'), node('business', 'company')],
});
const draft: RelationDraft = {
  typeId: 'old',
  iAmSource: false,
  otherId: 'other',
  values: {
    shared: 'Shared',
    inherited: 'Inherited',
    'old-title': '',
    'old-count': 0,
    'old-flag': false,
    removed: 'Gone',
  },
};

describe('changeRelationDraftType', () => {
  it('conserva extremo, sentido y valores propios, compartidos y heredados compatibles', () => {
    const next = changeRelationDraftType(p, 'me', draft, 'new');
    expect(next).toEqual({
      typeId: 'new',
      iAmSource: false,
      otherId: 'other',
      values: {
        shared: 'Shared',
        inherited: 'Inherited',
        'new-title': '',
        'new-count': 0,
        'new-flag': false,
        'new-field': 'New',
      },
    });
    expect(draft.values).toHaveProperty('removed', 'Gone');
  });

  it('solo descarta el otro nodo cuando no encaja en los extremos heredados del tipo nuevo', () => {
    const next = changeRelationDraftType(p, 'me', draft, 'restricted-child');
    expect(next.iAmSource).toBe(true);
    expect(next.otherId).toBeNull();
  });

  it('adapta el sentido cuando es necesario y mantiene el otro nodo compatible', () => {
    const next = changeRelationDraftType(p, 'me', { ...draft, otherId: 'business' }, 'restricted-child');
    expect(next.iAmSource).toBe(true);
    expect(next.otherId).toBe('business');
  });

  it('no transfiere valores a un atributo con tipo incompatible aunque tenga el mismo id o clave', () => {
    expect(changeRelationDraftType(p, 'me', draft, 'incompatible').values).not.toHaveProperty('old-count');
  });

  it('genealogía sitúa el nodo editado en origen y conserva el otro extremo compatible', () => {
    const next = changeRelationDraftType(p, 'me', draft, 'genealogy');
    expect(next.iAmSource).toBe(true);
    expect(next.otherId).toBe('other');
  });

  it('ignora tipos inexistentes o de entidad y no altera un tipo que ya estaba seleccionado', () => {
    for (const type of ['missing', 'person', 'old']) expect(changeRelationDraftType(p, 'me', draft, type)).toBe(draft);
  });
});
