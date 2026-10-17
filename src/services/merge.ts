import type { Project } from '../domain/types';

/*
 * Combina dos versiones de un proyecto compartido que partieron de la misma (docs/roadmaps/
 * ROADMAP_COLABORACION.md, hito 3): la de aquí y la que otra persona ya guardó en el grupo. Es una
 * combinación a tres bandas por identidad: las listas con `id` (nodos, relaciones, tipos, atributos,
 * vistas guardadas…) se combinan elemento a elemento y los objetos, clave a clave. Lo que solo cambió
 * un lado se queda; lo que cambiaron los dos de forma distinta es un conflicto y gana el grupo (quien
 * guardó primero), y el motor guarda aparte la versión de aquí. Borrar algo que el otro lado cambió
 * también es un conflicto, y lo cambiado se conserva. La vista del mapa es de cada persona: se queda la
 * de aquí. El resultado se repara después (`prepareProject`): dos movimientos que juntos forman un ciclo
 * o una relación hacia un nodo borrado no pasan.
 */

export interface MergeResult {
  project: Project;
  /** Rutas donde los dos lados cambiaron lo mismo de forma distinta (ganó el grupo). */
  conflicts: string[];
}

type Json = unknown;

const isObject = (value: Json): value is Record<string, Json> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/** Clave de un elemento de lista: su `id`, o el atributo compartido al que apunta un vínculo `{ ref }`. */
function keyOf(item: Json): string | null {
  if (!isObject(item)) return null;
  if (typeof item.id === 'string') return item.id;
  if (typeof item.ref === 'string') return `ref:${item.ref}`;
  return null;
}

const keyed = (list: Json): list is Json[] => Array.isArray(list) && list.every(item => keyOf(item) !== null);

function same(a: Json, b: Json): boolean {
  if (a === b) return true;
  if (typeof a !== typeof b || a === null || b === null || typeof a !== 'object') return false;
  if (Array.isArray(a)) return Array.isArray(b) && a.length === b.length && a.every((item, i) => same(item, b[i]));
  if (Array.isArray(b)) return false;
  const ka = Object.keys(a as object).filter(k => (a as Record<string, Json>)[k] !== undefined);
  const kb = Object.keys(b as object).filter(k => (b as Record<string, Json>)[k] !== undefined);
  return ka.length === kb.length && ka.every(k => same((a as Record<string, Json>)[k], (b as Record<string, Json>)[k]));
}

function merge(base: Json, local: Json, remote: Json, path: string, conflicts: string[]): Json {
  if (same(local, remote)) return local;
  if (same(base, local)) return remote;
  if (same(base, remote)) return local;
  if (isObject(local) && isObject(remote)) {
    const origin = isObject(base) ? base : {};
    const keys = [...Object.keys(remote), ...Object.keys(local).filter(k => !(k in remote))];
    const out: Record<string, Json> = {};
    for (const key of keys) {
      const value = merge(origin[key], local[key], remote[key], `${path}.${key}`, conflicts);
      if (value !== undefined) out[key] = value;
    }
    return out;
  }
  if (keyed(local) && keyed(remote) && (base === undefined || keyed(base)))
    return mergeList(base ?? [], local, remote, path, conflicts);
  conflicts.push(path);
  return remote;
}

function mergeList(base: Json[], local: Json[], remote: Json[], path: string, conflicts: string[]): Json[] {
  const map = (list: Json[]) => new Map(list.map(item => [keyOf(item)!, item]));
  const [b, l, r] = [map(base), map(local), map(remote)];
  const order = (list: Json[]) => list.map(item => keyOf(item)!);
  // Si solo aquí se reordenó, manda el orden de aquí; si no, el del grupo. Lo nuevo del otro lado, al final.
  const localFirst = same(order(base), order(remote));
  const [first, second] = localFirst ? [order(local), order(remote)] : [order(remote), order(local)];
  const keys = [...first, ...second.filter(key => !first.includes(key))];

  const out: Json[] = [];
  for (const key of keys) {
    const [B, L, R] = [b.get(key), l.get(key), r.get(key)];
    const at = `${path}[${key}]`;
    if (L !== undefined && R !== undefined) out.push(merge(B, L, R, at, conflicts));
    else if (L !== undefined) {
      // Nuevo aquí, o borrado allí: si aquí no se tocó, se borra; si se cambió, se conserva.
      if (B === undefined) out.push(L);
      else if (!same(B, L)) {
        conflicts.push(at);
        out.push(L);
      }
    } else if (R !== undefined) {
      if (B === undefined) out.push(R);
      else if (!same(B, R)) {
        conflicts.push(at);
        out.push(R);
      }
    }
  }
  return out;
}

/** Combina `local` y `remote`, que partieron de `base`. La vista y el id son los de aquí. */
export function mergeProjects(base: Project, local: Project, remote: Project): MergeResult {
  const conflicts: string[] = [];
  const strip = (project: Project): Record<string, Json> => {
    const content: Record<string, Json> = { ...project };
    delete content.view;
    delete content.updatedAt;
    return content;
  };
  const merged = merge(strip(base), strip(local), strip(remote), 'proyecto', conflicts) as Record<string, Json>;
  const updatedAt = local.updatedAt > remote.updatedAt ? local.updatedAt : remote.updatedAt;
  return { project: { ...(merged as unknown as Project), id: local.id, view: local.view, updatedAt }, conflicts };
}
