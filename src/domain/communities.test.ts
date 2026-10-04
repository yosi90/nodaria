import { describe, expect, it } from 'vitest';
import { communityIndex, detectCommunities } from './communities';

// Dos triángulos densos unidos por un solo vínculo, más una pareja aparte.
const links = [
  { a: 'a', b: 'b' },
  { a: 'b', b: 'c' },
  { a: 'c', b: 'a' },
  { a: 'c', b: 'd' },
  { a: 'd', b: 'e' },
  { a: 'e', b: 'f' },
  { a: 'f', b: 'd' },
  { a: 'x', b: 'y' },
];

describe('detectCommunities', () => {
  it('splits the graph into its dense groups, largest first', () => {
    const communities = detectCommunities(links);
    expect(communities.map(c => c.members)).toEqual([
      ['a', 'b', 'c'],
      ['d', 'e', 'f'],
      ['x', 'y'],
    ]);
    expect(communities.map(c => c.index)).toEqual([0, 1, 2]);
  });

  it('is deterministic and maps each node to its community', () => {
    expect(detectCommunities(links)).toEqual(detectCommunities([...links].reverse()));
    const index = communityIndex(links);
    expect(index.get('a')).toBe(index.get('c'));
    expect(index.get('a')).not.toBe(index.get('d'));
    expect(index.get('x')).toBe(2);
  });

  it('handles an empty graph', () => {
    expect(detectCommunities([])).toEqual([]);
  });
});
