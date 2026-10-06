import { describe, expect, it } from 'vitest';
import { project, schema } from '../test/fixtures';
import {
  ALL_PROJECTS,
  mergeLegacy,
  orderRecords,
  parseState,
  planWrite,
  prepareProjects,
  saveFailureOf,
} from './storage';

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

describe('planWrite', () => {
  it('writes only the projects that changed since the last save and removes the ones that are gone', () => {
    const a = project({ id: 'a' });
    const b = project({ id: 'b' });
    const b2 = { ...b, name: 'B cambiado' };
    const fresh = project({ id: 'c' });
    const written = new Map([
      ['a', a],
      ['b', b],
      ['gone', project({ id: 'gone' })],
    ]);
    const changes = planWrite(
      { version: 3, activeProjectId: 'b', projects: [a, b2, fresh] },
      written,
      new Set(['a', 'b', 'gone']),
    );
    expect(changes.put.map(p => p.id)).toEqual(['b', 'c']);
    expect(changes.remove).toEqual(['gone']);
    expect(changes.meta).toEqual({ activeProjectId: 'b', order: ['a', 'b', 'c'] });
  });
});

describe('orderRecords', () => {
  it('follows the saved order and leaves unknown records at the end', () => {
    const records = ['x', 'b', 'a'].map(id => ({ id }));
    expect(orderRecords(records, ['a', 'b']).map(r => r.id)).toEqual(['a', 'b', 'x']);
  });
});

describe('mergeLegacy', () => {
  const T1 = '2026-10-06T10:00:00.000Z';
  const T2 = '2026-10-06T11:00:00.000Z';
  it('takes from an old tab only what is new or more recent', () => {
    const current = [project({ id: 'a', updatedAt: T2 }), project({ id: 'b', updatedAt: T1 })];
    const legacy = [
      project({ id: 'a', name: 'viejo', updatedAt: T1 }),
      project({ id: 'b', name: 'nuevo', updatedAt: T2 }),
      project({ id: 'c', updatedAt: T1 }),
    ];
    const merged = mergeLegacy(current, legacy);
    expect(merged.newer.map(p => p.id)).toEqual(['b', 'c']);
    expect(merged.projects.map(p => [p.id, p.updatedAt])).toEqual([
      ['a', T2],
      ['b', T2],
      ['c', T1],
    ]);
    expect(merged.projects[1].name).toBe('nuevo');
  });
});

describe('prepareProjects', () => {
  it('flags as changed the projects that were migrated or repaired, so they are saved again', () => {
    const clean = project({ id: 'clean' });
    const old = { ...project({ id: 'old' }), formatVersion: 2 };
    const { changed } = prepareProjects([clean, old]);
    expect([...changed]).toEqual(['old']);
  });
});
