import { describe, expect, it } from 'vitest';
import { project, schema } from '../test/fixtures';
import { ALL_PROJECTS, parseState, saveFailureOf } from './storage';

const stored = (projects: unknown[], activeProjectId = 'a') =>
  JSON.stringify({ version: 3, activeProjectId, projects });

describe('parseState', () => {
  it('loads every readable project and reports the ones that cannot be migrated', () => {
    const broken = { id: 'b', name: 'Roto', schemas: 5 };
    const { state, lost } = parseState(
      stored([project({ id: 'a', schemas: [schema('t')] }), broken, project({ id: 'c' })]),
    );
    expect(state.projects.map(p => p.id)).toEqual(['a', 'c']);
    expect(state.activeProjectId).toBe('a');
    expect(lost).toEqual(['Roto']);
  });

  it('falls back to the first readable project when the active one was lost', () => {
    const { state } = parseState(stored([{ id: 'a', name: 'Roto', schemas: 5 }, project({ id: 'c' })]));
    expect(state.activeProjectId).toBe('c');
  });

  it('reports everything as lost when the text is not a saved state', () => {
    expect(parseState('{"projects": [').lost).toEqual([ALL_PROJECTS]);
    expect(parseState('null').lost).toEqual([ALL_PROJECTS]);
    expect(parseState('{"version": 3}').lost).toEqual([ALL_PROJECTS]);
  });

  it('loses nothing on a clean state', () => {
    expect(parseState(stored([project({ id: 'a' })])).lost).toEqual([]);
  });
});

describe('saveFailureOf', () => {
  it('tells a full storage apart from a blocked one', () => {
    expect(saveFailureOf(new DOMException('full', 'QuotaExceededError'))).toBe('quota');
    expect(saveFailureOf(new DOMException('denied', 'SecurityError'))).toBe('unavailable');
    expect(saveFailureOf(new Error('x'))).toBe('unavailable');
  });
});
