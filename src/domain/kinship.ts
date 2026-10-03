import { allFields, getSchema } from './selectors';
import type { Gender, KinshipTerm, Node, Project, Relation } from './types';

/*
 * Parentesco: vocabulario por proyecto para las relaciones genealógicas. Cada término tiene nombre
 * neutro, masculino y femenino, una contraparte («Progenitor/a» ↔ «Hijo/a») y una generación
 * (+1 ascendiente, −1 descendiente, 0 misma). Las de ascendencia directa (`lineage`) forman el árbol.
 */

const term = (
  id: string,
  neutral: string,
  masculine: string,
  feminine: string,
  counterpartId: string,
  generation: number,
  lineage = false,
): KinshipTerm => ({ id, neutral, masculine, feminine, counterpartId, generation, lineage });

/** Vocabulario inicial de un proyecto; el usuario puede cambiarlo, ampliarlo o reducirlo. */
export function defaultKinship(): KinshipTerm[] {
  return [
    term('progenitor', 'Progenitor/a', 'Padre', 'Madre', 'hijo', 1, true),
    term('hijo', 'Hijo/a', 'Hijo', 'Hija', 'progenitor', -1, true),
    term('padrastro', 'Padrastro/madrastra', 'Padrastro', 'Madrastra', 'hijastro', 1, true),
    term('hijastro', 'Hijastro/a', 'Hijastro', 'Hijastra', 'padrastro', -1, true),
    term('abuelo', 'Abuelo/a', 'Abuelo', 'Abuela', 'nieto', 2),
    term('nieto', 'Nieto/a', 'Nieto', 'Nieta', 'abuelo', -2),
    term('bisabuelo', 'Bisabuelo/a', 'Bisabuelo', 'Bisabuela', 'bisnieto', 3),
    term('bisnieto', 'Bisnieto/a', 'Bisnieto', 'Bisnieta', 'bisabuelo', -3),
    term('hermano', 'Hermano/a', 'Hermano', 'Hermana', 'hermano', 0),
    term('medio_hermano', 'Medio hermano/a', 'Medio hermano', 'Media hermana', 'medio_hermano', 0),
    term('gemelo', 'Gemelo/a', 'Gemelo', 'Gemela', 'gemelo', 0),
    term('tio', 'Tío/a', 'Tío', 'Tía', 'sobrino', 1),
    term('sobrino', 'Sobrino/a', 'Sobrino', 'Sobrina', 'tio', -1),
    term('primo', 'Primo/a', 'Primo', 'Prima', 'primo', 0),
    term('pareja', 'Pareja', 'Pareja', 'Pareja', 'pareja', 0),
    term('conyuge', 'Cónyuge', 'Esposo', 'Esposa', 'conyuge', 0),
    term('expareja', 'Expareja', 'Expareja', 'Expareja', 'expareja', 0),
    term('suegro', 'Suegro/a', 'Suegro', 'Suegra', 'yerno', 1),
    term('yerno', 'Yerno o nuera', 'Yerno', 'Nuera', 'suegro', -1),
    term('cunado', 'Cuñado/a', 'Cuñado', 'Cuñada', 'cunado', 0),
    term('padrino', 'Padrino/madrina', 'Padrino', 'Madrina', 'ahijado', 1),
    term('ahijado', 'Ahijado/a', 'Ahijado', 'Ahijada', 'padrino', -1),
  ];
}

export const kinshipTerm = (p: Project, id: string | null | undefined) =>
  id ? p.kinship.find(t => t.id === id) : undefined;

/** Nombre del término según el género; sin género (o con `neutral`), el neutro. */
export function kinshipName(t: KinshipTerm, gender: Gender, neutral = false) {
  if (neutral) return t.neutral;
  if (gender === 'm') return t.masculine || t.neutral;
  if (gender === 'f') return t.feminine || t.neutral;
  return t.neutral;
}

/** Género de un nodo: el valor de su primer atributo de tipo «Género», si lo tiene. */
export function nodeGender(p: Project, node: Node | undefined): Gender {
  if (!node) return '';
  const field = allFields(p, node.typeId).find(f => f.type === 'gender');
  const value = field ? node.values[field.id] : undefined;
  return value === 'm' || value === 'f' || value === 'n' ? value : '';
}

/** Un tipo de entidad tiene atributo de género (propio, heredado o compartido). */
export const typeHasGender = (p: Project, typeId: string) => allFields(p, typeId).some(f => f.type === 'gender');

/** Papel de cada extremo de una relación genealógica: el término para el origen y su contraparte para el destino. */
export function kinshipRoles(p: Project, r: Relation): { source: string; target: string } | null {
  const schema = getSchema(p, r.typeId);
  const t = kinshipTerm(p, r.kinshipId);
  if (!schema?.genealogical || !t) return null;
  const source = p.nodes.find(n => n.id === r.sourceId);
  const target = p.nodes.find(n => n.id === r.targetId);
  const counterpart = kinshipTerm(p, t.counterpartId) ?? t;
  return {
    source: kinshipName(t, nodeGender(p, source), r.kinshipNeutral),
    target: kinshipName(counterpart, nodeGender(p, target), r.kinshipNeutral),
  };
}

/**
 * Pares (superior, inferior) que una relación genealógica aporta a la estructura: solo la
 * ascendencia directa (`lineage`), con el ascendiente como superior según el signo de la generación.
 */
export function kinshipStructureLink(p: Project, r: Relation): { parentId: string; childId: string } | null {
  const t = kinshipTerm(p, r.kinshipId);
  if (!t?.lineage || !t.generation) return null;
  return t.generation > 0
    ? { parentId: r.sourceId, childId: r.targetId }
    : { parentId: r.targetId, childId: r.sourceId };
}

/** Término por defecto al crear «dentro de» un ascendiente: el primer descendiente directo. */
export const defaultChildTerm = (p: Project) => p.kinship.find(t => t.lineage && t.generation < 0) ?? null;

/** Comprueba que las contrapartes existen y son mutuas; devuelve avisos legibles. */
export function kinshipIssues(terms: KinshipTerm[]): string[] {
  const ids = new Set(terms.map(t => t.id));
  const issues: string[] = [];
  terms.forEach(t => {
    if (!ids.has(t.counterpartId)) issues.push(`«${t.neutral}» apunta a una contraparte que no existe.`);
    else {
      const cp = terms.find(x => x.id === t.counterpartId)!;
      if (cp.counterpartId !== t.id) issues.push(`«${t.neutral}» ↔ «${cp.neutral}» no son contrapartes mutuas.`);
    }
  });
  return issues;
}
