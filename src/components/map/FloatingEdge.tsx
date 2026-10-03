import {
  BaseEdge,
  EdgeLabelRenderer,
  useInternalNode,
  useStore,
  type Edge,
  type EdgeProps,
  type InternalNode,
} from '@xyflow/react';
import { memo, useMemo } from 'react';
import type { RelationStyle } from '../../domain/types';
import { bendFor, routeRelation, type Box } from './edgeGeometry';
import { useCanvasSettings } from './canvasSettings';
import { NODE_H, NODE_W } from './layout';

export interface FloatingEdgeData extends Record<string, unknown> {
  kind: 'relation' | 'hierarchy' | 'reference';
  label?: string;
  /** Papel del destino, mostrado al pasar el ratón por el origen. */
  labelFromTarget?: string;
  named?: boolean;
  color?: string;
  relationStyle?: RelationStyle;
  /** Índice y total de relaciones entre el mismo par de nodos, para abrirlas en abanico. */
  index: number;
  count: number;
  /** Seleccionar la relación al pulsar su etiqueta. */
  onSelect?: () => void;
}

export type FloatingEdgeType = Edge<FloatingEdgeData, 'floating'>;

const boxOf = (n: InternalNode): Box => ({
  x: n.internals.positionAbsolute.x,
  y: n.internals.positionAbsolute.y,
  width: n.measured.width ?? NODE_W,
  height: n.measured.height ?? NODE_H,
});

const REACH = 320;

/**
 * Arista que sale del borde de cada tarjeta en dirección a la otra, abre en abanico las
 * paralelas y esquiva las tarjetas intermedias. No depende de asas fijas.
 */
export const FloatingEdge = memo(function FloatingEdge({
  id,
  source,
  target,
  data,
  selected,
  markerEnd,
  markerStart,
}: EdgeProps<FloatingEdgeType>) {
  const sourceNode = useInternalNode(source);
  const targetNode = useInternalNode(target);
  const { avoidObstacles } = useCanvasSettings();
  // Solo las tarjetas cercanas al segmento pueden estorbar; su firma evita recalcular la ruta sin motivo.
  const nearby = useStore(s => {
    if (!avoidObstacles || !sourceNode || !targetNode) return '';
    const a = boxOf(sourceNode);
    const b = boxOf(targetNode);
    const minX = Math.min(a.x, b.x) - REACH;
    const maxX = Math.max(a.x + a.width, b.x + b.width) + REACH;
    const minY = Math.min(a.y, b.y) - REACH;
    const maxY = Math.max(a.y + a.height, b.y + b.height) + REACH;
    const parts: string[] = [];
    s.nodeLookup.forEach(n => {
      if (n.id === source || n.id === target || n.hidden) return;
      const o = boxOf(n);
      if (o.x < maxX && o.x + o.width > minX && o.y < maxY && o.y + o.height > minY)
        parts.push(`${o.x},${o.y},${o.width},${o.height}`);
    });
    return parts.join(';');
  });

  const a = sourceNode ? boxOf(sourceNode) : null;
  const b = targetNode ? boxOf(targetNode) : null;
  const key = a && b ? `${a.x},${a.y},${a.width},${a.height}|${b.x},${b.y},${b.width},${b.height}` : '';
  const index = data?.index ?? 0;
  const count = data?.count ?? 1;
  const route = useMemo(() => {
    if (!key) return null;
    const [ra, rb] = key.split('|').map(part => {
      const [x, y, width, height] = part.split(',').map(Number);
      return { x, y, width, height };
    });
    const forward = source < target;
    const distance = Math.hypot(rb.x - ra.x, rb.y - ra.y);
    const obstacles: Box[] = nearby
      ? nearby.split(';').map(part => {
          const [x, y, width, height] = part.split(',').map(Number);
          return { x, y, width, height };
        })
      : [];
    return routeRelation(ra, rb, bendFor(index, count, distance), obstacles, forward ? ra : rb, forward ? rb : ra);
  }, [key, nearby, index, count, source, target]);

  if (!route || !data) return null;
  const isHierarchy = data.kind === 'hierarchy';
  const classes = [
    'edge-flow',
    isHierarchy ? 'hierarchy' : data.kind === 'reference' ? 'reference' : `relation ${data.relationStyle ?? ''}`,
    selected && 'selected',
  ]
    .filter(Boolean)
    .join(' ');
  const labelShift = route.anchor === 'start' ? 8 : route.anchor === 'end' ? -8 : 0;
  const translateX = route.anchor === 'start' ? '0%' : route.anchor === 'end' ? '-100%' : '-50%';
  return (
    <>
      <BaseEdge
        id={id}
        path={route.d}
        className={classes}
        markerEnd={markerEnd}
        markerStart={markerStart}
        style={{ stroke: isHierarchy ? undefined : data.color }}
        interactionWidth={16}
      />
      {!isHierarchy && data.label && (
        <EdgeLabelRenderer>
          <div
            className={`edge-label nodrag nopan ${data.named ? 'named' : ''} ${selected ? 'selected' : ''}`}
            data-edge={id}
            data-role-source={data.label}
            data-role-target={data.labelFromTarget ?? data.label}
            onClick={data.onSelect}
            style={
              {
                transform: `translate(${translateX}, -50%) translate(${route.labelPos.x + labelShift}px, ${route.labelPos.y + (route.anchor === 'middle' ? -12 : 0)}px)`,
                '--edge-color': data.color,
              } as React.CSSProperties
            }
          >
            {data.label}
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  );
});
