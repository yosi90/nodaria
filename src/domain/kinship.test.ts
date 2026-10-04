import { describe, expect, it } from 'vitest';
import { field, node, project, relation, schema } from '../test/fixtures';
import {
  defaultKinship,
  derivedKinship,
  impliedKinship,
  isImpliedKinship,
  kinshipConflicts,
  kinshipIssues,
  kinshipRoles,
  nodeGender,
} from './kinship';
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

describe('parentesco deducido', () => {
  const fam = () =>
    project({
      schemas: [schema('t'), schema('familia', { genealogical: true }, 'relationship')],
      nodes: ['abuelo', 'madre', 'tia', 'hijo', 'hija', 'primo'].map(id => node(id, 't')),
      relations: [
        { ...relation('r1', 'familia', 'abuelo', 'madre'), kinshipId: 'progenitor' },
        { ...relation('r2', 'familia', 'abuelo', 'tia'), kinshipId: 'progenitor' },
        { ...relation('r3', 'familia', 'madre', 'hijo'), kinshipId: 'progenitor' },
        { ...relation('r4', 'familia', 'hija', 'madre'), kinshipId: 'hijo' },
        { ...relation('r5', 'familia', 'tia', 'primo'), kinshipId: 'progenitor' },
        // explícita pero deducible: no debe dibujarse
        { ...relation('r6', 'familia', 'abuelo', 'hijo'), kinshipId: 'abuelo' },
      ],
    });
  it('deduce abuelos, hermanos, tíos, sobrinos y primos de la ascendencia directa', () => {
    const d = derivedKinship(fam(), 'familia');
    const has = (s: string, t: string, term: string) =>
      d.some(x => x.sourceId === s && x.targetId === t && x.termId === term);
    expect(has('abuelo', 'hijo', 'abuelo')).toBe(true);
    expect(has('hijo', 'abuelo', 'nieto')).toBe(true);
    expect(has('hijo', 'hija', 'hermano')).toBe(true);
    expect(has('madre', 'tia', 'hermano')).toBe(true);
    expect(has('tia', 'hijo', 'tio')).toBe(true);
    expect(has('hijo', 'tia', 'sobrino')).toBe(true);
    expect(has('hijo', 'primo', 'primo')).toBe(true);
    expect(has('madre', 'hijo', 'hermano')).toBe(false);
  });
  it('reconoce las relaciones explícitas que el árbol ya deduce', () => {
    const p = fam();
    const implied = impliedKinship(p, 'familia');
    expect(
      isImpliedKinship(
        implied,
        p.relations.find(r => r.id === 'r6')!,
        p,
      ),
    ).toBe(true);
    expect(
      isImpliedKinship(
        implied,
        p.relations.find(r => r.id === 'r1')!,
        p,
      ),
    ).toBe(false);
  });
});

describe('conflictos de parentesco', () => {
  it('detecta las relaciones que no cuadran con la ascendencia registrada', () => {
    const p = project({
      schemas: [schema('t'), schema('familia', { genealogical: true }, 'relationship')],
      nodes: ['dragga', 'drokka', 'kunoa'].map(id => node(id, 't')),
      relations: [
        { ...relation('a', 'familia', 'dragga', 'drokka'), kinshipId: 'progenitor' },
        // al revés: Kunoa «progenitora» de Drokka
        { ...relation('b', 'familia', 'kunoa', 'drokka'), kinshipId: 'progenitor' },
        { ...relation('c', 'familia', 'dragga', 'kunoa'), kinshipId: 'abuelo' },
      ],
    });
    const conflicts = kinshipConflicts(p, 'familia');
    expect(conflicts.map(c => c.relation.id)).toEqual(['c']);
    expect(conflicts[0]).toMatchObject({ expected: 2, actual: 0 });
    // Invertida, todo cuadra
    const fixed = {
      ...p,
      relations: p.relations.map(r => (r.id === 'b' ? { ...r, sourceId: 'drokka', targetId: 'kunoa' } : r)),
    };
    expect(kinshipConflicts(fixed, 'familia')).toEqual([]);
  });
});
