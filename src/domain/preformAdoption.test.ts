import { describe, expect, it } from 'vitest';
import { field, node, project, schema } from '../test/fixtures';
import { sameKeyFields, shareFieldWith } from './preformAdoption';
import { allFields, getSchema } from './selectors';
import { fieldOverlaps } from './inheritance';
import { ownFields } from './library';

const world = () =>
  project({
    schemas: [
      schema('personaje', {
        fields: [field('nombre', { isTitle: true }), field('edad', { type: 'number', label: 'Edad' })],
      }),
      schema('criatura', {
        fields: [
          field('raza'),
          field('edad-c', { key: 'edad', type: 'number', label: 'Años' }),
          field('nota', { type: 'computed', formula: '{Años} años' }),
          field('mayor', { visibleWhen: { fieldId: 'edad-c', options: [] } }),
        ],
      }),
      schema('lugar', { fields: [field('edad-l', { key: 'edad', type: 'text' }), field('clima')] }),
    ],
    nodes: [
      node('aria', 'personaje', null, { nombre: 'Aria', edad: 30 }),
      node('grifo', 'criatura', null, { 'edad-c': 120 }),
      node('alta', 'lugar', null, { 'edad-l': '800', clima: 'frío' }),
      node('baja', 'lugar', null, { 'edad-l': 'antigua' }),
    ],
  });

describe('convertir en preforma los atributos con la misma clave', () => {
  it('encuentra los atributos propios de otros tipos con la misma clave', () => {
    expect(sameKeyFields(world(), 'personaje', 'edad').map(c => [c.schema.id, c.field.id])).toEqual([
      ['criatura', 'edad-c'],
      ['lugar', 'edad-l'],
    ]);
    expect(sameKeyFields(world(), 'personaje', 'nombre')).toEqual([]);
  });

  it('los adoptados vinculan la preforma en su sitio y sus valores pasan a ella', () => {
    const p = shareFieldWith(world(), 'personaje', 'edad', ['edad-c', 'edad-l']);
    expect(p.fieldLibrary.map(f => f.id)).toEqual(['edad']);
    expect(getSchema(p, 'criatura')!.fields[1]).toEqual({ ref: 'edad' });
    expect(getSchema(p, 'lugar')!.fields[0]).toEqual({ ref: 'edad' });
    expect(allFields(p, 'lugar').map(f => f.id)).toEqual(['edad', 'clima']);
    expect(p.nodes.find(n => n.id === 'grifo')!.values).toEqual({ edad: 120 });
    // De texto a número: lo que se puede convertir se convierte y lo demás se pierde.
    expect(p.nodes.find(n => n.id === 'alta')!.values).toEqual({ edad: 800, clima: 'frío' });
    expect(p.nodes.find(n => n.id === 'baja')!.values).toEqual({});
  });

  it('lo que citaba el id antiguo cita la preforma y las fórmulas usan su nombre', () => {
    const p = shareFieldWith(world(), 'personaje', 'edad', ['edad-c']);
    const criatura = getSchema(p, 'criatura')!;
    const own = ownFields(criatura);
    expect(own.find(f => f.id === 'mayor')!.visibleWhen?.fieldId).toBe('edad');
    expect(own.find(f => f.id === 'nota')!.formula).toBe('{edad} años');
    // Solo se adopta lo elegido.
    expect(getSchema(p, 'lugar')!.fields[0]).toMatchObject({ id: 'edad-l' });
  });

  it('sin otros elegidos es lo mismo que compartir solo el original', () => {
    const p = shareFieldWith(world(), 'personaje', 'edad', []);
    expect(getSchema(p, 'personaje')!.fields[1]).toEqual({ ref: 'edad' });
    expect(getSchema(p, 'criatura')!.fields[1]).toMatchObject({ id: 'edad-c' });
  });

  it('un subtipo que ya recibe la preforma por herencia no la repite y la conserva en su sitio', () => {
    const base = project({
      schemas: [
        schema('personaje', { fields: [field('nombre'), field('edad')] }),
        schema('mago', { parentTypeId: 'personaje', fields: [field('edad-m', { key: 'edad' }), field('escuela')] }),
      ],
      nodes: [node('aria', 'mago', null, { 'edad-m': '30' })],
    });
    expect(allFields(base, 'mago').map(f => f.id)).toEqual(['nombre', 'edad-m', 'escuela']);
    const p = shareFieldWith(base, 'personaje', 'edad', ['edad-m']);
    const mago = getSchema(p, 'mago')!;
    expect(mago.fields.map(f => ('ref' in f ? f.ref : f.id))).toEqual(['escuela']);
    expect(fieldOverlaps(p, mago)).toEqual([]);
    expect(allFields(p, 'mago').map(f => f.id)).toEqual(['nombre', 'edad', 'escuela']);
    expect(p.nodes[0].values).toEqual({ edad: '30' });
  });

  it('una lista suma las opciones que usaban los adoptados', () => {
    const base = project({
      schemas: [
        schema('a', { fields: [field('estado', { type: 'select', options: ['Abierto'] })] }),
        schema('b', {
          fields: [
            field('estado-b', {
              key: 'estado',
              type: 'select',
              options: ['Cerrado', 'Pausado'],
              optionIcons: { Pausado: 'pause' },
            }),
          ],
        }),
      ],
      nodes: [node('x', 'b', null, { 'estado-b': 'Cerrado' })],
    });
    const p = shareFieldWith(base, 'a', 'estado', ['estado-b']);
    expect(p.fieldLibrary[0].options).toEqual(['Abierto', 'Cerrado', 'Pausado']);
    expect(p.fieldLibrary[0].optionIcons).toEqual({ Pausado: 'pause' });
    expect(p.nodes[0].values).toEqual({ estado: 'Cerrado' });
  });

  it('los ajustes de orden, filtros, consultas y filas pasan a la preforma', () => {
    const base = project({
      schemas: [
        schema('a', { fields: [field('ref', { type: 'nodeRef' })] }),
        schema('b', {
          fields: [field('otro'), field('ref-b', { key: 'ref', type: 'nodeRef' })],
          fieldOrder: ['ref-b', 'otro'],
        }),
      ],
      queries: [
        { id: 'q', name: 'q', typeId: 'b', conditions: [{ kind: 'field', fieldId: 'ref-b', op: 'empty', value: '' }] },
      ],
      tableData: { t: { rows: [{ id: 'r', cells: { 'ref-b:id': '1', otro: 'x' } }] } },
    });
    const withView = {
      ...base,
      view: { ...base.view, structureId: 'field:ref-b', hiddenReferenceFieldIds: ['ref-b'] },
    };
    const p = shareFieldWith(withView, 'a', 'ref', ['ref-b']);
    expect(getSchema(p, 'b')!.fieldOrder).toEqual(['ref', 'otro']);
    expect(p.view.structureId).toBe('field:ref');
    expect(p.view.hiddenReferenceFieldIds).toEqual(['ref']);
    expect(p.queries[0].conditions[0]).toMatchObject({ fieldId: 'ref' });
    expect(p.tableData.t.rows[0].cells).toEqual({ 'ref:id': '1', otro: 'x' });
  });
});
