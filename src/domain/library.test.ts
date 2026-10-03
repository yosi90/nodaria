import { describe, expect, it } from 'vitest';
import { field, node, project, schema } from '../test/fixtures';
import { repairProject } from './integrity';
import {
  addLibraryField,
  deleteLibraryField,
  linkField,
  shareField,
  unlinkField,
  usersOfLibraryField,
} from './library';
import { deleteSchema } from './operations';
import { allFields, nodeLabel } from './selectors';

const world = () =>
  project({
    fieldLibrary: [field('nombre', { label: 'Nombre', isTitle: true })],
    schemas: [
      schema('personaje', { fields: [{ ref: 'nombre' }, field('edad', { type: 'number' })] }),
      schema('mago', { parentTypeId: 'personaje' }),
      schema('lugar', { fields: [{ ref: 'nombre' }] }),
    ],
    nodes: [
      node('aria', 'mago', null, { nombre: 'Aria', edad: 30 }),
      node('alta', 'lugar', null, { nombre: 'Ciudad Alta' }),
    ],
  });

describe('biblioteca de atributos', () => {
  it('un atributo compartido se resuelve en todos los tipos que lo vinculan, con herencia', () => {
    const p = world();
    expect(allFields(p, 'mago').map(f => f.id)).toEqual(['nombre', 'edad']);
    expect(allFields(p, 'lugar').map(f => f.id)).toEqual(['nombre']);
    expect(nodeLabel(p, p.nodes[0])).toBe('Aria');
    expect(usersOfLibraryField(p, 'nombre').map(s => s.id)).toEqual(['personaje', 'lugar']);
  });

  it('compartir un atributo propio conserva su id y, por tanto, los valores', () => {
    const p = shareField(world(), 'personaje', 'edad');
    expect(p.fieldLibrary.map(f => f.id)).toEqual(['nombre', 'edad']);
    expect(p.schemas[0].fields).toEqual([{ ref: 'nombre' }, { ref: 'edad' }]);
    expect(p.nodes[0].values.edad).toBe(30);
    const linked = linkField(p, 'lugar', 'edad');
    expect(allFields(linked, 'lugar').map(f => f.id)).toEqual(['nombre', 'edad']);
    expect(linkField(linked, 'lugar', 'edad')).toBe(linked);
  });

  it('desvincular borra el valor solo donde el atributo deja de existir', () => {
    const p = unlinkField(world(), 'lugar', 'nombre');
    expect(p.nodes.find(n => n.id === 'alta')!.values).toEqual({});
    expect(p.nodes.find(n => n.id === 'aria')!.values.nombre).toBe('Aria');
  });

  it('borrar un atributo de la biblioteca quita vínculos y valores', () => {
    const p = deleteLibraryField(world(), 'nombre');
    expect(p.fieldLibrary).toEqual([]);
    expect(p.schemas.every(s => !s.fields.some(f => 'ref' in f))).toBe(true);
    expect(p.nodes.every(n => !('nombre' in n.values))).toBe(true);
  });

  it('borrar un tipo no toca los valores de un atributo compartido en otros tipos', () => {
    const p = deleteSchema(world(), 'personaje', 'lift');
    expect(p.nodes.find(n => n.id === 'alta')!.values.nombre).toBe('Ciudad Alta');
  });

  it('las claves nuevas no chocan con las de la biblioteca', () => {
    const p = addLibraryField(addLibraryField(world()));
    expect(new Set(p.fieldLibrary.map(f => f.key)).size).toBe(3);
  });

  it('la reparación elimina vínculos a atributos inexistentes', () => {
    const p = world();
    p.schemas[0].fields.push({ ref: 'fantasma' });
    const { project: fixed, issues } = repairProject(p);
    expect(fixed.schemas[0].fields).toEqual([{ ref: 'nombre' }, expect.objectContaining({ id: 'edad' })]);
    expect(issues).toHaveLength(1);
  });
});

describe('claves repetidas', () => {
  it('un atributo compartido con la misma clave que uno propio del mismo tipo no lo oculta', () => {
    const p = project({
      fieldLibrary: [field('shared_nombre', { key: 'nombre', label: 'Nombre' })],
      schemas: [
        schema('deidad', {
          fields: [field('deidad_nombre', { key: 'nombre', isTitle: true }), { ref: 'shared_nombre' }],
        }),
      ],
      nodes: [node('aurel', 'deidad', null, { deidad_nombre: 'Aurel' })],
    });
    expect(allFields(p, 'deidad').map(f => f.id)).toEqual(['deidad_nombre', 'shared_nombre']);
    expect(nodeLabel(p, p.nodes[0])).toBe('Aurel');
  });

  it('un subtipo sigue sustituyendo al atributo heredado con la misma clave', () => {
    const p = project({
      schemas: [
        schema('base', { fields: [field('b_nombre', { key: 'nombre' })] }),
        schema('sub', { parentTypeId: 'base', fields: [field('s_nombre', { key: 'nombre' })] }),
      ],
    });
    expect(allFields(p, 'sub').map(f => f.id)).toEqual(['s_nombre']);
  });
});
