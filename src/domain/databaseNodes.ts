import { applyDatabaseEdit } from './databaseDesign';
import { moveNodes } from './operations';
import type { Project, Node, Position } from './types';
import { uid } from './factories';

/** Duplicar una tabla sigue siendo duplicar su nodo; conserva la definición SQL. */
export function copyDatabaseNode(
  project: Project,
  sourceId: string,
  targetId: string,
  withRelations: boolean,
): Project {
  const design = project.databaseDesign;
  const source = design?.tables.find(t => t.id === sourceId);
  if (!design || !source) return project;
  const taken = new Set([
    ...design.tables.map(t => `${t.schema.toLowerCase()}:${t.name.toLowerCase()}`),
    ...design.tables.flatMap(t => t.uniqueKeys.map(k => `${t.schema.toLowerCase()}:${k.name.toLowerCase()}`)),
    ...design.foreignKeys.map(
      fk => `${design.tables.find(t => t.id === fk.sourceTableId)?.schema.toLowerCase()}:${fk.name.toLowerCase()}`,
    ),
  ]);
  const copyName = (name: string, schema: string) => {
    let index = 1;
    let result = '';
    do {
      const suffix = `_copia${index === 1 ? '' : index}`;
      result = name.slice(0, 128 - suffix.length) + suffix;
      index++;
    } while (taken.has(`${schema.toLowerCase()}:${result.toLowerCase()}`));
    taken.add(`${schema.toLowerCase()}:${result.toLowerCase()}`);
    return result;
  };
  const table = structuredClone(source);
  table.id = targetId;
  table.name = copyName(source.name, source.schema);
  table.uniqueKeys = table.uniqueKeys.map(k => ({ ...k, id: uid('unique'), name: copyName(k.name, table.schema) }));
  const copies = withRelations
    ? design.foreignKeys
        .filter(fk => fk.sourceTableId === sourceId || fk.targetTableId === sourceId)
        .map(fk => {
          const schema =
            fk.sourceTableId === sourceId
              ? source.schema
              : (design.tables.find(t => t.id === fk.sourceTableId)?.schema ?? 'dbo');
          return {
            ...structuredClone(fk),
            id: uid('fk'),
            name: copyName(fk.name, schema),
            sourceTableId: fk.sourceTableId === sourceId ? targetId : fk.sourceTableId,
            targetTableId: fk.targetTableId === sourceId ? targetId : fk.targetTableId,
          };
        })
    : [];
  const position = design.positions[sourceId];
  return {
    ...project,
    databaseDesign: {
      ...design,
      tables: [...design.tables, table],
      foreignKeys: [...design.foreignKeys, ...copies],
      positions: position
        ? { ...design.positions, [targetId]: { x: position.x + 32, y: position.y + 32 } }
        : design.positions,
    },
  };
}

/** La configuración SQL no puede sobrevivir a la eliminación del nodo que representa la tabla. */
export function reconcileDatabaseNodes(project: Project): Project {
  const design = project.databaseDesign;
  if (!design) return project;
  const nodes = new Set(project.nodes.map(n => n.id));
  const tables = design.tables.filter(t => nodes.has(t.id));
  const ids = new Set(tables.map(t => t.id));
  const foreignKeys = design.foreignKeys.filter(fk => ids.has(fk.sourceTableId) && ids.has(fk.targetTableId));
  const positions = Object.fromEntries(Object.entries(design.positions).filter(([id]) => ids.has(id)));
  if (
    tables.length === design.tables.length &&
    foreignKeys.length === design.foreignKeys.length &&
    Object.keys(positions).length === Object.keys(design.positions).length
  )
    return project;
  return { ...project, databaseDesign: { ...design, tables, foreignKeys, positions } };
}

export function activeTableIds(project: Project) {
  return new Set(project.view.databaseSchema ? project.databaseDesign?.tables.map(t => t.id) : []);
}
export function canvasPinnedPosition(project: Project, node: Node) {
  return activeTableIds(project).has(node.id)
    ? project.databaseDesign?.positions[node.id]
    : node.positions[project.view.layout];
}

export function moveCanvasNodes(project: Project, positions: Record<string, Position | null>) {
  const ids = activeTableIds(project);
  const ordinary = Object.fromEntries(Object.entries(positions).filter(([id]) => !ids.has(id)));
  const tables = Object.fromEntries(Object.entries(positions).filter(([id]) => ids.has(id)));
  const moved = moveNodes(project, ordinary);
  return Object.keys(tables).length ? applyDatabaseEdit(moved, { kind: 'positions', positions: tables }) : moved;
}
