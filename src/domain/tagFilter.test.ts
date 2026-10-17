import { describe, expect, it } from 'vitest';
import { field, node, project, schema } from '../test/fixtures';
import { passesTagFilter, projectTags } from './tagFilter';

const p = project({
  schemas: [
    schema('persona', { fields: [field('rasgos', { type: 'tags' }), field('bandos', { type: 'tags' })] }),
    schema('lugar'),
  ],
  nodes: [
    node('ana', 'persona', null, { rasgos: ['noble', 'rebelde'], bandos: ['norte'] }),
    node('luis', 'persona', null, { rasgos: ['noble'] }),
    node('puerto', 'lugar'),
  ],
});

describe('tagFilter', () => {
  it('cuenta las etiquetas de todos los atributos de tipo «Etiquetas»', () => {
    expect(projectTags(p)).toEqual([
      { tag: 'noble', count: 2 },
      { tag: 'norte', count: 1 },
      { tag: 'rebelde', count: 1 },
    ]);
  });

  it('sin etiquetas marcadas no filtra; con alguna, deja los nodos que llevan al menos una', () => {
    expect(p.nodes.filter(n => passesTagFilter(p, n, [])).map(n => n.id)).toEqual(['ana', 'luis', 'puerto']);
    expect(p.nodes.filter(n => passesTagFilter(p, n, ['rebelde', 'norte'])).map(n => n.id)).toEqual(['ana']);
  });
});
