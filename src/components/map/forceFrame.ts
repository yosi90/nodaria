import { moveNodes } from '../../domain/operations';
import type { Position, Project } from '../../domain/types';

export const forceFrameKey = (shapeKey: string, fixed: Map<string, Position>) => JSON.stringify([shapeKey, [...fixed]]);

/** Conserva el mapa visible usando las mismas posiciones persistidas que el reducer. */
export function forceFrameAfterMove(
  shapeKey: string,
  project: Project,
  moved: Record<string, Position>,
  visible: Map<string, Position>,
) {
  const next = moveNodes(project, moved, 'force');
  const fixed = new Map(next.nodes.flatMap(n => (n.positions.force ? [[n.id, n.positions.force] as const] : [])));
  const positions = new Map(visible);
  // El guardado redondea las posiciones; el frame y la tarjeta deben coincidir también al deshacer.
  for (const [id, position] of fixed) if (positions.has(id)) positions.set(id, position);
  return { key: forceFrameKey(shapeKey, fixed), positions };
}
