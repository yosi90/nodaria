import { describe, expect, it } from 'vitest';
import { field, node, project, schema } from '../../test/fixtures';
import { forceLayout, NODE_W, type Link } from './layout';

/*
 * Un país con ciudades dentro; personajes vinculados a su ciudad solo por un atributo de referencia
 * (no por jerarquía). Cada grupo de personajes debe quedar bajo su ciudad, sin mezclarse con los de
 * otra: los grupos ocupan franjas horizontales que no se solapan.
 */
const p = project({
  schemas: [
    schema('pais', { name: 'País', allowedChildTypeIds: ['ciudad'] }),
    schema('ciudad', { name: 'Ciudad' }),
    schema('per', { name: 'Personaje', fields: [field('origen', { type: 'nodeRef', referenceTypeIds: ['ciudad'] })] }),
  ],
  nodes: [
    node('imperio', 'pais'),
    node('gorthakruk', 'ciudad', 'imperio'),
    node('ahmaru', 'ciudad', 'imperio'),
    node('caim', 'ciudad', 'imperio'),
    ...['dragga', 'grugnak', 'drokka', 'kunoa', 'obkea'].map(id => node(id, 'per', null, { origen: 'gorthakruk' })),
    node('araluna', 'per', null, { origen: 'ahmaru' }),
    node('guayota', 'per', null, { origen: 'caim' }),
  ],
});

const links: Link[] = [
  { a: 'imperio', b: 'gorthakruk' },
  { a: 'imperio', b: 'ahmaru' },
  { a: 'imperio', b: 'caim' },
  ...p.nodes.filter(n => n.typeId === 'per').map(n => ({ a: n.id, b: String(n.values.origen) })),
];

describe('force layout grouping', () => {
  it('keeps each group of characters under its own city, without interleaving groups', () => {
    const pos = forceLayout(p, links);
    const groups = ['gorthakruk', 'ahmaru', 'caim'].map(city => {
      const members = p.nodes.filter(n => n.typeId === 'per' && n.values.origen === city);
      const xs = members.map(n => pos.get(n.id)!.x);
      // Todos por debajo de su ciudad.
      members.forEach(n => expect(pos.get(n.id)!.y, `${n.id} bajo ${city}`).toBeGreaterThan(pos.get(city)!.y));
      // La ciudad está sobre su grupo (dentro de su franja).
      const cityX = pos.get(city)!.x;
      expect(cityX).toBeGreaterThanOrEqual(Math.min(...xs) - NODE_W / 2);
      expect(cityX).toBeLessThanOrEqual(Math.max(...xs) + NODE_W / 2);
      return { city, min: Math.min(...xs), max: Math.max(...xs) };
    });
    // Las franjas de los grupos no se solapan.
    groups.sort((a, b) => a.min - b.min);
    for (let i = 1; i < groups.length; i++) {
      expect(groups[i].min, `${groups[i].city} tras ${groups[i - 1].city}`).toBeGreaterThan(groups[i - 1].max);
    }
  });
});
