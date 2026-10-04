import { evaluateFormula } from './formulas';
import { kinshipRoles } from './kinship';
import { declaredFields } from './library';
import { effectiveChildTypes, relationEnds } from './constraints';
import type { FieldDefinition, FieldValue, Node, Project, Relation, Schema } from './types';

export const getSchema = (p: Project, id: string) => p.schemas.find(x => x.id === id);
export const getNode = (p: Project, id: string) => p.nodes.find(x => x.id === id);

/** Cadena de herencia de un tipo, del ancestro más lejano al propio tipo. Tolera ciclos. */
export function inheritedSchemas(p: Project, typeId: string) {
  const chain: Schema[] = [];
  const seen = new Set<string>();
  let cur = getSchema(p, typeId);
  while (cur && !seen.has(cur.id)) {
    seen.add(cur.id);
    chain.unshift(cur);
    cur = cur.parentTypeId ? getSchema(p, cur.parentTypeId) : undefined;
  }
  return chain;
}

/** Campos efectivos de un tipo. Un campo propio sustituye a uno heredado con la misma clave. */
export function allFields(p: Project, typeId: string) {
  // Un tipo sustituye los atributos heredados que repiten clave; dentro de un mismo tipo se conservan todos.
  // Un propio marcado en `yieldFieldIds` cede ante el heredado con su misma clave (ver `inheritance.ts`).
  let result: FieldDefinition[] = [];
  inheritedSchemas(p, typeId).forEach(s => {
    const declared = declaredFields(p, s)
      .filter((f, i, all) => all.findIndex(x => x.id === f.id) === i)
      // La misma preforma que ya llega por herencia se conserva en su sitio (no se repite).
      .filter(f => !result.some(r => r.id === f.id))
      .filter(f => !(s.yieldFieldIds.includes(f.id) && result.some(r => r.key === f.key)));
    const keys = new Set(declared.map(f => f.key));
    result = [...result.filter(f => !keys.has(f.key)), ...declared];
  });
  return result;
}

export function typeMatches(p: Project, typeId: string, allowed: string[]) {
  if (!allowed.length) return true;
  return allowed.some(id => inheritedSchemas(p, typeId).some(s => s.id === id));
}

/** Tipos que heredan, directa o indirectamente, de `schemaId` (sin incluirlo). */
export function schemaDescendants(p: Project, schemaId: string) {
  return new Set(
    p.schemas
      .filter(s => s.id !== schemaId && inheritedSchemas(p, s.id).some(ancestor => ancestor.id === schemaId))
      .map(s => s.id),
  );
}

/** Tipos que `schemaId` puede usar como padre de herencia sin crear ciclos. */
export function inheritanceCandidates(p: Project, schemaId: string) {
  const schema = getSchema(p, schemaId);
  const blocked = schemaDescendants(p, schemaId);
  return p.schemas.filter(s => s.id !== schemaId && s.kind === schema?.kind && !blocked.has(s.id));
}

/** Nodos, relaciones y subtipos que dependen de un tipo. */
export function schemaUsage(p: Project, schemaId: string) {
  return {
    nodes: p.nodes.filter(n => n.typeId === schemaId).length,
    relations: p.relations.filter(r => r.typeId === schemaId).length,
    subtypes: p.schemas.filter(s => s.parentTypeId === schemaId).length,
  };
}

/** Un tipo solo puede cambiar de clase (entidad/relación) si nada depende de él. */
export function canChangeSchemaKind(p: Project, schemaId: string) {
  const usage = schemaUsage(p, schemaId);
  return usage.nodes === 0 && usage.relations === 0 && usage.subtypes === 0;
}

/** Indica si un nodo de tipo `childTypeId` puede colgar de uno de tipo `parentTypeId`. */
export function canContain(p: Project, parentTypeId: string, childTypeId: string) {
  const allowed = effectiveChildTypes(p, parentTypeId);
  return allowed.length > 0 && typeMatches(p, childTypeId, allowed);
}

/** Tipos de entidad instanciables bajo `parentId` (o en la raíz si es `null`). */
export function creatableTypes(p: Project, parentId: string | null) {
  const parent = parentId ? getNode(p, parentId) : undefined;
  return p.schemas.filter(s => s.kind === 'entity' && !s.isAbstract && (!parent || canContain(p, parent.typeId, s.id)));
}

/** El propio nodo y todos sus descendientes en la jerarquía. */
export function descendants(p: Project, id: string) {
  const children = new Map<string, string[]>();
  p.nodes.forEach(n => {
    if (n.parentId) children.set(n.parentId, [...(children.get(n.parentId) ?? []), n.id]);
  });
  const result = new Set([id]);
  const pending = [id];
  while (pending.length) {
    (children.get(pending.pop()!) ?? []).forEach(child => {
      if (!result.has(child)) {
        result.add(child);
        pending.push(child);
      }
    });
  }
  return result;
}

/** Asignar `parentId` como padre de `nodeId` no crearía un ciclo. */
export function canSetParent(p: Project, nodeId: string, parentId: string | null) {
  if (parentId === null) return true;
  return Boolean(getNode(p, parentId)) && !descendants(p, nodeId).has(parentId);
}

