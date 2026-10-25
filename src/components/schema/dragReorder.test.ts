import { describe, expect, it } from 'vitest';
import { moveId } from './dragReorder';

describe('moveId', () => {
  const ids = ['a', 'b', 'c', 'd'];

  it('coloca el elemento antes o después del destino', () => {
    expect(moveId(ids, 'a', 'c', false)).toEqual(['b', 'a', 'c', 'd']);
    expect(moveId(ids, 'a', 'c', true)).toEqual(['b', 'c', 'a', 'd']);
    expect(moveId(ids, 'd', 'a', false)).toEqual(['d', 'a', 'b', 'c']);
  });

  it('deja la lista igual si el elemento o el destino no están, o son el mismo', () => {
    expect(moveId(ids, 'x', 'b', true)).toBe(ids);
    expect(moveId(ids, 'a', 'x', true)).toBe(ids);
    expect(moveId(ids, 'b', 'b', false)).toBe(ids);
  });
});
