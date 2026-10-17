import { describe, expect, it } from 'vitest';
import { field, node, project, relation, schema } from '../test/fixtures';
import { mergeProject } from './projectMerge';

const persona = schema('persona', { name: 'Persona', fields: [field('nombre', { isTitle: true })] });
const amistad = schema('amistad', { name: 'Amistad' }, 'relationship');
const target = project({
  schemas: [persona, amistad],
  nodes: [node('ana', 'persona', null, { nombre: 'Ana' })],
});
// Una copia del mismo proyecto que siguió por su cuenta: un atributo y un tipo nuevos, más nodos.
const source = project({
  id: 'p2',
  schemas: [
    { ...persona, fields: [...persona.fields, field('edad', { label: 'Edad', type: 'number' })] },
    amistad,
    schema('lugar', { name: 'Lugar', fields: [field('lnombre', { isTitle: true })] }),
  ],
  nodes: [
    node('ana', 'persona', null, { nombre: 'Ana cambiada' }),
    node('luis', 'persona', 'ana', { nombre: 'Luis', edad: 12 }),
    node('eva', 'persona', 'nadie', { nombre: 'Ana' }),
    node('puerto', 'lugar', null, { lnombre: 'Puerto' }),
  ],
  relations: [relation('r1', 'amistad', 'ana', 'luis'), relation('r2', 'amistad', 'luis', 'puerto')],
});

describe('mergeProject', () => {
  it('con el esquema, añade tipos, atributos, nodos y relaciones que faltan sin tocar lo que está', () => {
    const result = mergeProject(target, source, { schema: true });
    expect(result).toMatchObject({
      newTypes: 1,
      newFields: 1,
      nodes: 3,
      existing: 1,
      skippedNodes: 0,
      relations: 2,
      skippedRelations: 0,
      sameTitle: 1,
    });
    const byId = new Map(result.project.nodes.map(n => [n.id, n]));
    expect(byId.get('ana')!.values.nombre).toBe('Ana');
    expect(byId.get('luis')).toMatchObject({ parentId: 'ana', values: { edad: 12 } });
    expect(byId.get('eva')!.parentId).toBeNull();
    expect(result.project.schemas.find(s => s.id === 'persona')!.fields.map(f => ('ref' in f ? f.ref : f.id))).toEqual([
      'nombre',
      'edad',
    ]);
    // Importar otra vez lo mismo no cambia nada.
    const again = mergeProject(result.project, source, { schema: true });
    expect(again).toMatchObject({ newTypes: 0, newFields: 0, nodes: 0, existing: 4, relations: 0 });
  });

  it('sin el esquema, omite los nodos de tipos que faltan, sus relaciones y los valores sin atributo', () => {
    const result = mergeProject(target, source, { schema: false });
    expect(result).toMatchObject({
      newTypes: 0,
      newFields: 0,
      nodes: 2,
      skippedNodes: 1,
      relations: 1,
      skippedRelations: 1,
    });
    expect(result.project.schemas).toHaveLength(2);
    expect(result.project.nodes.find(n => n.id === 'luis')!.values).toEqual({ nombre: 'Luis' });
  });
});
