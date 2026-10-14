import { describe, expect, it } from 'vitest';
import { node, project } from '../../test/fixtures';
import { emptyDatabaseDesign, createDatabaseTable, applyDatabaseEdit } from '../../domain/databaseDesign';
import { moveCanvasNodes } from '../../domain/databaseNodes';
import { databaseMapPositions } from './databaseLayout';

describe('SQL placement is an optional layer over the active map layout', () => {
  const table = { ...createDatabaseTable(), id: 'table' };
  const p = project({
    nodes: [node('ordinary', 't'), node('table', 't')],
    databaseDesign: { ...emptyDatabaseDesign(), tables: [table] },
  });
  const native = new Map([
    ['ordinary', { x: 10, y: 20 }],
    ['table', { x: 30, y: 40 }],
  ]);
  const visible = new Set(['ordinary', 'table']);
  it('does not change ordinary positions when toggled and does not mutate the native layout', () => {
    expect(databaseMapPositions(p, native, visible, 100)).toEqual(native);
    const enabled = { ...p, view: { ...p.view, databaseSchema: true } };
    const placed = databaseMapPositions(enabled, native, visible, 100);
    expect(placed.get('ordinary')).toEqual(native.get('ordinary'));
    expect(placed.get('table')).not.toEqual(native.get('table'));
    expect(native.get('table')).toEqual({ x: 30, y: 40 });
  });
  it('moves tables into SQL positions and ordinary nodes into the active layout atomically', () => {
    const enabled = { ...p, view: { ...p.view, databaseSchema: true } };
    const moved = moveCanvasNodes(enabled, { table: { x: 10.5, y: 30.8 }, ordinary: { x: 50.1, y: 60.4 } });
    expect(moved.databaseDesign?.positions.table).toEqual({ x: 10.5, y: 30.8 });
    expect(moved.nodes[1].positions).toEqual({});
    expect(moved.nodes[0].positions.tree).toEqual({ x: 50, y: 60 });
    expect(moveCanvasNodes(moved, { table: null }).databaseDesign?.positions.table).toBeUndefined();
  });
  it('enables the check on the first table and respects an explicit opt-out on later tables', () => {
    const first = applyDatabaseEdit(project({ nodes: [node('table', 't')] }), { kind: 'save-table', table });
    expect(first.view.databaseSchema).toBe(true);
    const disabled = { ...first, view: { ...first.view, databaseSchema: false } };
    expect(
      applyDatabaseEdit(disabled, { kind: 'save-table', table: { ...table, id: 'another', name: 'Otra' } }).view
        .databaseSchema,
    ).toBe(false);
  });
});
