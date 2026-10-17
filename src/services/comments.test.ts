import { describe, expect, it } from 'vitest';
import { field } from '../test/fixtures';
import { suggestedValue } from './comments';
import { roleLabel } from './groups';

describe('suggestedValue', () => {
  it('convierte lo escrito al tipo del atributo y rechaza lo que no vale', () => {
    expect(suggestedValue(field('n', { type: 'number' }), '3,5')).toBe(3.5);
    expect(suggestedValue(field('n', { type: 'number' }), 'tres')).toBeNull();
    expect(suggestedValue(field('s', { type: 'scale' }), '9')).toBe(5);
    expect(suggestedValue(field('l', { type: 'select', options: ['Alta', 'Baja'] }), 'Alta')).toBe('Alta');
    expect(suggestedValue(field('l', { type: 'select', options: ['Alta', 'Baja'] }), 'Media')).toBeNull();
    expect(suggestedValue(field('d', { type: 'date' }), '1043-13-02')).toBe('1043-13-02');
    expect(suggestedValue(field('d', { type: 'date' }), 'ayer')).toBeNull();
    expect(suggestedValue(field('t', { type: 'text' }), ' Ana María ')).toBe(' Ana María ');
  });
});

describe('roleLabel', () => {
  it('nombra los roles según el tipo de proyecto, con el general si no lo hay', () => {
    expect(roleLabel('responsable', 'rpg')).toBe('Director de juego');
    expect(roleLabel('revisor', 'novel')).toBe('Corrector');
    expect(roleLabel('editor', 'database')).toBe('Desarrollador');
    expect(roleLabel('editor')).toBe('Editor');
    expect(roleLabel('desconocido', 'rpg')).toBe('desconocido');
  });
});
