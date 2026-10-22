import { describe, expect, it } from 'vitest';
import { createIdentityTracker, IdentityChangedError } from './identity';

describe('generaciones de identidad', () => {
  it('lo empezado con A deja de valer al pasar a B, sin cierre intermedio', () => {
    const t = createIdentityTracker();
    t.confirm('a');
    const withA = t.current();
    expect(t.isCurrent(withA)).toBe(true);
    t.confirm('b');
    expect(t.isCurrent(withA)).toBe(false);
    expect(() => t.assertCurrent(withA)).toThrow(IdentityChangedError);
    expect(t.current().account).toBe('b');
  });

  it('A → B → A es otra generación aunque el id vuelva a coincidir', () => {
    const t = createIdentityTracker();
    t.confirm('a');
    const first = t.current();
    t.confirm('b');
    t.confirm('a');
    expect(t.current().account).toBe('a');
    expect(t.isCurrent(first)).toBe(false);
  });

  it('el aviso del SDK invalida al momento, antes de saber la cuenta nueva', () => {
    const t = createIdentityTracker();
    t.confirm('a');
    const withA = t.current();
    t.invalidate();
    expect(t.isCurrent(withA)).toBe(false);
    // Mientras tanto no hay cuenta con la que empezar nada.
    expect(t.current().account).toBeNull();
    // Aunque se confirme la misma cuenta, lo de antes del aviso no vuelve a valer.
    t.confirm('a');
    expect(t.isCurrent(withA)).toBe(false);
    expect(t.isCurrent(t.current())).toBe(true);
  });

  it('repetir la misma cuenta sin aviso no cambia la generación', () => {
    const t = createIdentityTracker();
    t.confirm('a');
    const withA = t.current();
    t.confirm('a');
    expect(t.isCurrent(withA)).toBe(true);
    t.confirm(null);
    expect(t.isCurrent(withA)).toBe(false);
  });
});
