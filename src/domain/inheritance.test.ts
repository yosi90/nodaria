import { describe, expect, it } from 'vitest';
import { field, node, project, schema } from '../test/fixtures';
import { fieldOverlaps, moveSchema, reorderSchema, schemaTree } from './inheritance';
import { deleteSchema } from './operations';
import { allFields } from './selectors';

const nombre = field('nombre', { label: 'Nombre' });
const p = project({
  fieldLibrary: [nombre],
  schemas: [
    // Cósmica declara la preforma «nombre» y un «poder» propio.
    schema('cosmica', {
      name: 'Cósmica',
      isAbstract: true,
      fields: [{ ref: 'nombre' }, field('poder', { key: 'poder' })],
    }),
    // Personaje hereda de Cósmica, repite la preforma (duplicado) y define otro «poder» (conflicto).
    schema('personaje', {
      name: 'Personaje',
      parentTypeId: 'cosmica',
      fields: [{ ref: 'nombre' }, field('poder2', { key: 'poder', label: 'Poder propio' })],
    }),
    schema('lugar', { name: 'Lugar' }),
    schema('ami', {}, 'relationship'),
  ],
  nodes: [node('aria', 'personaje', null, { nombre: 'Aria', poder: 'fuego', poder2: 'agua' })],
});

describe('fieldOverlaps', () => {
  it('flags duplicates and conflicts against inherited fields', () => {
    const overlaps = fieldOverlaps(p, p.schemas[1]);
    expect(overlaps.map(o => [o.kind, o.field.id, o.inherited.id, o.from.id, o.yields])).toEqual([
      ['duplicate', 'nombre', 'nombre', 'cosmica', false],
      ['conflict', 'poder2', 'poder', 'cosmica', false],
    ]);
    expect(fieldOverlaps(p, p.schemas[0])).toEqual([]);
  });

  it('lets the specific field win by default and the inherited one when the type yields', () => {
    expect(allFields(p, 'personaje').map(f => f.id)).toEqual(['nombre', 'poder2']);
    const yielding = {
      ...p,
      schemas: p.schemas.map(s => (s.id === 'personaje' ? { ...s, yieldFieldIds: ['poder2'] } : s)),
    };
    expect(allFields(yielding, 'personaje').map(f => f.id)).toEqual(['nombre', 'poder']);
    expect(fieldOverlaps(yielding, yielding.schemas[1])[1].yields).toBe(true);
  });
});

describe('deleteSchema with subtypes', () => {
  it('hands the deleted type fields down to its subtypes as library links, keeping values', () => {
    const next = deleteSchema(p, 'cosmica', 'lift');
    const personaje = next.schemas.find(s => s.id === 'personaje')!;
    expect(personaje.parentTypeId).toBeNull();
    // «poder» pasa a la biblioteca y Personaje lo vincula; «nombre» ya lo tenía.
    expect(next.fieldLibrary.map(f => f.id)).toEqual(['nombre', 'poder']);
    expect(personaje.fields).toEqual([{ ref: 'poder' }, { ref: 'nombre' }, expect.objectContaining({ id: 'poder2' })]);
    expect(next.nodes[0].values).toEqual({ nombre: 'Aria', poder: 'fuego', poder2: 'agua' });
  });
});

describe('reorderSchema and schemaTree', () => {
  it('moves a type before or after another of the same kind', () => {
    expect(reorderSchema(p, 'lugar', 'cosmica', false).schemas.map(s => s.id)).toEqual([
      'lugar',
      'cosmica',
      'personaje',
      'ami',
    ]);
    expect(reorderSchema(p, 'cosmica', 'lugar', true).schemas.map(s => s.id)).toEqual([
      'personaje',
      'lugar',
      'cosmica',
      'ami',
    ]);
    expect(reorderSchema(p, 'ami', 'lugar', true)).toBe(p);
  });

  it('nests subtypes under their parent in list order', () => {
    expect(schemaTree(p, 'entity').map(e => [e.schema.id, e.depth])).toEqual([
      ['cosmica', 0],
      ['personaje', 1],
      ['lugar', 0],
    ]);
  });
});

describe('moveSchema (arrastrar para heredar)', () => {
  it('soltar dentro de otro tipo hace heredar de él y lo coloca tras sus hijos', () => {
    const next = moveSchema(p, 'lugar', 'cosmica', 'inside');
    expect(next.schemas.find(s => s.id === 'lugar')?.parentTypeId).toBe('cosmica');
    expect(next.schemas.map(s => s.id)).toEqual(['cosmica', 'personaje', 'lugar', 'ami']);
    expect(schemaTree(next, 'entity').map(e => [e.schema.id, e.depth])).toEqual([
      ['cosmica', 0],
      ['personaje', 1],
      ['lugar', 1],
    ]);
  });

  it('soltar antes o después de otro lo convierte en hermano suyo (junto a una raíz, sale de la herencia)', () => {
    const next = moveSchema(p, 'personaje', 'lugar', 'after');
    expect(next.schemas.find(s => s.id === 'personaje')?.parentTypeId).toBeNull();
    expect(next.schemas.map(s => s.id)).toEqual(['cosmica', 'lugar', 'personaje', 'ami']);
  });

  it('no permite ciclos ni mezclar clases', () => {
    expect(moveSchema(p, 'cosmica', 'personaje', 'inside')).toBe(p);
    expect(moveSchema(p, 'ami', 'lugar', 'inside')).toBe(p);
    expect(moveSchema(p, 'lugar', 'lugar', 'inside')).toBe(p);
  });
});
