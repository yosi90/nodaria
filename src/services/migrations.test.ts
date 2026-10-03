import { describe, expect, it } from 'vitest';
import { PROJECT_FORMAT_VERSION } from '../domain/constants';
import { migrateProject } from './migrations';
import { parseProject, serializeProject } from './storage';

/** Proyecto tal como lo guardaba la versión 2: valores indexados por clave y sin `formatVersion`. */
const legacy = () => ({
  id: 'old',
  name: 'Mundo antiguo',
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
});

describe('importación y exportación', () => {
  it('exportar e importar conserva el proyecto', () => {
    const p = migrateProject(legacy() as never);
    const { project, issues } = parseProject(serializeProject(p));
    expect(project).toEqual(p);
    expect(issues).toEqual([]);
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
});
