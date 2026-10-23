import { describe, expect, it } from 'vitest';
import { migrateProject } from '../../services/migrations';
import { field, node, project, relation, schema } from '../../test/fixtures';
import { communityHash, parseCommunityHash } from './communityHash';
import { THUMB_H, THUMB_W, thumbnailSvg } from './mapThumbnail';

describe('direcciones de Comunidad', () => {
  it('lee y escribe #comunidad con su pestaña, persona o conversación', () => {
    expect(parseCommunityHash('#comunidad')).toEqual({});
    expect(parseCommunityHash('#comunidad/personas')).toEqual({ tab: 'personas' });
    expect(parseCommunityHash('#comunidad/persona/abc-123')).toEqual({ tab: 'persona', person: 'abc-123' });
    expect(parseCommunityHash('#comunidad/chats/42')).toEqual({ tab: 'chats', conversation: 42 });
    expect(parseCommunityHash('#comunidad/nada')).toEqual({});
    expect(parseCommunityHash('#otra')).toBeNull();
    expect(communityHash({ tab: 'persona', person: 'abc', conversation: null })).toBe('#comunidad/persona/abc');
    expect(communityHash({ tab: 'chats', person: null, conversation: 7 })).toBe('#comunidad/chats/7');
    expect(communityHash({ tab: 'descubrir', person: null, conversation: null })).toBe('#comunidad/descubrir');
  });
});

describe('imagen de un proyecto público', () => {
  const world = () =>
    project({
      name: 'Caso <Puerto> Norte',
      schemas: [
        schema('p', { color: '#ff0000', fields: [field('t', { isTitle: true })] }),
        schema('k', {}, 'relationship'),
      ],
      nodes: [node('a', 'p', null, { t: 'Ana & Beto' }), node('b', 'p', null, { t: 'Lira' })],
      relations: [relation('r', 'k', 'a', 'b')],
    });

  it('dibuja los nodos con su color, sus vínculos y los nombres, escapados', () => {
    const svg = thumbnailSvg(world());
    expect(svg).toContain(`width="${THUMB_W}" height="${THUMB_H}"`);
    expect(svg.match(/<circle /g)).toHaveLength(2);
    expect(svg.match(/<line /g)).toHaveLength(1);
    expect(svg).toContain('fill="#ff0000"');
    expect(svg).toContain('Ana &amp; Beto');
    expect(svg).toContain('Caso &lt;Puerto&gt; Norte');
    // Todo cae dentro de la imagen.
    for (const match of svg.matchAll(/cx="(-?\d+)" cy="(-?\d+)"/g)) {
      expect(Number(match[1])).toBeGreaterThanOrEqual(0);
      expect(Number(match[1])).toBeLessThanOrEqual(THUMB_W);
      expect(Number(match[2])).toBeGreaterThanOrEqual(0);
      expect(Number(match[2])).toBeLessThanOrEqual(THUMB_H);
    }
  });

  it('sin nodos, solo el nombre', () => {
    expect(thumbnailSvg(project({ name: 'Vacío' }))).not.toContain('<circle');
  });
});

describe('origen de una copia', () => {
  it('se conserva al cargar y se olvida si no se entiende', () => {
    const origin = { publicId: 'abcdefghijkl', name: 'Original', author: 'cuenta', copiedAt: '2026-10-23' };
    expect(migrateProject({ ...project(), origin } as never).origin).toEqual(origin);
    expect(migrateProject({ ...project(), origin: { name: 'sin id' } } as never).origin).toBeNull();
    expect(migrateProject({ ...project(), origin: undefined } as never).origin).toBeNull();
  });
});
