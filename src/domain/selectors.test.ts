import { describe, expect, it } from 'vitest';
import { field, node, project, schema } from '../test/fixtures';
import {
  allFields,
  canChangeSchemaKind,
  canSetParent,
  creatableTypes,
  descendants,
  fieldText,
  fieldValue,
  inheritanceCandidates,
  nodeDepths,
  nodeLabel,
  parentCandidates,
  relationLabel,
  relationRole,
} from './selectors';

const world = () =>
  project({
    schemas: [
      schema('lugar', { allowedChildTypeIds: ['lugar', 'personaje'] }),
      schema('personaje', { fields: [field('nombre', { isTitle: true })] }),
      schema('mago', { parentTypeId: 'personaje', fields: [field('escuela')] }),
    ],
    nodes: [
      node('reino', 'lugar'),
      node('ciudad', 'lugar', 'reino'),
      node('aria', 'personaje', 'ciudad', { nombre: 'Aria' }),
      node('tor', 'mago', null, { nombre: 'Tor' }),
    ],
  });

describe('jerarquía de nodos', () => {
  it('descendants incluye el propio nodo y todos sus descendientes', () => {
    expect([...descendants(world(), 'reino')].sort()).toEqual(['aria', 'ciudad', 'reino']);
  });

  it('canSetParent impide ciclos', () => {
    const p = world();
    expect(canSetParent(p, 'reino', 'aria')).toBe(false);
    expect(canSetParent(p, 'reino', 'reino')).toBe(false);
    expect(canSetParent(p, 'aria', 'reino')).toBe(true);
    expect(canSetParent(p, 'aria', null)).toBe(true);
    expect(canSetParent(p, 'aria', 'inexistente')).toBe(false);
  });

  it('parentCandidates excluye descendientes y respeta los subnodos permitidos', () => {
    const p = world();
    expect(parentCandidates(p, 'ciudad').map(n => n.id)).toEqual(['reino']);
    // Un mago es un personaje, así que un lugar lo admite por herencia.
    expect(parentCandidates(p, 'tor').map(n => n.id)).toEqual(['reino', 'ciudad']);
  });

  it('nodeDepths termina aunque haya ciclos o padres inexistentes', () => {
    const p = project({
      schemas: [schema('t')],
      nodes: [node('a', 't', 'b'), node('b', 't', 'a'), node('c', 't', 'fantasma'), node('d', 't', 'a')],
    });
    const depths = nodeDepths(p);
    expect(depths.size).toBe(4);
    expect(depths.get('c')).toBe(0);
    expect(depths.get('d')).toBe(depths.get('a')! + 1);
  });

  it('creatableTypes en la raíz ofrece tipos concretos y bajo un padre solo los permitidos', () => {
    const p = world();
    p.schemas.push(schema('abstracto', { isAbstract: true }));
    expect(creatableTypes(p, null).map(s => s.id)).toEqual(['lugar', 'personaje', 'mago']);
    expect(creatableTypes(p, 'aria').map(s => s.id)).toEqual([]);
    expect(creatableTypes(p, 'reino').map(s => s.id)).toEqual(['lugar', 'personaje', 'mago']);
  });
});

describe('herencia de tipos', () => {
  it('allFields combina campos heredados y propios', () => {
    expect(allFields(world(), 'mago').map(f => f.id)).toEqual(['nombre', 'escuela']);
  });

  it('inheritanceCandidates excluye el propio tipo, sus subtipos y los de otra clase', () => {
    const p = world();
    p.schemas.push(schema('enemistad', {}, 'relationship'));
    expect(inheritanceCandidates(p, 'personaje').map(s => s.id)).toEqual(['lugar']);
    expect(inheritanceCandidates(p, 'mago').map(s => s.id)).toEqual(['lugar', 'personaje']);
  });

  it('canChangeSchemaKind solo permite cambiar tipos sin uso', () => {
    const p = world();
    expect(canChangeSchemaKind(p, 'personaje')).toBe(false);
    p.schemas.push(schema('libre'));
    expect(canChangeSchemaKind(p, 'libre')).toBe(true);
  });
});

