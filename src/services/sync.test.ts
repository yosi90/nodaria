import { describe, expect, it } from 'vitest';
import { appReducer } from '../state/reducer';
import { project, schema } from '../test/fixtures';
import { afterEach, beforeEach } from 'vitest';
import {
  emptyMeta,
  isBlankProject,
  isEmptyPlan,
  loadSyncMeta,
  planSync,
  storedSyncAccount,
  SYNC_META_KEY,
  unsyncedProjects,
  type RemoteSummary,
  type SyncMeta,
} from './sync';

const T1 = '2026-10-04T10:00:00.000Z';
const T2 = '2026-10-04T11:00:00.000Z';
const T3 = '2026-10-04T12:00:00.000Z';

const local = (id: string, updatedAt = T1, blank = false) =>
  project({ id, name: id, updatedAt, schemas: blank ? [] : [schema('t')] });
const remote = (id: string, version: number, updatedAt = T1, deletedAt: string | null = null): RemoteSummary => ({
  id,
  name: id,
  version,
  updatedAt,
  serverUpdatedAt: updatedAt,
  deletedAt,
  sizeBytes: 10,
});
const meta = (projects: SyncMeta['projects']): SyncMeta => ({ uid: 'u', projects });

describe('planSync', () => {
  it('uploads new local projects and downloads unknown remote ones', () => {
    const plan = planSync([local('a')], [remote('b', 3)], emptyMeta('u'));
    expect(plan.upload).toMatchObject([{ project: { id: 'a' }, baseVersion: 0 }]);
    expect(plan.download).toEqual([{ id: 'b', version: 3 }]);
    expect(plan.conflicts).toEqual([]);
  });

  it('never uploads blank unsynced projects and drops them when the account has content', () => {
    const blank = local('fresh', T1, true);
    expect(isBlankProject(blank)).toBe(true);
    expect(planSync([blank], [], emptyMeta('u')).upload).toEqual([]);
    expect(planSync([blank], [], emptyMeta('u')).removeLocal).toEqual([]);
    expect(planSync([blank], [remote('b', 1)], emptyMeta('u')).removeLocal).toEqual(['fresh']);
  });

  it('does nothing when both sides match the remembered state', () => {
    const plan = planSync([local('a', T1)], [remote('a', 2, T1)], meta({ a: { version: 2, updatedAt: T1 } }));
    expect(plan).toMatchObject({ upload: [], download: [], removeLocal: [], deleteRemote: [], conflicts: [] });
  });

  it('uploads when only the local side changed and downloads when only the remote side did', () => {
    const synced = meta({ a: { version: 2, updatedAt: T1 } });
    expect(planSync([local('a', T2)], [remote('a', 2, T1)], synced).upload).toMatchObject([{ baseVersion: 2 }]);
    expect(planSync([local('a', T1)], [remote('a', 3, T2)], synced).download).toEqual([{ id: 'a', version: 3 }]);
  });

  it('lets the most recent change win when both sides changed, and reports it', () => {
    const synced = meta({ a: { version: 2, updatedAt: T1 } });
    const localWins = planSync([local('a', T3)], [remote('a', 3, T2)], synced);
    expect(localWins.upload).toMatchObject([{ baseVersion: 3 }]);
    expect(localWins.conflicts).toEqual([{ id: 'a', name: 'a', winner: 'local' }]);

    const remoteWins = planSync([local('a', T2)], [remote('a', 3, T3)], synced);
    expect(remoteWins.download).toEqual([{ id: 'a', version: 3 }]);
    expect(remoteWins.conflicts).toEqual([{ id: 'a', name: 'a', winner: 'remote' }]);
  });

  it('adopts identical content seen for the first time without transferring it', () => {
    const plan = planSync([local('a', T2)], [remote('a', 5, T2)], emptyMeta('u'));
    expect(plan.adoptMeta).toEqual([{ id: 'a', version: 5, updatedAt: T2 }]);
    expect(plan.upload).toEqual([]);
    expect(plan.download).toEqual([]);
  });

  it('propagates a local deletion only if the account did not change meanwhile', () => {
    expect(planSync([], [remote('a', 2)], meta({ a: { version: 2, updatedAt: T1 } })).deleteRemote).toEqual([
      { id: 'a', baseVersion: 2 },
    ]);
    const changed = planSync([], [remote('a', 3, T2)], meta({ a: { version: 2, updatedAt: T1 } }));
    expect(changed.deleteRemote).toEqual([]);
    expect(changed.download).toEqual([{ id: 'a', version: 3 }]);
    expect(changed.conflicts).toEqual([{ id: 'a', name: 'a', winner: 'remote' }]);
  });

  it('recovers remembered projects missing locally after a load that lost them', () => {
    const synced = meta({ a: { version: 2, updatedAt: T1 }, b: { version: 5, updatedAt: T1 } });
    const plan = planSync([local('blank', T1, true)], [remote('a', 2), remote('b', 6, T2)], synced, {
      recoverMissing: true,
    });
    expect(plan.deleteRemote).toEqual([]);
    expect(plan.download).toEqual([
      { id: 'a', version: 2 },
      { id: 'b', version: 6 },
    ]);
    expect(plan.removeLocal).toEqual(['blank']);
    expect(plan.conflicts).toEqual([]);
  });

  it('applies a remote deletion locally unless the local copy changed afterwards', () => {
    const synced = meta({ a: { version: 2, updatedAt: T1 } });
    expect(planSync([local('a', T1)], [remote('a', 3, T1, T2)], synced).removeLocal).toEqual(['a']);
    const edited = planSync([local('a', T3)], [remote('a', 3, T1, T2)], synced);
    expect(edited.removeLocal).toEqual([]);
    expect(edited.upload).toMatchObject([{ baseVersion: 3 }]);
  });

  it('forgets remembered projects that exist nowhere', () => {
    expect(planSync([], [remote('a', 3, T1, T2)], meta({ a: { version: 2, updatedAt: T1 } })).forgetMeta).toEqual([
      'a',
    ]);
    expect(planSync([], [], meta({ a: { version: 2, updatedAt: T1 } })).forgetMeta).toEqual(['a']);
  });
});

