import { describe, expect, it } from 'vitest';
import { createHistory, historyReducer } from '../state/history';
import { project, schema } from '../test/fixtures';
import { blockedReason, contentSignature, planShared, SCHEMA_ACTIONS, type GroupInfo, type SharedMeta } from './groups';

const caps = { read: true, edit: true, editSchema: true, comment: true, deleteGroup: false };
const group = (id: string, projects: [string, number][], patch: Partial<GroupInfo> = {}): GroupInfo => ({
  id,
  spaceId: 1,
  name: id,
  owner: 'dueño',
  role: 'responsable',
  memberState: 'activo',
  isOwner: false,
  capabilities: caps,
  projects: projects.map(([pid, version]) => ({
    id: pid,
    name: pid,
    version,
    updatedAt: '2026-10-17T10:00:00.000Z',
    serverUpdatedAt: '2026-10-17T10:00:00.000Z',
    sizeBytes: 10,
    updatedBy: null,
  })),
  ...patch,
});
const meta = (projects: SharedMeta['projects']): SharedMeta => ({ uid: 'u', projects });
const local = (id: string) => project({ id, name: id, schemas: [schema('t')] });

describe('planShared', () => {
  it('baja los proyectos de grupo nuevos aquí', () => {
    const plan = planShared([], [group('g', [['p', 1]])], meta({}), {});
    expect(plan).toEqual({ download: [{ group: 'g', id: 'p', keepLocal: false }], merge: [], upload: [], release: [] });
  });

  it('sube lo cambiado aquí y baja lo cambiado allí', () => {
    const mine = local('p');
    const entry = { group: 'g', version: 2, signature: 'antes' };
    expect(planShared([mine], [group('g', [['p', 2]])], meta({ p: entry }), { p: 'ahora' }).upload).toEqual([
      { group: 'g', project: mine, baseVersion: 2 },
    ]);
    expect(planShared([mine], [group('g', [['p', 3]])], meta({ p: entry }), { p: 'antes' }).download).toEqual([
      { group: 'g', id: 'p', keepLocal: false },
    ]);
    // Sin cambios en ningún lado, nada.
    expect(planShared([mine], [group('g', [['p', 2]])], meta({ p: entry }), { p: 'antes' })).toEqual({
      download: [],
      merge: [],
      upload: [],
      release: [],
    });
  });

  it('con cambios en los dos lados los combina', () => {
    const plan = planShared(
      [local('p')],
      [group('g', [['p', 3]])],
      meta({ p: { group: 'g', version: 2, signature: 'antes' } }),
      { p: 'ahora' },
    );
    expect(plan.upload).toEqual([]);
    expect(plan.download).toEqual([]);
    expect(plan.merge).toEqual([{ group: 'g', id: 'p' }]);
  });

  it('sin permiso de edición nunca sube: solo baja', () => {
    const reader = group('g', [['p', 2]], {
      role: 'lector',
      capabilities: { ...caps, edit: false, editSchema: false },
    });
    const entry = { group: 'g', version: 2, signature: 'antes' };
    expect(planShared([local('p')], [reader], meta({ p: entry }), { p: 'ahora' }).upload).toEqual([]);
    const newer = { ...reader, projects: reader.projects.map(p => ({ ...p, version: 3 })) };
    expect(planShared([local('p')], [newer], meta({ p: entry }), { p: 'ahora' }).download).toEqual([
      { group: 'g', id: 'p', keepLocal: false },
    ]);
  });

  it('una copia de aquí que no se recuerda como compartida se compara al bajar', () => {
    expect(planShared([local('p')], [group('g', [['p', 1]])], meta({}), {}).download).toEqual([
      { group: 'g', id: 'p', keepLocal: true },
    ]);
  });

  it('suelta los que ya no son de ningún grupo, guardando lo que no se subió', () => {
    const plan = planShared(
      [local('a'), local('b')],
      [],
      meta({
        a: { group: 'g', version: 1, signature: 'x' },
        b: { group: 'g', version: 1, signature: 'x' },
        c: { group: 'g', version: 1, signature: 'x' },
      }),
      { a: 'x', b: 'y' },
    );
    expect(plan.release).toEqual([
      { id: 'a', keepLocal: false },
      { id: 'b', keepLocal: true },
      { id: 'c', keepLocal: false },
    ]);
  });
});

describe('contentSignature', () => {
  it('no cambia con la vista ni la fecha, sí con el contenido', async () => {
    const base = local('p');
    const same = await contentSignature({
      ...base,
      updatedAt: '2030-01-01T00:00:00.000Z',
      view: { ...base.view, layout: 'force' },
    });
    expect(same).toBe(await contentSignature(base));
    expect(await contentSignature({ ...base, name: 'Otro' })).not.toBe(same);
  });
});

describe('blockedReason', () => {
  const owner = group('g', [['p', 1]], { isOwner: true, capabilities: { ...caps, deleteGroup: true } });
  const editor = group('g', [['p', 1]], { role: 'editor', capabilities: { ...caps, editSchema: false } });
  const reader = group('g', [['p', 1]], { role: 'lector', capabilities: { ...caps, edit: false, editSchema: false } });

  it('deja navegar, cambiar la vista y duplicar a todos', () => {
    for (const action of ['set-project', 'update-view', 'duplicate-project', 'sync-apply'])
      expect(blockedReason(action, reader)).toBeNull();
  });

  it('el lector no cambia nada; el editor, todo menos el esquema', () => {
    expect(blockedReason('add-node', reader)).toMatch(/Lector/);
    expect(blockedReason('add-node', editor)).toBeNull();
    for (const action of SCHEMA_ACTIONS) expect(blockedReason(action, editor)).toMatch(/esquema/);
    expect(blockedReason('add-schema', owner)).toBeNull();
  });

  it('nadie elimina el proyecto del grupo como si fuera propio', () => {
    expect(blockedReason('delete-project', owner)).toMatch(/borra el grupo/);
    expect(blockedReason('delete-project', editor)).toMatch(/sal del grupo/);
  });
});

describe('historial y proyectos compartidos', () => {
  it('una versión del grupo vacía el historial: deshacer no repone lo de antes', () => {
    const p = local('p');
    let history = createHistory({ version: 3, projects: [p], activeProjectId: 'p' });
    history = historyReducer(history, { type: 'apply', action: { type: 'rename-project', name: 'Mío' }, at: 1 });
    expect(history.past).toHaveLength(1);
    const theirs = { ...p, name: 'Del grupo' };
    const kept = historyReducer(history, {
      type: 'apply',
      action: { type: 'sync-apply', upsert: [theirs], remove: [] },
      at: 2,
    });
    expect(kept.past).toHaveLength(1);
    const fresh = historyReducer(history, {
      type: 'apply',
      action: { type: 'sync-apply', upsert: [theirs], remove: [], fresh: true },
      at: 2,
    });
    expect(fresh.past).toEqual([]);
    expect(fresh.present.projects[0].name).toBe('Del grupo');
  });
});
