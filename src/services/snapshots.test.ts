import { describe, expect, it } from 'vitest';
import { SNAPSHOTS_PER_PROJECT, snapshotsToPrune } from './storage';

const key = (project: string, at: Date) => `snapshot:${project}:${at.toISOString()}`;

describe('snapshotsToPrune', () => {
  it('conserva las 12 más recientes de cada proyecto y borra las de más de 30 días', () => {
    const now = Date.parse('2026-10-17T12:00:00.000Z');
    const hours = (h: number) => new Date(now - h * 3600_000);
    const many = Array.from({ length: SNAPSHOTS_PER_PROJECT + 3 }, (_, i) => key('project_a', hours(i)));
    const old = key('project_b', new Date(now - 31 * 24 * 3600_000));
    const recent = key('project_b', hours(1));
    const prune = snapshotsToPrune([...many, old, recent, 'vault:alguien'], now);
    // Las tres más antiguas de A, la vieja de B; ni la reciente de B ni otras claves.
    expect(prune.sort()).toEqual([...many.slice(SNAPSHOTS_PER_PROJECT), old].sort());
  });
});