describe('sync-apply', () => {
  it('replaces, adds and removes projects without touching the others', () => {
    const state = { version: 3 as const, activeProjectId: 'a', projects: [local('a'), local('b')] };
    const next = appReducer(state, {
      type: 'sync-apply',
      upsert: [local('a', T2), local('c')],
      remove: ['b'],
    });
    expect(next.projects.map(p => p.id)).toEqual(['a', 'c']);
    expect(next.projects[0].updatedAt).toBe(T2);
    expect(next.activeProjectId).toBe('a');
  });

  it('keeps a usable active project when the active one is removed', () => {
    const state = { version: 3 as const, activeProjectId: 'a', projects: [local('a')] };
    const next = appReducer(state, { type: 'sync-apply', upsert: [], remove: ['a'] });
    expect(next.projects).toHaveLength(1);
    expect(next.projects[0].id).not.toBe('a');
    expect(next.activeProjectId).toBe(next.projects[0].id);
  });
});

describe('memoria al pasar a la cuenta de Yosiftware', () => {
  const store = new Map<string, string>();
  beforeEach(() => {
    store.clear();
    (globalThis as { localStorage?: unknown }).localStorage = {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => void store.set(key, value),
      removeItem: (key: string) => void store.delete(key),
    };
  });
  afterEach(() => {
    delete (globalThis as { localStorage?: unknown }).localStorage;
  });

  const OWNER = '7042db67-5cc3-f111-8c4b-002315ef7116';
  const local = project({ id: 'mapa', name: 'Munfamed', updatedAt: '2026-10-13T13:43:04.262Z' });
  const remote: RemoteSummary[] = [
    {
      id: 'mapa',
      name: 'Munfamed',
      version: 534,
      updatedAt: '2026-10-13T13:43:04.262Z',
      serverUpdatedAt: '2026-10-13T13:43:05.000Z',
      deletedAt: null,
      sizeBytes: 630_748,
    },
  ];
  const remembered: SyncMeta = {
    uid: 'uid-firebase',
    projects: { mapa: { version: 534, updatedAt: local.updatedAt } },
  };

  it('adopta el recuerdo de la cuenta de antes: la primera sincronización no sube, baja ni borra nada', () => {
    store.set(SYNC_META_KEY, JSON.stringify(remembered));
    const meta = loadSyncMeta(OWNER, 'uid-firebase');
    expect(meta).toEqual({ uid: OWNER, projects: remembered.projects });
    expect(JSON.parse(store.get(SYNC_META_KEY)!).uid).toBe(OWNER);
    const plan = planSync([local], remote, meta);
    expect(isEmptyPlan(plan)).toBe(true);
    // Un proyecto borrado aquí mientras tanto se sigue propagando como antes.
    expect(planSync([], remote, meta).deleteRemote).toEqual([{ id: 'mapa', baseVersion: 534 }]);
  });

  it('no usa el recuerdo de otra cuenta: parte de cero y nunca borra en la cuenta', () => {
    store.set(SYNC_META_KEY, JSON.stringify({ ...remembered, uid: 'uid-de-otra' }));
    const meta = loadSyncMeta(OWNER, 'uid-firebase');
    expect(meta).toEqual(emptyMeta(OWNER));
    expect(planSync([], remote, meta).deleteRemote).toEqual([]);
    expect(planSync([], remote, meta).download).toEqual([{ id: 'mapa', version: 534 }]);
  });

  it('al cerrarse la sesión solo se apartan los cambios sin subir; lo subido y lo vacío no', () => {
    store.set(SYNC_META_KEY, JSON.stringify({ ...remembered, uid: OWNER }));
    expect(storedSyncAccount()).toBe(OWNER);
    const changed = { ...local, schemas: [schema('tipo')], updatedAt: '2026-10-15T20:00:00.000Z' };
    const fresh = project({ id: 'nuevo', name: 'Sin subir', schemas: [schema('tipo')] });
    const blank = project({ id: 'vacio', name: 'Mi primer mapa' });
    expect(unsyncedProjects([local, blank], remembered)).toEqual([]);
    expect(unsyncedProjects([changed, fresh, blank], remembered).map(p => p.id)).toEqual(['mapa', 'nuevo']);
    store.delete(SYNC_META_KEY);
    expect(storedSyncAccount()).toBeNull();
  });

  it('una cuenta nueva sin cuenta de antes no adopta nada', () => {
    store.set(SYNC_META_KEY, JSON.stringify(remembered));
    expect(loadSyncMeta(OWNER, null)).toEqual(emptyMeta(OWNER));
  });
});
