import { describe, expect, it } from 'vitest';
import { field, node, project, schema } from '../test/fixtures';
import { isFieldVisible, referenceLimit, referenceLimitIssues, referenceScope, visibleFields } from './conditions';
import { missingRequired } from './health';
import { referenceCandidates } from './references';

const nivel = field('nivel', { type: 'select', options: ['Menor', 'Intermedia', 'Mayor'] });
const magia = field('magia', { type: 'nodeRef', referenceTypeIds: ['tipo_magia'] });
const ramas = field('ramas', {
  type: 'nodeRefs',
  referenceTypeIds: ['rama'],
  referenceWithin: 'magia',
  maxItemsBy: { fieldId: 'nivel', limits: { Menor: 1, Intermedia: 3 } },
});
const dominio = field('dominio', { required: true, visibleWhen: { fieldId: 'nivel', options: ['Mayor'] } });

const p = project({
  schemas: [
    schema('deidad', { fields: [nivel, magia, ramas, dominio] }),
    schema('tipo_magia', { allowedChildTypeIds: ['rama'] }),
    schema('rama'),
  ],
  nodes: [
    node('fuego', 'tipo_magia'),
    node('agua', 'tipo_magia'),
    node('llama', 'rama', 'fuego'),
    node('ceniza', 'rama', 'fuego'),
    node('marea', 'rama', 'agua'),
    node('ignis', 'deidad', null, { nivel: 'Menor', magia: 'fuego', ramas: ['llama', 'ceniza'] }),
    node('thal', 'deidad', null, { nivel: 'Mayor', magia: 'agua', ramas: ['marea'] }),
  ],
});
const fields = [nivel, magia, ramas, dominio];

describe('atributos condicionados', () => {
  it('se muestran solo cuando la lista vale una de las opciones', () => {
    expect(isFieldVisible(fields, dominio, { nivel: 'Mayor' })).toBe(true);
    expect(isFieldVisible(fields, dominio, { nivel: 'Menor' })).toBe(false);
    expect(isFieldVisible(fields, dominio, {})).toBe(false);
    // Una condición hacia un atributo inexistente no oculta nada.
    expect(isFieldVisible([dominio], dominio, {})).toBe(true);
    expect(visibleFields(p, p.nodes[5]).map(f => f.id)).toEqual(['nivel', 'magia', 'ramas']);
  });

  it('un obligatorio oculto no cuenta como ficha incompleta', () => {
    expect(missingRequired(p, p.nodes[5])).toEqual([]);
    expect(missingRequired(p, p.nodes[6]).map(f => f.id)).toEqual(['dominio']);
  });
});

describe('referencias dependientes', () => {
  it('limita los candidatos a lo que cuelga del nodo elegido en la otra referencia', () => {
    const scope = referenceScope(p, ramas, { magia: 'fuego' });
    expect([...scope!].sort()).toEqual(['ceniza', 'llama']);
    expect(
      referenceCandidates(p, ramas, 'ignis', scope)
        .map(n => n.id)
        .sort(),
    ).toEqual(['ceniza', 'llama']);
    // Sin elección en la otra referencia no se limita.
    expect(referenceScope(p, ramas, {})).toBeNull();
    expect(
      referenceCandidates(p, ramas, 'ignis', null)
        .map(n => n.id)
        .sort(),
    ).toEqual(['ceniza', 'llama', 'marea']);
  });
});

describe('límite por opción de otra lista', () => {
  it('calcula el máximo según la opción y avisa cuando se supera', () => {
    expect(referenceLimit(fields, ramas, { nivel: 'Menor' })).toBe(1);
    expect(referenceLimit(fields, ramas, { nivel: 'Intermedia' })).toBe(3);
    expect(referenceLimit(fields, ramas, { nivel: 'Mayor' })).toBeNull();
    const issues = referenceLimitIssues(p);
    expect(issues.map(i => [i.node.id, i.count, i.max])).toEqual([['ignis', 2, 1]]);
  });
});
