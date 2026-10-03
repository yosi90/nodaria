import { describe, expect, it } from 'vitest';
import { field, node, project, relation, schema } from '../test/fixtures';
import { defaultKinship, kinshipIssues, kinshipRoles, nodeGender } from './kinship';
import { addNodeUnder } from './operations';
import { relationLabel, relationRole } from './selectors';
import { creatableTypesIn, structureChildren, structureLenses } from './structure';

const world = () =>
  project({
    schemas: [
      schema('personaje', { fields: [field('nombre', { isTitle: true }), field('genero', { type: 'gender' })] }),
      schema(
        'familia',
        {
          genealogical: true,
          directed: true,
          reciprocal: true,
          sourceTypeIds: ['personaje'],
          targetTypeIds: ['personaje'],
        },
        'relationship',
      ),
    ],
    nodes: [
      node('acha', 'personaje', null, { nombre: 'Achamán', genero: 'm' }),
      node('ota', 'personaje', null, { nombre: 'Guayota', genero: 'f' }),
      node('arnold', 'personaje', null, { nombre: 'Arnold' }),
    ],
    relations: [
      { ...relation('r1', 'familia', 'acha', 'ota'), kinshipId: 'hermano' },
      { ...relation('r2', 'familia', 'arnold', 'acha'), kinshipId: 'progenitor' },
      { ...relation('r3', 'familia', 'ota', 'arnold'), kinshipId: 'hijo', kinshipNeutral: true },
    ],
  });

describe('parentesco', () => {
  it('el vocabulario por defecto es coherente', () => {
    expect(kinshipIssues(defaultKinship())).toEqual([]);
  });

  it('cada extremo recibe su término con el género del nodo', () => {
    const p = world();
    expect(kinshipRoles(p, p.relations[0])).toEqual({ source: 'Hermano', target: 'Hermana' });
    expect(relationRole(p, p.relations[0], 'target')).toBe('Hermana');
    expect(relationLabel(p, p.relations[0])).toBe('Hermano');
  });

  it('sin género se usa el neutro; con «neutro» forzado, también', () => {
    const p = world();
    expect(nodeGender(p, p.nodes[2])).toBe('');
    expect(kinshipRoles(p, p.relations[1])).toEqual({ source: 'Progenitor/a', target: 'Hijo' });
    expect(kinshipRoles(p, p.relations[2])).toEqual({ source: 'Hijo/a', target: 'Progenitor/a' });
  });

  it('solo la ascendencia directa forma estructura', () => {
    const p = world();
    expect(structureLenses(p).map(l => l.id)).toContain('familia');
    const children = structureChildren(p, 'familia');
    expect(children.get('arnold')!.map(n => n.id)).toEqual(['acha', 'ota']);
    expect(children.get('acha') ?? []).toEqual([]);
  });

  it('crear «dentro de» un ascendiente crea un descendiente directo', () => {
    const p = world();
    expect(creatableTypesIn(p, 'familia', 'arnold').map(s => s.id)).toEqual(['personaje']);
    const next = addNodeUnder(p, 'personaje', 'familia', 'arnold', 'nuevo');
    const created = next.relations.at(-1)!;
    expect(created.sourceId).toBe('nuevo');
    expect(created.targetId).toBe('arnold');
    expect(created.kinshipId).toBe('hijo');
  });
});
