import { describe, expect, it } from 'vitest';
import { node, project, schema } from '../test/fixtures';
import { effectiveChildTypes, inheritedConstraints, relationEnds } from './constraints';
import { canContain, compatibleRelationTypes } from './selectors';

const p = project({
  schemas: [
    schema('lugar', { name: 'Lugar', allowedChildTypeIds: ['per'] }),
    schema('ciudad', { name: 'Ciudad', parentTypeId: 'lugar', allowedChildTypeIds: ['edificio'] }),
    schema('per', { name: 'Personaje' }),
    schema('edificio', { name: 'Edificio' }),
    schema('vinculo', { name: 'Vínculo', sourceTypeIds: ['per'], targetTypeIds: ['lugar'] }, 'relationship'),
    schema('vive', { name: 'Vive en', parentTypeId: 'vinculo' }, 'relationship'),
    schema('visita', { name: 'Visita', parentTypeId: 'vinculo', targetTypeIds: ['ciudad'] }, 'relationship'),
  ],
  nodes: [node('aria', 'per'), node('vael', 'ciudad'), node('bosque', 'lugar'), node('torre', 'edificio')],
});

describe('inherited constraints', () => {
  it('unions allowed child types along the inheritance chain', () => {
    expect(effectiveChildTypes(p, 'ciudad').sort()).toEqual(['edificio', 'per']);
    expect(canContain(p, 'ciudad', 'per')).toBe(true);
    expect(canContain(p, 'ciudad', 'edificio')).toBe(true);
    expect(canContain(p, 'lugar', 'edificio')).toBe(false);
  });

  it('relation subtypes inherit the ends they leave empty', () => {
    expect(relationEnds(p, p.schemas[5])).toEqual({ source: ['per'], target: ['lugar'] });
    expect(relationEnds(p, p.schemas[6])).toEqual({ source: ['per'], target: ['ciudad'] });
    expect(compatibleRelationTypes(p, 'aria', 'vael').map(s => s.id)).toEqual(['vinculo', 'vive', 'visita']);
    expect(compatibleRelationTypes(p, 'aria', 'bosque').map(s => s.id)).toEqual(['vinculo', 'vive']);
  });

  it('explains what comes inherited', () => {
    const c = inheritedConstraints(p, p.schemas[1]);
    expect(c.childTypeIds).toEqual(['per']);
    const v = inheritedConstraints(p, p.schemas[6]);
    expect(v.sourceFrom?.id).toBe('vinculo');
    expect(v.targetFrom).toBeNull();
  });
});
