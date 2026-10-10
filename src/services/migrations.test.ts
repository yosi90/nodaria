import { describe, expect, it } from 'vitest';
import { PROJECT_FORMAT_VERSION } from '../domain/constants';
import { migrateProject } from './migrations';
import { parseProject, serializeProject } from './storage';
import { field } from '../test/fixtures';
import { FIELD_TYPES } from '../domain/constants';

/** Proyecto tal como lo guardaba la versión 2: valores indexados por clave y sin `formatVersion`. */
const legacy = () => ({
  id: 'old',
  name: 'Mundo antiguo',
  createdAt: '2025-01-01T00:00:00.000Z',
  updatedAt: '2025-01-01T00:00:00.000Z',
  schemas: [
    {
      id: 'ser',
      name: 'Ser',
      kind: 'entity',
      color: '#fff',
      fields: [{ id: 'field_nombre', key: 'nombre', label: 'Nombre', type: 'text', isTitle: true }],
    },
    {
      id: 'personaje',
      name: 'Personaje',
      kind: 'entity',
      parentTypeId: 'ser',
      color: '#fff',
      fields: [{ id: 'field_edad', key: 'edad', label: 'Edad', type: 'number' }],
    },
  ],
  nodes: [{ id: 'aria', typeId: 'personaje', values: { nombre: 'Aria', edad: 30, huerfano: 'x' } }],
  relations: [],
});

describe('migrateProject', () => {
  it('limpia restricciones de negativos en tipos no numéricos sin cambiar sus valores', () => {
    const p = migrateProject(legacy() as never);
    const fields = FIELD_TYPES.map(([type]) => field(type, { type, nonNegative: true }));
    p.schemas[1].fields = fields;
    p.fieldLibrary = fields;
    const migrated = migrateProject(p);
    for (const [type] of FIELD_TYPES) {
      const expected = type === 'number' || type === 'computed';
      expect(migrated.schemas[1].fields.find(f => 'id' in f && f.id === type)).toMatchObject({ nonNegative: expected });
      expect(migrated.fieldLibrary.find(f => f.id === type)).toMatchObject({ nonNegative: expected });
    }
    expect(migrated.nodes).toEqual(p.nodes);
  });
  it('v2 → v3 reindexa los valores por id de campo, incluidos los heredados', () => {
    const p = migrateProject(legacy() as never);
    expect(p.formatVersion).toBe(PROJECT_FORMAT_VERSION);
    expect(p.nodes[0].values).toEqual({ field_nombre: 'Aria', field_edad: 30, huerfano: 'x' });
    expect(p.nodes[0].parentId).toBeNull();
    expect(p.schemas[0].allowedChildTypeIds).toEqual([]);
  });

  it('no vuelve a migrar un proyecto ya actualizado', () => {
    const once = migrateProject(legacy() as never);
    expect(migrateProject(once)).toEqual(once);
  });

  it('los proyectos antiguos dejan desactivada la restricción de calculados', () => {
    const p = migrateProject(legacy() as never);
    expect(p.schemas[0].fields[0]).toMatchObject({ nonNegative: false });
  });

  it('migra el control antiguo de calculados y permite desactivarlo después', () => {
    const p = migrateProject(legacy() as never);
    const oldAge = { ...field('edad', { type: 'computed' }), computedNonNegative: true };
    delete (oldAge as Partial<typeof oldAge>).nonNegative;
    p.schemas[1].fields.push(oldAge);
    p.fieldLibrary.push({ ...oldAge, id: 'shared' });
    const migrated = migrateProject(p);
    expect(migrated.schemas[1].fields.at(-1)).toMatchObject({ nonNegative: true });
    expect(migrated.fieldLibrary[0]).toMatchObject({ nonNegative: true });
    migrated.fieldLibrary[0].nonNegative = false;
    expect(migrateProject(migrated).fieldLibrary[0].nonNegative).toBe(false);
  });
});

describe('importación y exportación', () => {
  it('exportar e importar conserva el proyecto', () => {
    const p = migrateProject(legacy() as never);
    const { project, issues } = parseProject(serializeProject(p));
    expect(project).toEqual(p);
    expect(issues).toEqual([]);
  });

  it('conserva la restricción del calculado propio y compartido al exportar e importar', () => {
    const p = migrateProject(legacy() as never);
    const age = field('calculated-age', { type: 'computed', formula: '{edad(nacimiento)}', nonNegative: true });
    p.schemas[1].fields.push(age);
    p.fieldLibrary.push({ ...age, id: 'shared-age' });
    const restored = parseProject(serializeProject(p)).project;
    expect(restored.schemas[1].fields.at(-1)).toMatchObject({ nonNegative: true });
    expect(restored.fieldLibrary[0]).toMatchObject({ nonNegative: true });
  });

  it('acepta exportaciones antiguas envueltas y proyectos sueltos', () => {
    const wrapped = parseProject(JSON.stringify({ app: 'Nodaria', version: 2, project: legacy() }));
    const bare = parseProject(JSON.stringify(legacy()));
    expect(wrapped.project.nodes[0].values.field_nombre).toBe('Aria');
    expect(bare.project).toEqual(wrapped.project);
  });

  it('rechaza archivos que no son proyectos', () => {
    expect(() => parseProject('[1,2,3]')).toThrow();
    expect(() => parseProject('{"nodes": 3}')).toThrow();
    expect(() => parseProject('no es json')).toThrow();
  });

  it('repara al importar y devuelve las correcciones', () => {
    const broken = legacy();
    broken.nodes.push({ id: 'b', typeId: 'ser', parentId: 'b', values: {} } as never);
    const { project, issues } = parseProject(JSON.stringify(broken));
    expect(project.nodes[1].parentId).toBeNull();
    expect(issues).toHaveLength(1);
  });

  it('conserva la posición fijada de v3 en la disposición que estaba activa', () => {
    const p = migrateProject({
      ...legacy(),
      formatVersion: 3,
      view: { layout: 'force' },
      nodes: [
        { id: 'n1', typeId: 't', parentId: null, values: {}, createdAt: '2026', position: { x: 3, y: 4 }, notes: '' },
      ],
    } as never);
    expect(p.nodes[0].positions).toEqual({ force: { x: 3, y: 4 } });
    expect(p.formatVersion).toBe(4);
  });
});
