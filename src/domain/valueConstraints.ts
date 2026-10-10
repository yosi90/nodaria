import type { FieldDefinition, FieldType, FieldValue } from './types';

/** La escala ya limita sus valores a 1–5; solo números y calculados necesitan esta restricción. */
export function supportsNonNegative(type: FieldType | undefined): boolean {
  return type === 'number' || type === 'computed';
}

/** Avisa de valores numéricos negativos sin modificar el dato ni exigir que sea numérico. */
export function nonNegativeWarning(field: FieldDefinition, value: FieldValue | undefined): string | null {
  if (!supportsNonNegative(field.type) || !field.nonNegative) return null;
  if (typeof value !== 'number' && typeof value !== 'string') return null;
  if (typeof value === 'string' && !value.trim()) return null;
  const number = Number(value);
  const negative = Number.isFinite(number) && number < 0;
  return negative ? 'El valor no puede ser negativo. Revisa los datos de este atributo.' : null;
}
