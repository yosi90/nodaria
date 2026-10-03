import { describe, expect, it } from 'vitest';
import { field, node, project, schema } from '../test/fixtures';
import { nodeConnections } from './connections';
import { extractMentions, mentionedNodes, mentioningNodes, segmentNotes } from './notes';
import { addNodeUnder } from './operations';
import { referenceCandidates, referenceFields, referenceLinks } from './references';
import { creatableTypesIn, FIELD_LENS, structureChildren, structureLenses } from './structure';

const world = () =>
  project({
    schemas: [
      schema('ciudad', { fields: [field('cnombre', { isTitle: true })] }),
      schema('personaje', {
        fields: [
          field('pnombre', { isTitle: true }),
          field('ciudad_ref', { label: 'Ciudad', type: 'nodeRef', referenceTypeIds: ['ciudad'] }),
          field('aliados', { label: 'Aliados', type: 'nodeRefs', referenceTypeIds: ['personaje'] }),
        ],
      }),
      schema('mago', { parentTypeId: 'personaje' }),
    ],
    nodes: [
      node('alta', 'ciudad', null, { cnombre: 'Ciudad Alta' }),
      node('aria', 'personaje', null, { pnombre: 'Aria', ciudad_ref: 'alta', aliados: ['tor', 'fantasma'] }),
      {
        ...node('tor', 'mago', null, { pnombre: 'Tor', ciudad_ref: 'alta' }),
        notes: 'Conoce a [[Aria]] y teme a [[Noctra]].',
      },
    ],
  });

describe('referencias como vínculos', () => {
  it('lista los atributos de referencia y los vínculos que generan (sin ids rotos)', () => {
    const p = world();
    expect(referenceFields(p).map(r => r.name)).toEqual(['Ciudad', 'Aliados']);
    expect(referenceLinks(p)).toEqual([
      { fieldId: 'ciudad_ref', sourceId: 'aria', targetId: 'alta' },
      { fieldId: 'aliados', sourceId: 'aria', targetId: 'tor' },
      { fieldId: 'ciudad_ref', sourceId: 'tor', targetId: 'alta' },
    ]);
  });

  it('los candidatos respetan los tipos permitidos, con herencia, y excluyen al propio nodo', () => {
    const p = world();
    const aliados = p.schemas[1].fields[2];
    expect(referenceCandidates(p, aliados, 'aria').map(n => n.id)).toEqual(['tor']);
    expect(referenceCandidates(p, p.schemas[1].fields[1]).map(n => n.id)).toEqual(['alta']);
  });

  it('un atributo de referencia es una estructura más en «Ver por»', () => {
    const p = world();
    const lens = structureLenses(p).find(l => l.id === FIELD_LENS + 'ciudad_ref');
    expect(lens?.name).toBe('Ciudad');
    const children = structureChildren(p, lens!.id);
    expect(children.get('alta')!.map(n => n.id)).toEqual(['aria', 'tor']);
    expect(children.get(null)!.map(n => n.id)).toEqual(['alta']);
  });

  it('crear «dentro de» una ciudad en esa estructura rellena el atributo', () => {
    const p = world();
    expect(creatableTypesIn(p, FIELD_LENS + 'ciudad_ref', 'alta').map(s => s.id)).toEqual(['personaje', 'mago']);
    expect(creatableTypesIn(p, FIELD_LENS + 'ciudad_ref', 'aria')).toEqual([]);
    const next = addNodeUnder(p, 'mago', FIELD_LENS + 'ciudad_ref', 'alta', 'nuevo');
    expect(next.nodes.find(n => n.id === 'nuevo')!.values.ciudad_ref).toBe('alta');
  });
});

describe('notas y menciones', () => {
  it('extrae y resuelve menciones sin distinguir mayúsculas ni acentos', () => {
    const p = world();
    expect(extractMentions('Ve a [[Ciudad Alta]] con [[aria]] y [[Ciudad Alta]]')).toEqual(['Ciudad Alta', 'aria']);
    const tor = p.nodes[2];
    expect(mentionedNodes(p, tor).map(n => n.id)).toEqual(['aria']);
    expect(mentioningNodes(p, p.nodes[1]).map(n => n.id)).toEqual(['tor']);
    const segments = segmentNotes(p, tor.notes);
    expect(
      segments.filter(s => s.kind === 'mention').map(s => (s.kind === 'mention' ? (s.node?.id ?? null) : '')),
    ).toEqual(['aria', null]);
  });
});

describe('conexiones de un nodo', () => {
  it('reúne jerarquía, relaciones, referencias en ambos sentidos y menciones', () => {
    const p = world();
    const alta = nodeConnections(p, 'alta')!;
    expect(alta.referencesIn.map(c => `${c.field.name}:${c.other.id}`)).toEqual(['Ciudad:aria', 'Ciudad:tor']);
    const aria = nodeConnections(p, 'aria')!;
    expect(aria.referencesOut.map(c => c.other.id)).toEqual(['alta', 'tor']);
    expect(aria.referencesIn.map(c => c.other.id)).toEqual([]);
    expect(aria.mentionsIn.map(n => n.id)).toEqual(['tor']);
    expect(aria.total).toBe(3);
  });
});
