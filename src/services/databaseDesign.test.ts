import { describe, expect, it } from 'vitest';
import { project, node, schema } from '../test/fixtures';
import { defaultSqlType, emptyDatabaseDesign, type DatabaseTable } from '../domain/databaseDesign';
import { PROJECT_FORMAT_VERSION } from '../domain/constants';
import { createHistory, historyReducer } from '../state/history';
import { appReducer } from '../state/reducer';
import { isBlankProject, planSync, emptyMeta } from './sync';
import { parseProject, parseState, serializeProject } from './storage';

const table: DatabaseTable = {
  id: 't',
  schema: 'dbo',
  name: 'Clientes',
  columns: [{ id: 'id', name: 'Id', type: defaultSqlType('int'), nullable: false, identity: true }],
  primaryKey: ['id'],
  uniqueKeys: [],
};
describe('database-only projects', () => {
  it('round trips through JSON and retains definitions and positions', () => {
    const p = project({
      databaseDesign: { ...emptyDatabaseDesign(), tables: [table], positions: { t: { x: 12.3, y: 45.6 } } },
    });
    p.schemas = [schema('normal')];
    p.nodes = [node('t', 'normal')];
    const loaded = parseProject(serializeProject(p));
    expect(loaded.project.databaseDesign).toEqual(p.databaseDesign);
    expect(loaded.issues).toEqual([]);
    expect(loaded.project.formatVersion).toBe(PROJECT_FORMAT_VERSION);
  });
  it('migrates old maps without converting them into tables', () => {
    const old = project();
    delete old.databaseDesign;
    old.formatVersion = 4;
    expect(parseProject(JSON.stringify(old)).project.databaseDesign).toBeUndefined();
  });
  it('rescues malformed relational data and unsupported future formats', () => {
    for (const broken of [
      project({ databaseDesign: { tables: 'bad' } as never }),
      project({ formatVersion: PROJECT_FORMAT_VERSION + 1 }),
    ]) {
      const result = parseState(JSON.stringify({ activeProjectId: broken.id, projects: [broken] }));
      expect(result.lost).toContain(broken.name);
    }
  });
  it('counts relational tables as content and plans uploading a database-only project', () => {
    const p = project({ databaseDesign: { ...emptyDatabaseDesign(), tables: [table] } });
    expect(isBlankProject(p)).toBe(false);
    expect(planSync([p], [], emptyMeta()).upload).toHaveLength(1);
  });
  it('undoes table creation, deletion and fractional movement, with a single step per operation', () => {
    let history = createHistory({ version: 3, activeProjectId: 'p1', projects: [project()] });
    history = historyReducer(history, {
      type: 'apply',
      at: 1,
      action: { type: 'database-edit', edit: { kind: 'save-table', table } },
    });
    history = historyReducer(history, {
      type: 'apply',
      at: 2,
      action: { type: 'database-edit', edit: { kind: 'positions', positions: { t: { x: 1.12, y: 3.45 } } } },
    });
    history = historyReducer(history, { type: 'undo' });
    expect(history.present.projects[0].databaseDesign?.positions).toEqual({});
    history = historyReducer(history, { type: 'redo' });
    expect(history.present.projects[0].databaseDesign?.positions.t.x).toBe(1.12);
    history = historyReducer(history, {
      type: 'apply',
      at: 3,
      action: { type: 'database-edit', edit: { kind: 'delete-table', id: 't' } },
    });
    expect(history.present.projects[0].databaseDesign?.tables).toEqual([]);
    history = historyReducer(history, { type: 'undo' });
    expect(history.present.projects[0].databaseDesign?.tables).toEqual([table]);
  });
  it('does not discard a database-only project when opening an example', () => {
    const p = project({ databaseDesign: { ...emptyDatabaseDesign(), tables: [table] } });
    const next = appReducer(
      { version: 3, activeProjectId: 'p1', projects: [p] },
      { type: 'import-project', project: project({ id: 'example' }), replaceBlank: true },
    );
    expect(next.projects).toHaveLength(2);
  });
});
