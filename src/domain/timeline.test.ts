import { describe, expect, it } from 'vitest';
import { field, node, project, relation, schema } from '../test/fixtures';
import { groupByYear, timelineEvents } from './timeline';

const p = project({
  schemas: [
    schema('persona', {
      fields: [
        field('nombre', { isTitle: true }),
        field('nace', { label: 'Nacimiento', type: 'date' }),
        field('muere', { label: 'Muerte', type: 'date' }),
      ],
    }),
    schema('boda', { fields: [field('cuando', { label: 'Fecha', type: 'date' })] }, 'relationship'),
  ],
  nodes: [
    node('ana', 'persona', null, { nombre: 'Ana', nace: '1040-03-02', muere: '1090-02-31' }),
    node('luis', 'persona', null, { nombre: 'Luis', nace: '-0012-01-01' }),
    node('eva', 'persona', null, { nombre: 'Eva', nace: 'hace mucho' }),
  ],
  relations: [{ ...relation('r1', 'boda', 'ana', 'luis'), values: { cuando: '1060-05-01' } }],
});

describe('timelineEvents', () => {
  it('ordena las fechas de nodos y relaciones, con años negativos, y marca las que no existen', () => {
    const events = timelineEvents(p);
    expect(events.map(e => `${e.label}/${e.fieldLabel}/${e.date.year}`)).toEqual([
      'Luis/Nacimiento/-12',
      'Ana/Nacimiento/1040',
      'Ana — Luis/Fecha/1060',
      'Ana/Muerte/1090',
    ]);
    expect(events.find(e => e.fieldId === 'muere')!.valid).toBe(false);
    expect(events.find(e => e.owner.kind === 'relation')!.owner.id).toBe('r1');
  });

  it('agrupa por año con los años vacíos que separan cada grupo', () => {
    const years = groupByYear(timelineEvents(p));
    expect(years.map(y => [y.year, y.gap, y.events.length])).toEqual([
      [-12, 0, 1],
      [1040, 1051, 1],
      [1060, 19, 1],
      [1090, 29, 1],
    ]);
  });
});
