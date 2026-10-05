import { uid } from './factories';
import type { Node, Project } from './types';

/*
 * Carpetas del árbol de estructura: agrupan nodos de primer nivel (sin padre en «Dentro de») solo
 * para organizar el panel. No significan nada en el modelo: no son nodos, no se dibujan en el mapa,
 * no afectan a relaciones, disposiciones ni análisis. Un nodo que recibe un padre deja de contar
 * como miembro aunque siga en la lista: la pertenencia se filtra al leerla (`folderMembers`).
 */

export interface Folder {
  id: string;
  name: string;
  /** Ids de nodos raíz, en el orden en que se muestran dentro de la carpeta. */
  nodeIds: string[];
}

export function addFolder(p: Project, name: string, id: string = uid('folder')): Project {
  const clean = name.trim() || 'Carpeta';
  return { ...p, folders: [...p.folders, { id, name: clean, nodeIds: [] }] };
}

export function renameFolder(p: Project, id: string, name: string): Project {
  const clean = name.trim();
  if (!clean || !p.folders.some(f => f.id === id)) return p;
  return { ...p, folders: p.folders.map(f => (f.id === id ? { ...f, name: clean } : f)) };
}

/** Elimina la carpeta; sus nodos vuelven a verse sueltos en la raíz. */
export function deleteFolder(p: Project, id: string): Project {
  if (!p.folders.some(f => f.id === id)) return p;
  return { ...p, folders: p.folders.filter(f => f.id !== id) };
}

/** Mete un nodo en una carpeta (o lo saca con `null`). Solo admite nodos raíz; una carpeta inexistente lo saca. */
export function setNodeFolder(
  p: Project,
  nodeId: string,
  folderId: string | null,
  beforeId: string | null = null,
): Project {
  const node = p.nodes.find(n => n.id === nodeId);
  if (!node) return p;
  const target = folderId && node.parentId === null ? p.folders.find(f => f.id === folderId) : undefined;
  const folders = p.folders.map(f => {
    const without = f.nodeIds.filter(id => id !== nodeId);
    if (f.id !== target?.id) return without.length === f.nodeIds.length ? f : { ...f, nodeIds: without };
    const index = beforeId ? without.indexOf(beforeId) : -1;
    const nodeIds = index >= 0 ? [...without.slice(0, index), nodeId, ...without.slice(index)] : [...without, nodeId];
    return { ...f, nodeIds };
  });
  return folders.every((f, i) => f === p.folders[i]) ? p : { ...p, folders };
}

/** Carpeta que contiene a un nodo raíz, o ninguna. */
export function folderOf(p: Project, nodeId: string): Folder | undefined {
  const node = p.nodes.find(n => n.id === nodeId);
  if (!node || node.parentId !== null) return undefined;
  return p.folders.find(f => f.nodeIds.includes(nodeId));
}

/** Miembros reales de una carpeta: nodos que existen y siguen siendo raíz, en el orden de la carpeta. */
export function folderMembers(p: Project, folder: Folder): Node[] {
  const byId = new Map(p.nodes.map(n => [n.id, n]));
  return folder.nodeIds.map(id => byId.get(id)).filter((n): n is Node => Boolean(n) && n!.parentId === null);
}

/** Nodos raíz que no están en ninguna carpeta. */
export function looseRoots(p: Project): Node[] {
  const inFolder = new Set(p.folders.flatMap(f => folderMembers(p, f).map(n => n.id)));
  return p.nodes.filter(n => n.parentId === null && !inFolder.has(n.id));
}

/** Al eliminar nodos, se quitan de las carpetas para no dejar ids colgando. */
export function withoutNodesInFolders(p: Project, removed: Set<string>): Project {
  if (!p.folders.some(f => f.nodeIds.some(id => removed.has(id)))) return p;
  return { ...p, folders: p.folders.map(f => ({ ...f, nodeIds: f.nodeIds.filter(id => !removed.has(id)) })) };
}
