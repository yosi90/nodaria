import type { FieldType, RelationStyle } from './types';
export const FIELD_TYPES: ReadonlyArray<[FieldType, string]> = [
  ['text', 'Texto'],
  ['longText', 'Texto largo'],
  ['number', 'Número'],
  ['boolean', 'Sí / no'],
  ['date', 'Fecha'],
  ['select', 'Lista de opciones'],
  ['nodeRef', 'Referencia a nodo'],
  ['nodeRefs', 'Referencias múltiples'],
  ['computed', 'Calculado'],
];
export const RELATION_STYLES: Record<RelationStyle, { label: string; dash?: string }> = {
  normal: { label: 'Normal' },
  strong: { label: 'Destacada' },
  hidden: { label: 'Oculta / secreta', dash: '7 6' },
};
export const COLORS = ['#8d7dff', '#5bd6c4', '#ff9f68', '#67a9ff', '#e37ad8', '#d7c45d', '#77d28f', '#ff7f9d'];
/** Versión actual del formato de proyecto. Cada incremento requiere un paso en `src/services/migrations.ts`. */
export const PROJECT_FORMAT_VERSION = 3;
