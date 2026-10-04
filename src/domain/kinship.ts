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
  couple = false,
): KinshipTerm => ({ id, neutral, masculine, feminine, counterpartId, generation, lineage, couple });

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
    term('pareja', 'Pareja', 'Pareja', 'Pareja', 'pareja', 0, false, true),
    term('conyuge', 'Cónyuge', 'Esposo', 'Esposa', 'conyuge', 0, false, true),
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

/** Parentesco deducido del árbol: `sourceId` es `termId` de `targetId`, a través de `via`. */
export interface DerivedKin {
  sourceId: string;
  targetId: string;
  termId: string;
  via: string;
}

/** Términos que describen a hermanos (comparten al menos un progenitor). */
const SIBLING_TERMS = ['hermano', 'medio_hermano', 'gemelo'];

/**
 * Parentescos que se deducen de la ascendencia directa: abuelos y nietos (progenitor del
 * progenitor), hermanos (comparten progenitor), tíos y sobrinos (hermanos del progenitor, explícitos
 * o deducidos) y primos (hijos de los tíos). Solo se emiten los términos que existan en el
 * vocabulario, por su identificador original (`abuelo`, `nieto`, `hermano`, `tio`, `sobrino`, `primo`).
 */
export function derivedKinship(p: Project, genealogyId: string): DerivedKin[] {
  const has = (id: string) => p.kinship.some(t => t.id === id);
  const parentsOf = new Map<string, string[]>();
  const childrenOf = new Map<string, string[]>();
  const explicitSiblings = new Map<string, string[]>();
  p.relations
    .filter(r => r.typeId === genealogyId)
    .forEach(r => {
      const link = kinshipStructureLink(p, r);
      if (link) {
        parentsOf.set(link.childId, [...(parentsOf.get(link.childId) ?? []), link.parentId]);
        childrenOf.set(link.parentId, [...(childrenOf.get(link.parentId) ?? []), link.childId]);
      } else if (r.kinshipId && SIBLING_TERMS.includes(r.kinshipId)) {
        explicitSiblings.set(r.sourceId, [...(explicitSiblings.get(r.sourceId) ?? []), r.targetId]);
        explicitSiblings.set(r.targetId, [...(explicitSiblings.get(r.targetId) ?? []), r.sourceId]);
      }
    });
  const out: DerivedKin[] = [];
  const seen = new Set<string>();
  const add = (sourceId: string, targetId: string, termId: string, via: string) => {
    if (sourceId === targetId || !has(termId)) return;
    const key = `${sourceId}|${targetId}|${termId}`;
    if (seen.has(key)) return;
    seen.add(key);
    out.push({ sourceId, targetId, termId, via });
  };
  const siblingsOf = (id: string) => {
    const result = new Set(explicitSiblings.get(id) ?? []);
    (parentsOf.get(id) ?? []).forEach(par => (childrenOf.get(par) ?? []).forEach(s => s !== id && result.add(s)));
    return [...result];
  };
  p.nodes.forEach(n => {
    (parentsOf.get(n.id) ?? []).forEach(par => {
      (parentsOf.get(par) ?? []).forEach(gp => {
        add(gp, n.id, 'abuelo', par);
        add(n.id, gp, 'nieto', par);
      });
      (childrenOf.get(par) ?? []).forEach(sib => add(n.id, sib, 'hermano', par));
      siblingsOf(par).forEach(uncle => {
        add(uncle, n.id, 'tio', par);
        add(n.id, uncle, 'sobrino', par);
        (childrenOf.get(uncle) ?? []).forEach(cousin => add(n.id, cousin, 'primo', uncle));
      });
    });
  });
  return out;
}

/** Claves `origen|destino|término` de los parentescos deducidos, para saber si una relación explícita ya se deduce. */
export function impliedKinship(p: Project, genealogyId: string): Set<string> {
  return new Set(derivedKinship(p, genealogyId).map(d => `${d.sourceId}|${d.targetId}|${d.termId}`));
}

/** Una relación de parentesco explícita que el árbol ya deduce (abuelo, hermano, tío, sobrino, primo). */
export function isImpliedKinship(implied: Set<string>, r: Relation): boolean {
  if (!r.kinshipId) return false;
  const term = SIBLING_TERMS.includes(r.kinshipId) ? 'hermano' : r.kinshipId;
  return implied.has(`${r.sourceId}|${r.targetId}|${term}`);
}

/** Grafo de parentesco de un tipo genealógico, con la generación de cada nodo. */
export interface KinshipGraph {
  /** Progenitores de cada nodo (vínculos de árbol). */
  parentsOf: Map<string, string[]>;
  childrenOf: Map<string, string[]>;
  /** Parejas: término «pareja» o progenitores con hijos comunes. */
  couples: [string, string][];
  /** Parientes de la misma generación que no son pareja (hermanos, primos, cuñados…). */
  peers: Map<string, string[]>;
  /** Componentes conexos (nodos unidos por cualquier parentesco), en orden de aparición. */
  components: string[][];
  /** Generación de cada nodo dentro de su componente (0 = la más antigua). */
  gen: Map<string, number>;
}

/**
 * Generaciones: dentro de cada clúster de ascendencia (nodos unidos por vínculos de árbol o pareja),
 * un hijo está una generación por debajo de cada progenitor (camino más largo) y las parejas comparten
 * generación. Los clústeres se encajan entre sí con el salto que impone cada término (tíos, abuelos…),
 * resolviendo conflictos con la primera asignación. Así un progenitor queda siempre por encima de sus
 * hijos aunque otra relación lo contradiga, y esa contradicción se puede detectar (`kinshipConflicts`).
 */
