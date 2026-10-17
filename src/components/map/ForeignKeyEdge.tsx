import { BaseEdge, useInternalNode, type Edge, type EdgeProps, type InternalNode } from '@xyflow/react';
import { memo } from 'react';
import type { Box } from './edgeGeometry';
import { NODE_H, NODE_W } from './layout';
import { foreignKeyRoute } from './tableCard';

export interface ForeignKeyEdgeData extends Record<string, unknown> {
  kind: 'foreignKey';
  /** Nombre de la columna, para el título. */
  label: string;
  color: string;
  /** La FK es UNIQUE (o la clave primaria entera): uno a uno, «1» en lugar de «∞». */
  oneToOne?: boolean;
  /** La FK admite nulos: la fila referenciada es opcional, «0..1» junto a la llave. */
  optional?: boolean;
  /** Fila de la columna en la tabla de origen y de la clave primaria en la de destino (−1 = cabecera). */
  sourceRow: number;
  targetRow: number;
  /** Separación respecto a otras claves que llegan a la misma tabla. */
  lane: number;
}

export type ForeignKeyEdgeType = Edge<ForeignKeyEdgeData, 'foreignKey'>;

const boxOf = (n: InternalNode): Box => ({
  x: n.internals.positionAbsolute.x,
  y: n.internals.positionAbsolute.y,
  width: n.measured.width ?? NODE_W,
  height: n.measured.height ?? NODE_H,
});

/**
 * Clave foránea en la disposición «Base de datos»: línea en ángulo recto con la cardinalidad en cada
 * extremo: «∞» en la FK (o «1» si es uno a uno) y una llave en la PK (con «0..1» si la FK admite nulos).
 */
export const ForeignKeyEdge = memo(function ForeignKeyEdge({
  id,
  source,
  target,
  data,
}: EdgeProps<ForeignKeyEdgeType>) {
  const sourceNode = useInternalNode(source);
  const targetNode = useInternalNode(target);
  if (!sourceNode || !targetNode || !data) return null;
  const route = foreignKeyRoute(boxOf(sourceNode), boxOf(targetNode), data.sourceRow, data.targetRow, data.lane);
  const { many, one } = route;
  return (
    <>
      <BaseEdge
        id={id}
        path={route.d}
        className="edge-flow foreign-key"
        style={{ stroke: data.color }}
        interactionWidth={12}
      />
      <text
        className="fk-many"
        x={many.x + many.dir * 9}
        y={many.y - 4}
        textAnchor="middle"
        style={{ fill: data.color }}
        aria-hidden
      >
        {data.oneToOne ? '1' : '∞'}
      </text>
      {data.optional && (
        <text
          className="fk-optional"
          x={one.x + one.dir * 33}
          y={one.y - 4}
          textAnchor="middle"
          style={{ fill: data.color }}
          aria-hidden
        >
          0..1
        </text>
      )}
      <g
        className="fk-key"
        transform={`translate(${one.x + one.dir * 9} ${one.y - 6}) scale(${one.dir} 1)`}
        style={{ stroke: data.color }}
        aria-hidden
      >
        <circle cx={0} cy={0} r={2.6} />
        <path d="M 2.6 0 H 9 M 6.5 0 V 2.5 M 8.6 0 V 2" />
      </g>
      <title>
        {`${data.label}: ${data.oneToOne ? 'uno a uno' : 'muchos a uno'}${data.optional ? ', opcional' : ''}`}
      </title>
    </>
  );
});
