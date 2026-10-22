import { describe, expect, it } from 'vitest';
import { field, node, project, relation, schema } from '../test/fixtures';
import { answerParts, worldContext } from './aiWorld';
import { createAgendaEntry } from './agenda';

const p = project({
  name: 'Novela',
  schemas: [
    schema('persona', {
      name: 'Persona',
      fields: [
        field('nombre', { label: 'Nombre', isTitle: true }),
        field('motivo', { label: 'Motivación' }),
        field('aliado', { label: 'Aliado', type: 'nodeRef' }),
        field('viva', { label: 'Viva', type: 'boolean' }),
      ],
    }),
    schema('rival', { name: 'Rival de' }, 'relationship'),
  ],
  nodes: [
    {
      ...node('ana', 'persona', null, { nombre: 'Ana', motivo: 'Venganza', aliado: 'luis', viva: true }),
      notes: 'Odia a [[Luis]].',
    },
    { ...node('luis', 'persona', 'ana', { nombre: 'Luis' }), notes: 'x'.repeat(5000) },
    node('eva', 'persona', null, { nombre: 'Eva' }),
  ],
  relations: [relation('r1', 'rival', 'ana', 'luis')],
});

describe('worldContext', () => {
  it('manda tipos, nodos con valores legibles y relaciones, con identificadores cortos', () => {
    const { context, refs } = worldContext(p);
    expect(context.partial).toBe(false);
    expect(context.types.map(t => [t.name, t.kind])).toEqual([
      ['Persona', 'entidad'],
      ['Rival de', 'relación'],
    ]);
    const ana = context.nodes.find(n => n.title === 'Ana')!;
    const luis = context.nodes.find(n => n.title === 'Luis')!;
    expect(refs.nodes[ana.id]).toBe('ana');
    expect(ana.values).toEqual({ Motivación: 'Venganza', Aliado: luis.id, Viva: 'Sí' });
    expect(ana.notes).toBe('Odia a [[Luis]].');
    expect(luis.parent).toBe(ana.id);
    expect(context.relations).toEqual([
      { type: 'Rival de', from: ana.id, to: luis.id, fromRole: '', toRole: '', values: {} },
    ]);
  });

  it('si no cabe, recorta las notas y después deja fuera los nodos menos conectados', () => {
    const clipped = worldContext(p, 4000).context;
    expect(clipped.partial).toBe(true);
    expect(clipped.nodes).toHaveLength(3);
    expect(clipped.nodes.find(n => n.title === 'Luis')!.notes.length).toBeLessThan(2100);
    const tiny = worldContext(p, 520).context;
    expect(tiny.nodes.length).toBeLessThan(3);
    expect(tiny.nodes[0].title).toBe('Ana');
    expect(JSON.stringify(tiny).length).toBeLessThanOrEqual(520);
  });
});

describe('answerParts', () => {
  it('separa el texto de las menciones a nodos', () => {
    expect(answerParts('Sí: [[n2]] y [[n10]].')).toEqual([
      { kind: 'text', text: 'Sí: ' },
      { kind: 'node', ref: 'n2' },
      { kind: 'text', text: ' y ' },
      { kind: 'node', ref: 'n10' },
      { kind: 'text', text: '.' },
    ]);
  });
});

describe('worldContext con la agenda', () => {
  const withAgenda = {
    ...p,
    agenda: [
      createAgendaEntry('e1', { kind: 'deadline', title: 'Capítulo 3', date: '2026-11-15', nodeIds: ['luis'] }, 'x'),
      createAgendaEntry('e2', { kind: 'note', title: 'Idea', date: '2026-11-01', description: 'Con [[Ana]]' }, 'x'),
    ],
  };

  it('por defecto no sale la agenda', () => {
    expect(worldContext(withAgenda).context.agenda).toBeUndefined();
  });

  it('con permiso va en fechas reales y con los nodos como n1, n2…', () => {
    const { context, refs } = worldContext(withAgenda, undefined, { includeAgenda: true });
    expect(context.agenda!.today).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    const [idea, cap] = context.agenda!.entries;
    expect(idea).toMatchObject({ kind: 'Nota', title: 'Idea', date: '2026-11-01', done: null });
    expect(refs.nodes[idea.nodes[0]]).toBe('ana');
    expect(cap).toMatchObject({ kind: 'Entrega', done: false });
    expect(refs.nodes[cap.nodes[0]]).toBe('luis');
  });
});
