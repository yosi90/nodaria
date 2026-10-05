import { describe, expect, it } from 'vitest';
import { node, project, schema } from '../test/fixtures';
import { addFolder, deleteFolder, folderMembers, folderOf, looseRoots, renameFolder, setNodeFolder } from './folders';
import { deleteNode, updateNode } from './operations';

const base = () =>
  addFolder(
    project({
      schemas: [schema('t', { allowedChildTypeIds: ['t'] })],
      nodes: [node('a', 't'), node('b', 't'), node('c', 't'), node('hijo', 't', 'a')],
    }),
    'Secundarios',
    'f1',
  );

describe('carpetas del árbol', () => {
  it('solo admite nodos raíz y mantiene el orden', () => {
    let p = setNodeFolder(base(), 'a', 'f1');
    p = setNodeFolder(p, 'c', 'f1');
    p = setNodeFolder(p, 'b', 'f1', 'c');
    expect(p.folders[0].nodeIds).toEqual(['a', 'b', 'c']);
    expect(setNodeFolder(p, 'hijo', 'f1')).toBe(p);
    expect(looseRoots(p).map(n => n.id)).toEqual([]);
    expect(folderOf(p, 'b')?.name).toBe('Secundarios');
  });

  it('un nodo que recibe un padre deja de contar como miembro, y sale de la carpeta al eliminarlo', () => {
    let p = setNodeFolder(base(), 'b', 'f1');
    p = updateNode(p, 'b', {}, 'a');
    expect(folderMembers(p, p.folders[0]).map(n => n.id)).toEqual([]);
    expect(folderOf(p, 'b')).toBeUndefined();
    p = setNodeFolder(p, 'c', 'f1');
    p = deleteNode(p, 'c');
    expect(p.folders[0].nodeIds).toEqual(['b']);
  });

  it('renombrar y eliminar; al eliminar, los nodos vuelven sueltos', () => {
    let p = setNodeFolder(base(), 'a', 'f1');
    p = renameFolder(p, 'f1', 'Principales');
    expect(p.folders[0].name).toBe('Principales');
    p = deleteFolder(p, 'f1');
    expect(p.folders).toEqual([]);
    expect(looseRoots(p).map(n => n.id)).toEqual(['a', 'b', 'c']);
  });
});
