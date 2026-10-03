import { describe, expect, it } from 'vitest';
import { field, node, project, relation, schema } from '../test/fixtures';
import { repairProject } from './integrity';
import type { FieldDefinition } from './types';

describe('repairProject', () => {
  it('devuelve el mismo objeto si el proyecto está sano', () => {
    const p = project({ schemas: [schema('t')], nodes: [node('a', 't'), node('b', 't', 'a')] });
    const result = repairProject(p);
    expect(result.project).toBe(p);
    expect(result.issues).toEqual([]);
  });

  it('rompe ciclos de jerarquía y mueve a la raíz los nodos con padre inexistente', () => {
    const p = project({
      schemas: [schema('t')],
      nodes: [node('a', 't', 'b'), node('b', 't', 'a'), node('c', 't', 'fantasma'), node('d', 't', 'd')],
    });
    const { project: fixed, issues } = repairProject(p);
    const parent = (id: string) => fixed.nodes.find(n => n.id === id)!.parentId;
    expect([parent('a'), parent('b')]).toContain(null);
    expect(parent('c')).toBeNull();
    expect(parent('d')).toBeNull();
    expect(fixed.nodes).toHaveLength(4);
    expect(issues).toHaveLength(3);
  });

  it('rompe ciclos de herencia y quita padres de otra clase', () => {
    const p = project({
      schemas: [
        schema('a', { parentTypeId: 'b' }),
        schema('b', { parentTypeId: 'a' }),
        schema('r', { parentTypeId: 'a' }, 'relationship'),
      ],
    });
    const { project: fixed } = repairProject(p);
    const parent = (id: string) => fixed.schemas.find(s => s.id === id)!.parentTypeId;
    expect([parent('a'), parent('b')]).toContain(null);
    expect(parent('r')).toBeNull();
  });

  it('limpia referencias a tipos inexistentes y relaciones con extremos inexistentes', () => {
    const p = project({
      schemas: [
        schema('t', { allowedChildTypeIds: ['t', 'borrado'], fields: [field('f', { referenceTypeIds: ['borrado'] })] }),
        schema('r', { sourceTypeIds: ['borrado'] }, 'relationship'),
      ],
      nodes: [node('a', 't')],
      relations: [relation('r1', 'r', 'a', 'fantasma')],
    });
    const { project: fixed } = repairProject(p);
    expect(fixed.schemas[0].allowedChildTypeIds).toEqual(['t']);
    expect((fixed.schemas[0].fields[0] as FieldDefinition).referenceTypeIds).toEqual([]);
    expect(fixed.schemas[1].sourceTypeIds).toEqual([]);
    expect(fixed.relations).toEqual([]);
  });
});
