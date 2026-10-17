import { describe, expect, it } from 'vitest';
import { appReducer } from '../state/reducer';
import { field, node, project, schema } from '../test/fixtures';
import { conversionPreview, convertValue, withConvertedValues } from './valueConversion';
import type { FieldDefinition, Project } from './types';

const p = project({
  schemas: [schema('persona', { fields: [field('nombre', { isTitle: true }), field('dato')] })],
  nodes: [
    node('ana', 'persona', null, { nombre: 'Ana', dato: '12,5' }),
    node('luis', 'persona', null, { nombre: 'Luis', dato: 'alto' }),
    node('eva', 'persona', null, { nombre: 'Eva' }),
  ],
});
const text = field('dato');
const as = (type: FieldDefinition['type'], patch: Partial<FieldDefinition> = {}) => ({ ...text, type, ...patch });

describe('convertValue', () => {
  it('convierte lo que tiene sentido y devuelve null con lo que no', () => {
    expect(convertValue(p, '12,5', text, as('number'))).toBe(12.5);
    expect(convertValue(p, 'alto', text, as('number'))).toBeNull();
    expect(convertValue(p, '7', text, as('scale'))).toBe(5);
    expect(convertValue(p, 'Sí', text, as('boolean'))).toBe(true);
    expect(convertValue(p, 'quizá', text, as('boolean'))).toBeNull();
    expect(convertValue(p, 'rojo, verde ,azul', text, as('tags'))).toEqual(['rojo', 'verde', 'azul']);
    expect(convertValue(p, ['a', 'b'], as('tags'), text)).toBe('a, b');
    expect(convertValue(p, 3, as('number'), text)).toBe('3');
    expect(convertValue(p, true, as('boolean'), text)).toBe('Sí');
    expect(convertValue(p, '1043-13-02', text, as('date'))).toBe('1043-13-02');
    expect(convertValue(p, 'ayer', text, as('date'))).toBeNull();
    expect(convertValue(p, '#aa00ff', text, as('color'))).toBe('#aa00ff');
  });

  it('pasa de texto a referencias por el título del nodo, y de vuelta', () => {
    const ref = as('nodeRef', { referenceTypeIds: ['persona'] });
    const refs = as('nodeRefs', { referenceTypeIds: ['persona'] });
    expect(convertValue(p, 'luis', text, ref)).toBe('luis');
    expect(convertValue(p, 'Ana', text, ref)).toBe('ana');
    expect(convertValue(p, 'Nadie', text, ref)).toBeNull();
    expect(convertValue(p, 'Ana, Eva', text, refs)).toEqual(['ana', 'eva']);
    expect(convertValue(p, 'ana', ref, refs)).toEqual(['ana']);
    expect(convertValue(p, ['eva', 'ana'], refs, text)).toBe('Eva, Ana');
  });
});

describe('withConvertedValues', () => {
  it('convierte los valores al cambiar el tipo y borra lo que no se puede', () => {
    const after: Project = {
      ...p,
      schemas: p.schemas.map(s => ({
        ...s,
        fields: s.fields.map(f => ('ref' in f || f.id !== 'dato' ? f : as('number'))),
      })),
    };
    expect(conversionPreview(p, text, as('number'))).toEqual({ converted: 1, lost: 1 });
    const next = withConvertedValues(p, after);
    expect(next.nodes.find(n => n.id === 'ana')!.values.dato).toBe(12.5);
    expect('dato' in next.nodes.find(n => n.id === 'luis')!.values).toBe(false);
    expect(next.nodes.find(n => n.id === 'ana')!.values.nombre).toBe('Ana');
  });

  it('al pasar a lista añade como opciones los valores que faltan', () => {
    const select = as('select', { options: ['bajo'] });
    const after: Project = {
      ...p,
      schemas: p.schemas.map(s => ({ ...s, fields: s.fields.map(f => ('ref' in f || f.id !== 'dato' ? f : select)) })),
    };
    const next = withConvertedValues(p, after);
    const defined = next.schemas[0].fields.find(f => !('ref' in f) && f.id === 'dato') as FieldDefinition;
    expect(defined.options).toEqual(['bajo', '12,5', 'alto']);
    expect(next.nodes.find(n => n.id === 'luis')!.values.dato).toBe('alto');
  });

  it('el reductor convierte al guardar el tipo, en un solo paso', () => {
    const state = { version: 3 as const, projects: [p], activeProjectId: p.id };
    const persona = {
      ...p.schemas[0],
      fields: p.schemas[0].fields.map(f => ('ref' in f || f.id !== 'dato' ? f : as('number'))),
    };
    const next = appReducer(state, { type: 'update-schema', schema: persona });
    expect(next.projects[0].nodes[0].values.dato).toBe(12.5);
  });
});
