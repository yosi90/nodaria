import { describe, expect, it } from 'vitest';
import { field, node, project, schema } from '../test/fixtures';
import { imageClasses, nodeImages, nodePortrait } from './portrait';

const png = 'data:image/png;base64,AAA';
const p = project({
  schemas: [
    schema('coche', {
      fields: [
        field('motor', { type: 'image', portrait: false, imageShape: 'square', imageBorder: false }),
        field('foto', { type: 'image', portrait: true, imageShape: 'circle' }),
        field('escape', { type: 'image', portrait: true }),
      ],
    }),
  ],
  nodes: [node('c1', 'coche', null, { motor: png, foto: png, escape: png }), node('c2', 'coche', null, { motor: png })],
});

describe('portrait', () => {
  it('lists image fields with a value, in field order, with their shape and border', () => {
    expect(nodeImages(p, p.nodes[0]).map(i => [i.field.id, i.shape, i.border])).toEqual([
      ['motor', 'square', false],
      ['foto', 'circle', true],
      ['escape', 'rounded', true],
    ]);
  });

  it('uses the first portrait field with a value, ignoring non-portrait images', () => {
    expect(nodePortrait(p, p.nodes[0])?.field.id).toBe('foto');
    expect(nodePortrait(p, p.nodes[1])).toBeNull();
    expect(nodePortrait(p, { typeId: 'coche', values: { escape: png } })?.field.id).toBe('escape');
  });

  it('builds the css classes', () => {
    expect(imageClasses({ shape: 'circle', border: true })).toBe('shape-circle');
    expect(imageClasses({ shape: 'square', border: false })).toBe('shape-square no-border');
  });
});