describe('valores', () => {
  it('nodeLabel usa el campo título, indexado por id', () => {
    const p = world();
    expect(nodeLabel(p, p.nodes[2])).toBe('Aria');
    expect(nodeLabel(p, p.nodes[0])).toBe('lugar');
  });

  it('fieldValue resuelve fórmulas por clave', () => {
    const fields = [
      field('f1', { key: 'nombre' }),
      field('f2', { key: 'edad' }),
      field('f3', { type: 'computed', formula: '{nombre} ({edad})' }),
    ];
    expect(fieldValue(fields[2], { f1: 'Aria', f2: 30 }, fields)).toBe('Aria (30)');
    expect(fieldValue(fields[0], { f1: 'Aria' }, fields)).toBe('Aria');
  });
});

describe('títulos de nodos y relaciones', () => {
  const p = () =>
    project({
      schemas: [
        schema('personaje', { fields: [field('nombre'), field('apodo')] }),
        schema('parentesco', { fields: [field('rnombre', { isTitle: true })] }, 'relationship'),
        schema('alianza', {}, 'relationship'),
      ],
      nodes: [node('a', 'personaje', null, { nombre: 'Achamán' }), node('b', 'personaje', null, { apodo: 'Guayota' })],
      relations: [
        { ...relationOf('r1', 'parentesco'), values: { rnombre: 'Hermanos' } },
        relationOf('r2', 'parentesco'),
        relationOf('r3', 'alianza'),
      ],
    });
  const relationOf = (id: string, typeId: string) => ({
    id,
    typeId,
    sourceId: 'a',
    targetId: 'b',
    values: {},
    createdAt: '2026-01-01',
    reverseName: '',
    kinshipId: null,
    kinshipNeutral: false,
  });

  it('sin campo título, se usa el primer campo de texto con valor', () => {
    const world = p();
    expect(nodeLabel(world, world.nodes[0])).toBe('Achamán');
    expect(nodeLabel(world, world.nodes[1])).toBe('Guayota');
  });

  it('una relación muestra su nombre propio y, si no tiene, el de su tipo', () => {
    const world = p();
    expect(relationLabel(world, world.relations[0])).toBe('Hermanos');
    expect(relationLabel(world, world.relations[1])).toBe('parentesco');
    expect(relationLabel(world, world.relations[2])).toBe('alianza');
  });
});

describe('textos de atributo por tipo', () => {
  it('{tipo} se sustituye por el nombre del tipo', () => {
    expect(fieldText('Nombre del {tipo}', 'Personaje')).toBe('Nombre del Personaje');
    expect(fieldText('Nombre del { Tipo }', 'Lugar')).toBe('Nombre del Lugar');
    expect(fieldText('Sin marcador', 'Lugar')).toBe('Sin marcador');
    expect(fieldText('Nombre del {tipo}', undefined)).toBe('Nombre del');
  });
});

describe('papeles de una relación', () => {
  const p = () =>
    project({
      schemas: [
        schema('t', { fields: [field('nombre', { isTitle: true })] }),
        schema('venera', { directed: true, inverseName: 'Venerado por' }, 'relationship'),
        schema('parentesco', { directed: true, fields: [field('rnombre', { isTitle: true })] }, 'relationship'),
        schema('amistad', {}, 'relationship'),
      ],
      nodes: [node('a', 't'), node('b', 't')],
      relations: [
        { ...relationOf('r1', 'venera'), reverseName: '' },
        { ...relationOf('r2', 'parentesco'), values: { rnombre: 'Tía' }, reverseName: 'Sobrina' },
        { ...relationOf('r3', 'parentesco'), values: { rnombre: 'Hermanos' } },
        relationOf('r4', 'amistad'),
      ],
    });
  const relationOf = (id: string, typeId: string) => ({
    id,
    typeId,
    sourceId: 'a',
    targetId: 'b',
    values: {},
    createdAt: '2026',
    reverseName: '',
    kinshipId: null,
    kinshipNeutral: false,
  });

  it('usa el nombre inverso del tipo, el de la relación o el mismo nombre', () => {
    const w = p();
    expect(relationRole(w, w.relations[0], 'source')).toBe('venera');
    expect(relationRole(w, w.relations[0], 'target')).toBe('Venerado por');
    expect(relationRole(w, w.relations[1], 'target')).toBe('Sobrina');
    expect(relationRole(w, w.relations[2], 'target')).toBe('Hermanos');
    expect(relationRole(w, w.relations[3], 'target')).toBe('amistad');
  });
});
