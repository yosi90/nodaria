import { describe, expect, it } from 'vitest';
import { moveNodes } from '../../domain/operations';
import { node, project } from '../../test/fixtures';
import { forceFrameAfterMove, forceFrameKey } from './forceFrame';

describe('force frames after dragging with fractional canvas coordinates', () => {
  it('matches the persisted key, preserves free nodes and only pins dragged nodes', () => {
    const p = project({ nodes: [node('a', 't'), node('b', 't'), node('c', 't')] });
    const moved = { a: { x: 250.067, y: 50.0536 } };
    const visible = new Map([
      ['a', moved.a],
      ['b', { x: 9, y: 287 }],
      ['c', { x: 288, y: 292 }],
    ]);
    const frame = forceFrameAfterMove('graph', p, moved, visible);
    const persisted = moveNodes(p, moved, 'force');
    const fixed = new Map(
      persisted.nodes.flatMap(n => (n.positions.force ? [[n.id, n.positions.force] as const] : [])),
    );
    expect(frame.key).toBe(forceFrameKey('graph', fixed));
    expect(frame.positions.get('a')).toEqual({ x: 250, y: 50 });
    expect(frame.positions.get('b')).toEqual(visible.get('b'));
    expect(frame.positions.get('c')).toEqual(visible.get('c'));
    expect([...fixed.keys()]).toEqual(['a']);
    expect(visible.get('a')).toEqual(moved.a);
  });

  it('keeps other pins, including hidden nodes, and handles simultaneous drags', () => {
    const p = project({
      nodes: [node('a', 't'), { ...node('hidden', 't'), positions: { force: { x: 12, y: 34 } } }, node('b', 't')],
    });
    const moved = { a: { x: -10.6, y: 2.8 }, b: { x: 30.2, y: 40.7 } };
    const frame = forceFrameAfterMove('graph', p, moved, new Map(Object.entries(moved)));
    expect(frame.key).toBe(
      forceFrameKey(
        'graph',
        new Map([
          ['a', { x: -11, y: 3 }],
          ['hidden', { x: 12, y: 34 }],
          ['b', { x: 30, y: 41 }],
        ]),
      ),
    );
    expect(frame.positions.has('hidden')).toBe(false);
    expect(frame.positions.get('b')).toEqual({ x: 30, y: 41 });
  });
});