export function kinshipGraph(p: Project, genealogyId: string): KinshipGraph {
  const ids = new Set(p.nodes.map(n => n.id));
  const terms = new Map(p.kinship.map(t => [t.id, t]));
  const kin = p.relations.filter(r => r.typeId === genealogyId && ids.has(r.sourceId) && ids.has(r.targetId));
  const neighbors = new Map<string, { other: string; delta: number }[]>();
  const push = (a: string, b: string, delta: number) =>
    neighbors.set(a, [...(neighbors.get(a) ?? []), { other: b, delta }]);
  const parentsOf = new Map<string, string[]>();
  const childrenOf = new Map<string, string[]>();
  const couples: [string, string][] = [];
  const peers = new Map<string, string[]>();
  kin.forEach(r => {
    const t = terms.get(r.kinshipId ?? '');
    const g = t?.generation ?? 0;
    push(r.sourceId, r.targetId, g);
    push(r.targetId, r.sourceId, -g);
    const link = kinshipStructureLink(p, r);
    if (link) {
      parentsOf.set(link.childId, [...(parentsOf.get(link.childId) ?? []), link.parentId]);
      childrenOf.set(link.parentId, [...(childrenOf.get(link.parentId) ?? []), link.childId]);
    } else if (g === 0 && r.sourceId !== r.targetId) {
      if (t?.couple) couples.push([r.sourceId, r.targetId]);
      else {
        peers.set(r.sourceId, [...(peers.get(r.sourceId) ?? []), r.targetId]);
        peers.set(r.targetId, [...(peers.get(r.targetId) ?? []), r.sourceId]);
      }
    }
  });
  parentsOf.forEach(ps => {
    for (let i = 0; i < ps.length; i++) for (let j = i + 1; j < ps.length; j++) couples.push([ps[i], ps[j]]);
  });

  const clusterOf = new Map<string, string>();
  const findCluster = (id: string): string => {
    const parent = clusterOf.get(id) ?? id;
    if (parent === id) return id;
    const top = findCluster(parent);
    clusterOf.set(id, top);
    return top;
  };
  parentsOf.forEach((ps, child) => ps.forEach(par => clusterOf.set(findCluster(par), findCluster(child))));
  couples.forEach(([x, y]) => clusterOf.set(findCluster(x), findCluster(y)));
  const depth = new Map<string, number>();
  neighbors.forEach((_, id) => depth.set(id, 0));
  for (let pass = 0; pass < neighbors.size + 1; pass++) {
    let changed = false;
    const raise = (id: string, value: number) => {
      if ((depth.get(id) ?? 0) < value) {
        depth.set(id, value);
        changed = true;
      }
    };
    parentsOf.forEach((ps, child) => ps.forEach(par => raise(child, depth.get(par)! + 1)));
    couples.forEach(([x, y]) => {
      raise(x, depth.get(y)!);
      raise(y, depth.get(x)!);
    });
    if (!changed) break;
  }

  const components: string[][] = [];
  const gen = new Map<string, number>();
  const seen = new Set<string>();
  p.nodes.forEach(root => {
    if (seen.has(root.id) || !neighbors.has(root.id)) return;
    const offset = new Map<string, number>([[findCluster(root.id), -depth.get(root.id)!]]);
    const genOf = (id: string) => offset.get(findCluster(id))! + depth.get(id)!;
    const members: string[] = [];
    const queue = [root.id];
    seen.add(root.id);
    while (queue.length) {
      const id = queue.shift()!;
      members.push(id);
      gen.set(id, genOf(id));
      (neighbors.get(id) ?? []).forEach(({ other, delta }) => {
        if (seen.has(other)) return;
        const cluster = findCluster(other);
        if (!offset.has(cluster)) offset.set(cluster, genOf(id) + delta - depth.get(other)!);
        seen.add(other);
        queue.push(other);
      });
    }
    const min = Math.min(...members.map(id => gen.get(id)!));
    members.forEach(id => gen.set(id, gen.get(id)! - min));
    components.push(members);
  });
  return { parentsOf, childrenOf, couples, peers, components, gen };
}

/** Relación de parentesco que no cuadra con las generaciones del árbol (p. ej., una ascendencia guardada al revés). */
export interface KinshipConflict {
  relation: Relation;
  /** Generaciones que el término dice que hay del origen al destino (+ = destino más joven). */
  expected: number;
  /** Generaciones que hay según la ascendencia registrada. */
  actual: number;
}

/**
 * Relaciones cuyo salto de generación no coincide con el del árbol. Las de ascendencia definen las
 * generaciones, así que no entran en conflicto por sí mismas: lo que avisa son las demás (abuelo,
 * sobrino, hermano…) que las contradicen, y la causa suele ser una ascendencia guardada al revés.
 */
export function kinshipConflicts(
  p: Project,
  genealogyId: string,
  graph = kinshipGraph(p, genealogyId),
): KinshipConflict[] {
  const terms = new Map(p.kinship.map(t => [t.id, t]));
  return p.relations
    .filter(r => r.typeId === genealogyId && graph.gen.has(r.sourceId) && graph.gen.has(r.targetId))
    .map(r => ({
      relation: r,
      expected: terms.get(r.kinshipId ?? '')?.generation ?? 0,
      actual: graph.gen.get(r.targetId)! - graph.gen.get(r.sourceId)!,
    }))
    .filter(c => c.expected !== c.actual);
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
