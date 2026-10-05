import { declaredFields, isFieldLink } from './library';
import { inheritedSchemas, inheritanceCandidates } from './selectors';
import type { FieldDefinition, Project, Schema } from './types';

/*
 * Solapes entre los atributos propios de un tipo y los que hereda.
 * - `duplicate`: el mismo atributo (misma preforma) ya llega por herencia; el propio sobra.
 * - `conflict`: un atributo propio repite la clave de uno heredado distinto. Por defecto prevalece el
 *   más específico (el propio); el tipo puede ceder con `Schema.yieldFieldIds`, y entonces manda el heredado.
 */

export interface FieldOverlap {
  kind: 'duplicate' | 'conflict';
  /** Atributo propio (declarado en el tipo). */
  field: FieldDefinition;
  /** Atributo heredado con el que solapa. */
  inherited: FieldDefinition;
  /** Tipo ancestro que lo declara. */
  from: Schema;
  /** En un conflicto, si este tipo cede ante el heredado. */
  yields: boolean;
}

/** Atributos heredados por un tipo (sin los propios), cada uno con el ancestro que lo declara. */
export function inheritedFields(p: Project, schema: Schema): { field: FieldDefinition; from: Schema }[] {
  const chain = inheritedSchemas(p, schema.id).slice(0, -1);
  const result: { field: FieldDefinition; from: Schema }[] = [];
  chain.forEach(ancestor => {
    declaredFields(p, ancestor).forEach(field => {
      // Un nivel más específico sustituye al anterior con la misma clave (salvo que ceda).
      const index = result.findIndex(r => r.field.key === field.key);
      if (index >= 0) {
        if (ancestor.yieldFieldIds.includes(field.id)) return;
        result.splice(index, 1);
      }
      result.push({ field, from: ancestor });
    });
  });
  return result;
}

export function fieldOverlaps(p: Project, schema: Schema): FieldOverlap[] {
  const inherited = inheritedFields(p, schema);
  return declaredFields(p, schema).flatMap((field): FieldOverlap[] => {
    const same = inherited.find(r => r.field.id === field.id);
    if (same) return [{ kind: 'duplicate' as const, field, inherited: same.field, from: same.from, yields: false }];
    const clash = inherited.find(r => r.field.key === field.key);
    if (clash) {
      return [
        {
          kind: 'conflict' as const,
          field,
          inherited: clash.field,
          from: clash.from,
          yields: schema.yieldFieldIds.includes(field.id),
        },
      ];
    }
    return [];
  });
}

/** Mueve un tipo dentro de la lista de tipos, antes o después de otro de la misma clase. */
export function reorderSchema(p: Project, id: string, targetId: string, after: boolean): Project {
  if (id === targetId) return p;
  const moving = p.schemas.find(s => s.id === id);
  const target = p.schemas.find(s => s.id === targetId);
  if (!moving || !target || moving.kind !== target.kind) return p;
  const rest = p.schemas.filter(s => s.id !== id);
  const index = rest.findIndex(s => s.id === targetId);
  rest.splice(index + (after ? 1 : 0), 0, moving);
  return { ...p, schemas: rest };
}

export type DropZone = 'before' | 'after' | 'inside';

/**
 * Mueve un tipo arrastrado sobre otro de la lista. «inside» lo hace heredar del destino (si no crea un
 * ciclo); «before»/«after» lo colocan junto al destino como hermano suyo, adoptando su mismo padre
 * (soltarlo junto a una raíz lo saca de la herencia). Un destino inválido deja el proyecto igual.
 */
export function moveSchema(p: Project, id: string, targetId: string, zone: DropZone): Project {
  if (id === targetId) return p;
  const moving = p.schemas.find(s => s.id === id);
  const target = p.schemas.find(s => s.id === targetId);
  if (!moving || !target || moving.kind !== target.kind) return p;
  const parentTypeId = zone === 'inside' ? target.id : target.parentTypeId;
  if (parentTypeId && !inheritanceCandidates(p, id).some(s => s.id === parentTypeId)) return p;
  const reparented = { ...p, schemas: p.schemas.map(s => (s.id === id ? { ...s, parentTypeId } : s)) };
  if (zone === 'inside') {
    // Al final de los hijos actuales del destino (o justo tras el destino si aún no tiene).
    const children = reparented.schemas.filter(s => s.parentTypeId === target.id && s.id !== id);
    const anchor = children.length ? children[children.length - 1].id : target.id;
    return reorderSchema(reparented, id, anchor, true);
  }
  return reorderSchema(reparented, id, targetId, zone === 'after');
}

/** Árbol de herencia de los tipos de una clase, respetando el orden de la lista: cada entrada con su profundidad. */
export function schemaTree(p: Project, kind: Schema['kind']): { schema: Schema; depth: number }[] {
  const ofKind = p.schemas.filter(s => s.kind === kind);
  const ids = new Set(ofKind.map(s => s.id));
  const result: { schema: Schema; depth: number }[] = [];
  const visit = (parentId: string | null, depth: number, seen: Set<string>) => {
    ofKind
      .filter(s => (parentId === null ? !s.parentTypeId || !ids.has(s.parentTypeId) : s.parentTypeId === parentId))
      .forEach(s => {
        if (seen.has(s.id)) return;
        result.push({ schema: s, depth });
        visit(s.id, depth + 1, new Set([...seen, s.id]));
      });
  };
  visit(null, 0, new Set());
  return result;
}

export { isFieldLink };
