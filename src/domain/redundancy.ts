import { analysisLinks } from './centrality';
import { allFields } from './selectors';
import type { FieldDefinition, FieldValue, Node, Project } from './types';

/*
 * Posibles redundancias: dos nodos del mismo tipo que coinciden en casi todos los atributos con valor
 * y en casi todos sus vecinos. Son candidatos a ser el mismo personaje duplicado o a ocupar el mismo
 * hueco; la decisión es del usuario. Solo se comparan señales presentes en al menos uno de los dos.
 */

export interface RedundancyPair {
  a: Node;
  b: Node;
  /** 0–1: proporción de señales (atributos y vecinos) en las que coinciden. */
  score: number;
  /** Atributos con el mismo valor en ambos. */
  sharedFields: FieldDefinition[];
  /** Atributos con valor distinto (o solo en uno). */
  differingFields: FieldDefinition[];
  sharedNeighbours: number;
  totalNeighbours: number;
}

const comparable = (f: FieldDefinition) => !f.isTitle && f.type !== 'computed' && f.type !== 'image';
const isEmpty = (v: FieldValue | undefined) =>
  v === undefined || v === null || v === '' || (Array.isArray(v) && !v.length);
const sameValue = (a: FieldValue | undefined, b: FieldValue | undefined) => {
  if (Array.isArray(a) || Array.isArray(b)) {
    const x = Array.isArray(a) ? [...a].sort() : [];
    const y = Array.isArray(b) ? [...b].sort() : [];
    return x.length === y.length && x.every((v, i) => v === y[i]);
  }
  return String(a).trim().toLowerCase() === String(b).trim().toLowerCase();
};

/** Mínimo de señales presentes para que una pareja cuente. */
export const MIN_SIGNALS = 3;
export const DEFAULT_THRESHOLD = 0.75;

export function redundancyPairs(p: Project, threshold = DEFAULT_THRESHOLD): RedundancyPair[] {
  const neighbours = new Map<string, Set<string>>();
  analysisLinks(p).forEach(({ a, b }) => {
    (neighbours.get(a) ?? neighbours.set(a, new Set()).get(a)!).add(b);
    (neighbours.get(b) ?? neighbours.set(b, new Set()).get(b)!).add(a);
  });
  const byType = new Map<string, Node[]>();
  p.nodes.forEach(n => byType.set(n.typeId, [...(byType.get(n.typeId) ?? []), n]));
  const pairs: RedundancyPair[] = [];

  byType.forEach((nodes, typeId) => {
    const fields = allFields(p, typeId).filter(comparable);
    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        const a = nodes[i];
        const b = nodes[j];
        const sharedFields: FieldDefinition[] = [];
        const differingFields: FieldDefinition[] = [];
        fields.forEach(f => {
          const va = a.values[f.id];
          const vb = b.values[f.id];
          if (isEmpty(va) && isEmpty(vb)) return;
          (sameValue(va, vb) ? sharedFields : differingFields).push(f);
        });
        // Vecinos (relaciones, jerarquía y referencias) sin contar al otro miembro de la pareja:
        // que estén relacionados entre sí no los hace redundantes.
        const na = new Set([...(neighbours.get(a.id) ?? [])].filter(id => id !== b.id));
        const nb = new Set([...(neighbours.get(b.id) ?? [])].filter(id => id !== a.id));
        const union = new Set([...na, ...nb]);
        const sharedNeighbours = [...na].filter(id => nb.has(id)).length;
        const signals = sharedFields.length + differingFields.length + union.size;
        if (signals < MIN_SIGNALS) continue;
        const score = (sharedFields.length + sharedNeighbours) / signals;
        if (score >= threshold) {
          pairs.push({ a, b, score, sharedFields, differingFields, sharedNeighbours, totalNeighbours: union.size });
        }
      }
    }
  });
  return pairs.sort((x, y) => y.score - x.score);
}
