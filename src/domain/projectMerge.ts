import { repairProject } from './integrity';
import { normalizeName } from './notes';
import { allFields, getSchema, nodeLabel } from './selectors';
import { mergeTemplate } from './templates';
import type { FieldValue, Project, SchemaField } from './types';

/*
 * Importar fusionando en el proyecto actual (PENDIENTES.md, Fase 7). Se añade lo que falta por id: con
 * `schema`, los tipos, atributos (también los nuevos de un tipo que ya está), atributos compartidos,
 * parentescos y carpetas de tipos; siempre, los nodos, relaciones, carpetas, vistas y consultas. Lo que
 * ya está no se toca, así que importar dos veces el mismo archivo no duplica nada. Sin `schema`, los
 * nodos y relaciones de tipos que el proyecto no tiene se omiten.
 */

export interface MergeSummary {
  project: Project;
  newTypes: number;
  newFields: number;
  nodes: number;
  /** Nodos que ya están en el proyecto (mismo id): se conservan los del proyecto. */
  existing: number;
  /** Nodos de tipos que el proyecto no tiene. */
  skippedNodes: number;
  relations: number;
  /** Relaciones de tipos que el proyecto no tiene o con un extremo que no se importa. */
  skippedRelations: number;
  /** Nodos nuevos con el mismo título que uno que ya estaba: posibles duplicados. */
  sameTitle: number;
}

const fieldKey = (f: SchemaField) => ('ref' in f ? `ref:${f.ref}` : f.id);

export function mergeProject(target: Project, source: Project, { schema }: { schema: boolean }): MergeSummary {
  let next = target;
  let newTypes = 0;
  let newFields = 0;
  if (schema) {
    next = mergeTemplate(next, source);
    newTypes = next.schemas.length - target.schemas.length;
    // Los atributos nuevos de un tipo que ya estaba, al final de los suyos.
    next = {
      ...next,
      schemas: next.schemas.map(s => {
        const incoming = target.schemas.some(t => t.id === s.id) ? getSchema(source, s.id) : undefined;
        if (!incoming) return s;
        const keys = new Set(s.fields.map(fieldKey));
        const extra = incoming.fields.filter(f => !keys.has(fieldKey(f)));
        newFields += extra.length;
        return extra.length ? { ...s, fields: [...s.fields, ...extra] } : s;
      }),
    };
    const schemaFolderIds = new Set(next.schemaFolders.map(f => f.id));
    const schemaFolders = source.schemaFolders.filter(f => !schemaFolderIds.has(f.id));
    if (schemaFolders.length) next = { ...next, schemaFolders: [...next.schemaFolders, ...schemaFolders] };
  }

  const typeIds = new Set(next.schemas.map(s => s.id));
  const nodeIds = new Set(target.nodes.map(n => n.id));
  const keep = (values: Record<string, FieldValue>, typeId: string) => {
    const ids = new Set(allFields(next, typeId).map(f => f.id));
    return Object.fromEntries(Object.entries(values).filter(([id]) => ids.has(id)));
  };
  let existing = 0;
  let skippedNodes = 0;
  const added = source.nodes.filter(n => {
    if (nodeIds.has(n.id)) existing++;
    else if (!typeIds.has(n.typeId)) skippedNodes++;
    else return true;
    return false;
  });
  const addedIds = new Set(added.map(n => n.id));
  const present = (id: string | null) => !!id && (nodeIds.has(id) || addedIds.has(id));
  const nodes = added.map(n => ({
    ...n,
    parentId: present(n.parentId) ? n.parentId : null,
    values: keep(n.values, n.typeId),
  }));
  const titles = new Set(target.nodes.map(n => normalizeName(nodeLabel(target, n))));

  const relationIds = new Set(target.relations.map(r => r.id));
  const kinshipIds = new Set(next.kinship.map(k => k.id));
  let skippedRelations = 0;
  const relations = source.relations
    .filter(r => {
      if (relationIds.has(r.id)) return false;
      if (typeIds.has(r.typeId) && present(r.sourceId) && present(r.targetId)) return true;
      skippedRelations++;
      return false;
    })
    .map(r => ({
      ...r,
      values: keep(r.values, r.typeId),
      kinshipId: r.kinshipId && kinshipIds.has(r.kinshipId) ? r.kinshipId : null,
    }));

  const missing = <T extends { id: string }>(mine: T[], theirs: T[]) => {
    const ids = new Set(mine.map(x => x.id));
    return theirs.filter(x => !ids.has(x.id));
  };
  const roots = new Set(nodes.filter(n => !n.parentId).map(n => n.id));
  next = {
    ...next,
    nodes: [...next.nodes, ...nodes],
    relations: [...next.relations, ...relations],
    folders: [
      ...next.folders,
      ...missing(next.folders, source.folders)
        .map(f => ({ ...f, nodeIds: f.nodeIds.filter(id => roots.has(id)) }))
        .filter(f => f.nodeIds.length),
    ],
    lenses: [...next.lenses, ...missing(next.lenses, source.lenses)],
    queries: [...next.queries, ...missing(next.queries, source.queries)],
  };
  const sameTitle = nodes.filter(n => titles.has(normalizeName(nodeLabel(next, n)))).length;
  return {
    project: next === target ? target : repairProject(next).project,
    newTypes,
    newFields,
    nodes: nodes.length,
    existing,
    skippedNodes,
    relations: relations.length,
    skippedRelations,
    sameTitle,
  };
}
