import { describe, expect, it } from 'vitest';
import { prepareProject } from './storage';
import { mergeProjects } from './merge';
import { node, project, relation, schema } from '../test/fixtures';

const base = project({
  id: 'p',
  name: 'Novela',
  schemas: [schema('persona'), schema('amistad', {}, 'relationship')],
  nodes: [node('ana', 'persona', null, { title: 'Ana' }), node('luis', 'persona', null, { title: 'Luis' })],
  relations: [relation('r1', 'amistad', 'ana', 'luis')],
});
const withNode = (p: typeof base, id: string, patch: Partial<(typeof base.nodes)[number]>) => ({
  ...p,
  nodes: p.nodes.map(n => (n.id === id ? { ...n, ...patch } : n)),
});

describe('mergeProjects', () => {
  it('junta cambios en elementos distintos sin conflictos', () => {
    const local = withNode(base, 'ana', { notes: 'Protagonista' });
    const remote = { ...withNode(base, 'luis', { notes: 'Su hermano' }), name: 'Novela (2.ª)' };
    const { project: merged, conflicts } = mergeProjects(base, local, remote);
    expect(conflicts).toEqual([]);
    expect(merged.name).toBe('Novela (2.ª)');
    expect(merged.nodes.find(n => n.id === 'ana')!.notes).toBe('Protagonista');
    expect(merged.nodes.find(n => n.id === 'luis')!.notes).toBe('Su hermano');
  });

  it('junta atributos distintos del mismo nodo y elementos añadidos en los dos lados', () => {
    const ana = base.nodes[0];
    const local = {
      ...withNode(base, 'ana', { values: { ...ana.values, edad: 30 } }),
      nodes: [...withNode(base, 'ana', { values: { ...ana.values, edad: 30 } }).nodes, node('eva', 'persona')],
    };
    const remote = {
      ...withNode(base, 'ana', { values: { ...ana.values, ciudad: 'Vigo' } }),
      nodes: [...withNode(base, 'ana', { values: { ...ana.values, ciudad: 'Vigo' } }).nodes, node('teo', 'persona')],
    };
    const { project: merged, conflicts } = mergeProjects(base, local, remote);
    expect(conflicts).toEqual([]);
    expect(merged.nodes.find(n => n.id === 'ana')!.values).toMatchObject({ edad: 30, ciudad: 'Vigo' });
    expect(merged.nodes.map(n => n.id)).toEqual(['ana', 'luis', 'teo', 'eva']);
  });

  it('el mismo dato cambiado en los dos lados es un conflicto y gana el grupo', () => {
    const local = withNode(base, 'ana', { notes: 'Mía' });
    const remote = withNode(base, 'ana', { notes: 'Suya' });
    const { project: merged, conflicts } = mergeProjects(base, local, remote);
    expect(conflicts).toEqual(['proyecto.nodes[ana].notes']);
    expect(merged.nodes[0].notes).toBe('Suya');
  });

  it('borrar lo que el otro no tocó se aplica; borrar lo que el otro cambió lo conserva', () => {
    const removed = { ...base, nodes: base.nodes.filter(n => n.id !== 'luis'), relations: [] };
    expect(mergeProjects(base, removed, base).project.nodes.map(n => n.id)).toEqual(['ana']);
    const edited = withNode(base, 'luis', { notes: 'Importante' });
    const result = mergeProjects(base, removed, edited);
    expect(result.project.nodes.map(n => n.id)).toEqual(['ana', 'luis']);
    expect(result.conflicts).toEqual(['proyecto.nodes[luis]']);
  });

  it('conserva la vista de aquí y respeta el orden que solo cambió aquí', () => {
    const local = { ...base, view: { ...base.view, layout: 'force' as const }, nodes: [...base.nodes].reverse() };
    const remote = { ...base, name: 'Otra' };
    const { project: merged } = mergeProjects(base, local, remote);
    expect(merged.view.layout).toBe('force');
    expect(merged.nodes.map(n => n.id)).toEqual(['luis', 'ana']);
    expect(merged.id).toBe('p');
  });

  it('la reparación posterior corta un ciclo que forman dos movimientos a la vez', () => {
    const local = withNode(base, 'ana', { parentId: 'luis' });
    const remote = withNode(base, 'luis', { parentId: 'ana' });
    const { project: merged, conflicts } = mergeProjects(base, local, remote);
    expect(conflicts).toEqual([]);
    const repaired = prepareProject(merged).project;
    const parents = Object.fromEntries(repaired.nodes.map(n => [n.id, n.parentId]));
    expect(parents.ana === 'luis' && parents.luis === 'ana').toBe(false);
  });
});