/** Padres válidos para un nodo: sin ciclos y respetando los subnodos permitidos de cada tipo. */
export function parentCandidates(p: Project, nodeId: string) {
  const node = getNode(p, nodeId);
  if (!node) return [];
  const blocked = descendants(p, nodeId);
  return p.nodes.filter(n => !blocked.has(n.id) && canContain(p, n.typeId, node.typeId));
}

/** Profundidad de cada nodo en la jerarquía. Robusto frente a ciclos y padres inexistentes. */
export function nodeDepths(p: Project) {
  const byId = new Map(p.nodes.map(n => [n.id, n]));
  const depths = new Map<string, number>();
  const depthOf = (id: string): number => {
    const known = depths.get(id);
    if (known !== undefined) return known;
    const path: string[] = [];
    const onPath = new Set<string>();
    let cur = byId.get(id);
    while (cur && !depths.has(cur.id) && !onPath.has(cur.id)) {
      path.push(cur.id);
      onPath.add(cur.id);
      cur = cur.parentId ? byId.get(cur.parentId) : undefined;
    }
    let depth = cur && depths.has(cur.id) ? depths.get(cur.id)! + 1 : 0;
    for (let i = path.length - 1; i >= 0; i--) depths.set(path[i], depth++);
    return depths.get(id) ?? 0;
  };
  p.nodes.forEach(n => depthOf(n.id));
  return depths;
}

/**
 * Título propio de un nodo o relación: el campo marcado como título o, si no hay ninguno,
 * el primer campo de texto con valor. `undefined` si el elemento no tiene nombre propio.
 */
export function ownTitle(p: Project, item: Node | Relation) {
  const fields = allFields(p, item.typeId);
  const title = fields.find(f => f.isTitle) ?? fields.find(f => f.type === 'text' && item.values[f.id]);
  const value = title ? item.values[title.id] : undefined;
  return value === undefined || value === null || value === '' ? undefined : String(value);
}

export function nodeLabel(p: Project, n: Node) {
  return ownTitle(p, n) ?? getSchema(p, n.typeId)?.name ?? 'Nodo';
}

/** Nombre de una relación: su título propio («Hermanos») o, en su defecto, el de su tipo («Parentesco»). */
export function relationLabel(p: Project, r: Relation) {
  const kin = kinshipRoles(p, r);
  if (kin) return kin.source;
  return ownTitle(p, r) ?? getSchema(p, r.typeId)?.name ?? 'Relación';
}

/**
 * Papel de uno de los extremos: el del origen es el nombre propio de la relación (o el del tipo);
 * el del destino es `reverseName`, el nombre inverso del tipo o, si no hay, el mismo nombre.
 * En relaciones no dirigidas ambos extremos comparten nombre.
 */
export function relationRole(p: Project, r: Relation, end: 'source' | 'target') {
  const kin = kinshipRoles(p, r);
  if (kin) return kin[end];
  const forward = relationLabel(p, r);
  const schema = getSchema(p, r.typeId);
  if (end === 'source' || !schema?.directed) return forward;
  if (r.reverseName.trim()) return r.reverseName.trim();
  if (ownTitle(p, r) === undefined && schema.inverseName.trim()) return schema.inverseName.trim();
  return forward;
}

/**
 * Valor efectivo de un campo. Con `context` (un nodo del proyecto), los calculados usan el motor de
 * fórmulas completo (`src/domain/formulas.ts`: referencias, padre, contar, lista…); sin él (relaciones),
 * solo sustituyen `{clave}` por el valor del campo con esa clave.
 */
export function fieldValue(
  field: FieldDefinition,
  values: Record<string, FieldValue>,
  fields: FieldDefinition[],
  context?: { project: Project; node: Node },
) {
  if (field.type !== 'computed') return values[field.id];
  if (context) return evaluateFormula(context.project, context.node, field.formula);
  return field.formula.replace(/\{([^}]+)\}/g, (_, key: string) => {
    const source = fields.find(f => f.key === key.trim());
    const value = source ? values[source.id] : undefined;
    return Array.isArray(value) ? value.join(', ') : String(value ?? '');
  });
}

/** Tipos de relación válidos entre dos nodos concretos (al soltar una conexión arrastrada). */
export function compatibleRelationTypes(project: Project, sourceId: string, targetId: string) {
  const source = project.nodes.find(n => n.id === sourceId);
  const target = project.nodes.find(n => n.id === targetId);
  if (!source || !target) return [];
  return project.schemas.filter(s => {
    if (s.kind !== 'relationship') return false;
    const ends = relationEnds(project, s);
    return typeMatches(project, source.typeId, ends.source) && typeMatches(project, target.typeId, ends.target);
  });
}

/**
 * Texto de etiqueta o descripción de un atributo para un tipo concreto: `{tipo}` se sustituye por el
 * nombre del tipo, de modo que una preforma «Nombre del {tipo}» se lee «Nombre del Personaje».
 */
export function fieldText(text: string, typeName: string | undefined) {
  if (!text.includes('{')) return text;
  return text
    .replace(/\{\s*tipo\s*\}/gi, typeName ?? '')
    .replace(/\s{2,}/g, ' ')
    .trim();
}
