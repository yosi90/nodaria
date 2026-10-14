import { describe, expect, it } from 'vitest';
import { field, project, schema } from '../test/fixtures';
import { allFields } from '../domain/selectors';
import { addSchema } from '../domain/operations';
import { createHistory, historyReducer } from './history';

describe('creating subtypes atomically', () => {
  it('inherits fields for both entities and relationship types and undoes in one step', () => {
    for (const kind of ['entity', 'relationship'] as const) {
      const p = project({ schemas: [schema('parent', { fields: [field('shared')] }, kind)] });
      const h = createHistory({ version: 3, projects: [p], activeProjectId: p.id });
      const next = historyReducer(h, {
        type: 'apply',
        at: 1,
        action: { type: 'add-schema', id: 'child', name: 'Hijo', kind, parentTypeId: 'parent' },
      });
      expect(next.present.projects[0].schemas[1].parentTypeId).toBe('parent');
      expect(allFields(next.present.projects[0], 'child').map(f => f.id)).toEqual(['shared']);
      expect(historyReducer(next, { type: 'undo' }).present).toBe(h.present);
    }
  });
  it('rejects absent parents, cross-kind inheritance and self-parenting', () => {
    const p = project({ schemas: [schema('parent')] });
    expect(addSchema(p, 'Child', 'entity', 'child', 'missing')).toBe(p);
    expect(addSchema(p, 'Child', 'relationship', 'child', 'parent')).toBe(p);
    expect(addSchema(p, 'Child', 'entity', 'parent', 'parent')).toBe(p);
  });
});
