import { describe, expect, it } from 'vitest';
import { nonNegativeWarning } from './valueConstraints';
import { field, node, project, schema } from '../test/fixtures';
import { evaluateFormula } from './formulas';
import type { FieldType } from './types';
import { FIELD_TYPES } from './constants';

describe('nonNegativeWarning', () => {
  for (const type of ['number', 'computed'] as FieldType[]) {
    it(`detecta negativos en atributos ${type}`, () => {
      const f = field('valor', { type, nonNegative: true });
      expect(nonNegativeWarning(f, -2)).toContain('no puede ser negativo');
      expect(nonNegativeWarning(f, ' -2.5 ')).toContain('no puede ser negativo');
      for (const value of [0, '0', 2, '2.5', '', ' ', null, undefined]) expect(nonNegativeWarning(f, value)).toBeNull();
    });
  }

  it('ignora valores no numéricos, booleanos y fechas', () => {
    const f = field('valor', { type: 'computed', nonNegative: true });
    for (const value of ['texto', '-2 años', '2026-10-10', false, true, 'Infinity', NaN])
      expect(nonNegativeWarning(f, value)).toBeNull();
  });

  for (const [type] of FIELD_TYPES.filter(([type]) => type !== 'number' && type !== 'computed')) {
    it(`ignora restricciones antiguas en ${type}, incluso con valores que parecen números`, () => {
      const f = field('valor', { type, nonNegative: true });
      for (const value of [-2, '-2', ['-2']]) expect(nonNegativeWarning(f, value)).toBeNull();
    });
  }

  it('respeta la desactivación y no trata arrays como resultados numéricos', () => {
    const f = field('valor', { type: 'number', nonNegative: false });
    expect(nonNegativeWarning(f, -1)).toBeNull();
    expect(nonNegativeWarning({ ...f, nonNegative: true }, ['-1'])).toBeNull();
  });

  it('detecta una edad negativa manteniendo el resultado de la fórmula', () => {
    const birth = field('nacimiento', { type: 'date' });
    const age = field('edad', { type: 'computed', formula: '{edad(nacimiento)}', nonNegative: true });
    const p = project({ schemas: [schema('persona', { fields: [birth, age] })] });
    p.calendar.today = { year: 2026, month: 10, day: 10 };
    const n = node('persona1', 'persona', null, { nacimiento: '2027-10-10' });
    const result = evaluateFormula(p, n, age.formula);
    expect(result).toBe('-1');
    expect(nonNegativeWarning(age, result)).toContain('no puede ser negativo');
  });
});
