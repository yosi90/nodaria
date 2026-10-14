import type { Position, Project } from '../../domain/types';
import { NODE_W } from './layout';

/** Solo sustituye posiciones de tablas. No recalcula ni desplaza los demás nodos. */
export function databaseMapPositions(
  project: Project,
  native: Map<string, Position>,
  visibleIds: Set<string>,
  height: number,
) {
  const result = new Map(native);
  if (!project.view.databaseSchema) return result;
  const tables = (project.databaseDesign?.tables ?? []).filter(t => visibleIds.has(t.id));
  const ids = new Set(tables.map(t => t.id));
  const ordinary = project.nodes
    .filter(n => visibleIds.has(n.id) && !ids.has(n.id))
    .map(n => n.positions[project.view.layout] ?? native.get(n.id))
    .filter((p): p is Position => Boolean(p));
  const left = ordinary.length ? Math.max(...ordinary.map(p => p.x + NODE_W)) + 100 : 0;
  const top = ordinary.length ? Math.min(...ordinary.map(p => p.y)) : 0;
  tables.forEach((t, i) =>
    result.set(
      t.id,
      project.databaseDesign?.positions[t.id] ?? {
        x: left + (i % 3) * (NODE_W + 90),
        y: top + Math.floor(i / 3) * (height + 90),
      },
    ),
  );
  return result;
}
