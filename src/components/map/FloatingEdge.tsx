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
import { bendFor, routeRelation, type Box, crossesBoxes, sideRoute, type Side } from './edgeGeometry';
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
  /** Posición de la etiqueta a lo largo de la curva (0–1); 0,5 = punto medio. */
  labelT?: number;
  /** Lado y desplazamiento de cada extremo (ver edgeSlots). */
  ends?: { sideSource: Side; sideTarget: Side; offsetSource: number; offsetTarget: number };
  /** Trazo recto, sin curva ni esquivar tarjetas (ascendencia en la disposición Genealogía). */
  straight?: boolean;
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
  const ends = data?.ends;
  const endsKey = ends ? `${ends.sideSource},${ends.sideTarget},${ends.offsetSource},${ends.offsetTarget}` : '';
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
    // Ruta preferida: por los lados enfrentados, en S. Si atraviesa alguna tarjeta, se esquiva en curva.
    // Si las tarjetas se solapan en el eje dominante (no hay hueco entre los lados enfrentados), la S
    // se retorcería: mejor la curva clásica.
    const horizontal = ends && (ends.sideSource === 'left' || ends.sideSource === 'right');
    const gap = !ends
      ? 0
      : horizontal
        ? ends.sideSource === 'right'
          ? rb.x - (ra.x + ra.width)
          : ra.x - (rb.x + rb.width)
        : ends.sideSource === 'bottom'
          ? rb.y - (ra.y + ra.height)
          : ra.y - (rb.y + rb.height);
    if (ends && gap >= 24) {
      const direct = sideRoute(ra, rb, ends.sideSource, ends.sideTarget, ends.offsetSource, ends.offsetTarget);
      const nearbyBoxes = obstacles.filter(o => o !== ra && o !== rb);
      if (!crossesBoxes(direct.pointAt, nearbyBoxes)) return { ...direct, anchor: 'middle' as const };
    }
    return routeRelation(ra, rb, bendFor(index, count, distance), obstacles, forward ? ra : rb, forward ? rb : ra);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- endsKey resume `ends`
  }, [key, nearby, index, count, source, target, endsKey]);

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
  const t = data.labelT ?? 0.5;
  const labelPos = t === 0.5 ? route.labelPos : route.pointAt(t);
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
                transform: `translate(${translateX}, -50%) translate(${labelPos.x + labelShift}px, ${labelPos.y + (route.anchor === 'middle' ? -12 : 0)}px)`,
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
