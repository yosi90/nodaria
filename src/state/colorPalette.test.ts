import { describe, expect, it } from 'vitest';
import { COLORS } from '../domain/constants';
import { addPaletteColor, normalizeColor, normalizePalette } from './colorPalette';

describe('color palette', () => {
  it('normalizes short and full hexadecimal colors without accepting invalid values', () => {
    expect(normalizeColor(' #AbC ')).toBe('#aabbcc');
    expect(normalizeColor('#ABCDEF')).toBe('#abcdef');
    for (const value of ['red', '#12', '#gg1234', '#12345678', null, 123]) expect(normalizeColor(value)).toBeNull();
  });
  it('restores a palette ignoring corrupt entries, equivalent colors and default swatches', () => {
    expect(normalizePalette(['#abc', '#AABBCC', '#123456', COLORS[0].toUpperCase(), {}, null])).toEqual([
      '#aabbcc',
      '#123456',
    ]);
    expect(normalizePalette('invalid')).toEqual([]);
  });
  it('adds colors in order and avoids changes when the color is already available', () => {
    const colors = ['#aabbcc'];
    expect(addPaletteColor(colors, '#ABC')).toBe(colors);
    expect(addPaletteColor(colors, COLORS[0])).toBe(colors);
    expect(addPaletteColor(colors, '')).toBe(colors);
    expect(addPaletteColor(colors, '#123456')).toEqual(['#aabbcc', '#123456']);
  });
});
