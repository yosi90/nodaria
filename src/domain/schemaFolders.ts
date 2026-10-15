import { uid } from './factories';
import { moveSchema, type DropZone } from './inheritance';
import type { Project, Schema, SchemaFolder, SchemaKind } from './types';

/*
 * Carpetas de las listas de Tipos y Relaciones. Solo organizan la lista: agrupan tipos raíz (sin
 * herencia) con todo su árbol de subtipos y no significan nada en el modelo. Un tipo que pasa a
 * heredar de otro deja de contar como miembro aunque siga en la lista: se filtra al leerla.
 */

export function addSchemaFolder(p: Project, kind: SchemaKind, name: string, id: string = uid('folder')): Project {
  return { ...p, schemaFolders: [...p.schemaFolders, { id, name: name.trim() || 'Carpeta', kind, schemaIds: [] }] };
}

export function renameSchemaFolder(p: Project, id: string, name: string): Project {
  const clean = name.trim();
  if (!clean || !p.schemaFolders.some(f => f.id === id)) return p;
  return { ...p, schemaFolders: p.schemaFolders.map(f => (f.id === id ? { ...f, name: clean } : f)) };
}

/** Elimina la carpeta; sus tipos vuelven a verse sueltos. */
export function deleteSchemaFolder(p: Project, id: string): Project {
  if (!p.schemaFolders.some(f => f.id === id)) return p;
  return { ...p, schemaFolders: p.schemaFolders.filter(f => f.id !== id) };
}

const isRoot = (p: Project, s: Schema) => !s.parentTypeId || !p.schemas.some(x => x.id === s.parentTypeId);

/** Tipos raíz de la carpeta que siguen existiendo, en su orden. */
export function schemaFolderMembers(p: Project, folder: SchemaFolder): Schema[] {
  return folder.schemaIds
    .map(id => p.schemas.find(s => s.id === id))
    .filter((s): s is Schema => Boolean(s && s.kind === folder.kind && isRoot(p, s)));
}

/** Carpeta en la que está un tipo raíz, si alguna. */
export const folderOfSchema = (p: Project, schemaId: string) =>
  p.schemaFolders.find(f => f.schemaIds.includes(schemaId) && schemaFolderMembers(p, f).some(s => s.id === schemaId));

/** Mete un tipo raíz en una carpeta de su misma clase (o lo saca con `null`). */
export function setSchemaFolder(p: Project, schemaId: string, folderId: string | null): Project {
  const schema = p.schemas.find(s => s.id === schemaId);
  const folder = folderId ? p.schemaFolders.find(f => f.id === folderId) : null;
  if (!schema || (folder && (folder.kind !== schema.kind || !isRoot(p, schema)))) return p;
  const schemaFolders = p.schemaFolders.map(f => {
    const without = f.schemaIds.filter(id => id !== schemaId);
    return f.id === folder?.id ? { ...f, schemaIds: [...without, schemaId] } : { ...f, schemaIds: without };
  });
  return { ...p, schemaFolders };
}

/**
 * Arrastrar un tipo en la lista: `moveSchema` (heredar o colocarse junto al destino) y, si queda como
 * raíz junto a otro, adopta la carpeta de ese otro tipo (o sale de la suya), todo en un paso.
 */
export function moveSchemaInList(p: Project, id: string, targetId: string, zone: DropZone): Project {
  const moved = moveSchema(p, id, targetId, zone);
  const schema = moved.schemas.find(s => s.id === id);
  if (!schema || zone === 'inside' || !isRoot(moved, schema)) return moved;
  return setSchemaFolder(moved, id, folderOfSchema(moved, targetId)?.id ?? null);
}
