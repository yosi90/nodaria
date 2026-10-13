import { COLORS } from '../domain/constants';

export function normalizeColor(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const color = value.trim().toLowerCase();
  if (/^#[0-9a-f]{6}$/.test(color)) return color;
  if (/^#[0-9a-f]{3}$/.test(color)) return `#${[...color.slice(1)].map(c => c + c).join('')}`;
  return null;
}

export function addPaletteColor(palette: string[], value: unknown): string[] {
  const color = normalizeColor(value);
  return !color || COLORS.includes(color) || palette.includes(color) ? palette : [...palette, color];
}

export function normalizePalette(value: unknown): string[] {
  return Array.isArray(value) ? value.reduce<string[]>((colors, color) => addPaletteColor(colors, color), []) : [];
}
