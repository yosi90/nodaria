import { describe, expect, it } from 'vitest';
import { pathPairs, shortestPath } from './paths';

const links = [
  { a: 'a', b: 'b' },
  { a: 'b', b: 'c' },
  { a: 'c', b: 'd' },
  { a: 'a', b: 'e' },
  { a: 'e', b: 'd' },
  { a: 'x', b: 'y' },
];

describe('shortestPath', () => {
  it('finds the shortest route ignoring direction', () => {
    expect(shortestPath(links, 'a', 'd')).toEqual(['a', 'e', 'd']);
    expect(shortestPath(links, 'd', 'a')).toEqual(['d', 'e', 'a']);
    expect(shortestPath(links, 'c', 'e')).toHaveLength(3);
  });

  it('returns the node itself, and null when disconnected or unknown', () => {
    expect(shortestPath(links, 'a', 'a')).toEqual(['a']);
    expect(shortestPath(links, 'a', 'x')).toBeNull();
    expect(shortestPath(links, 'a', 'nope')).toBeNull();
  });

  it('lists the edge pairs of a path in both directions', () => {
    expect([...pathPairs(['a', 'e', 'd'])].sort()).toEqual(['a|e', 'd|e', 'e|a', 'e|d']);
  });
});
