import { GENDERS } from './constants';
import { allFields } from './selectors';
import type { FieldDefinition, Project, Schema } from './types';

/*
 * Estadísticas por tipo de entidad: cuántos nodos hay, cuántas relaciones tienen de media y cómo se
 * reparten los valores de los atributos de lista (opciones, etiquetas, sí/no, género, escala).
 */

export interface ValueCount {
  value: string;
  count: number;
}

export interface FieldDistribution {
  field: FieldDefinition;
  /** Valores ordenados de más a menos frecuente. */
  values: ValueCount[];
  /** Nodos sin valor en este atributo. */
  empty: number;
}

export interface TypeStats {
  schema: Schema;
  nodes: number;
  /** Media de relaciones por nodo (en cualquier sentido). */
  averageRelations: number;
  /** Nodos sin ninguna relación. */
  withoutRelations: number;
  distributions: FieldDistribution[];
}

const DISTRIBUTABLE = new Set(['select', 'tags', 'boolean', 'gender', 'scale']);

function labelOf(field: FieldDefinition, value: unknown): string {
  if (field.type === 'boolean') return value ? 'Sí' : 'No';
  if (field.type === 'gender') return GENDERS.find(([key]) => key === String(value))?.[1] ?? String(value);
  if (field.type === 'scale') return `${'★'.repeat(Number(value))}${'☆'.repeat(Math.max(0, 5 - Number(value)))}`;
  return String(value);
}

export function typeStats(p: Project): TypeStats[] {
  const relationCount = new Map<string, number>();
  p.relations.forEach(r => {
    relationCount.set(r.sourceId, (relationCount.get(r.sourceId) ?? 0) + 1);
    relationCount.set(r.targetId, (relationCount.get(r.targetId) ?? 0) + 1);
  });
  return p.schemas
    .filter(s => s.kind === 'entity' && !s.isAbstract)
    .map(schema => {
      const nodes = p.nodes.filter(n => n.typeId === schema.id);
      const relations = nodes.map(n => relationCount.get(n.id) ?? 0);
      const distributions = allFields(p, schema.id)
        .filter(f => DISTRIBUTABLE.has(f.type))
        .map(field => {
          const counts = new Map<string, number>();
          let empty = 0;
          nodes.forEach(n => {
            const raw = n.values[field.id];
            const items = Array.isArray(raw) ? raw : raw === undefined || raw === null || raw === '' ? [] : [raw];
            if (!items.length && field.type !== 'boolean') {
              empty++;
              return;
            }
            (items.length ? items : [false]).forEach(v => {
              const label = labelOf(field, v);
              counts.set(label, (counts.get(label) ?? 0) + 1);
            });
          });
          const values = [...counts.entries()]
            .map(([value, count]) => ({ value, count }))
            .sort((x, y) => y.count - x.count || x.value.localeCompare(y.value));
          return { field, values, empty };
        })
        .filter(d => d.values.length > 0);
      return {
        schema,
        nodes: nodes.length,
        averageRelations: nodes.length ? relations.reduce((s, c) => s + c, 0) / nodes.length : 0,
        withoutRelations: relations.filter(c => c === 0).length,
        distributions,
      };
    })
    .filter(t => t.nodes > 0)
    .sort((x, y) => y.nodes - x.nodes || x.schema.name.localeCompare(y.schema.name));
}
