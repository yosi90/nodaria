import { BaseEdge, useInternalNode, useStore, type Edge, type EdgeProps, type ReactFlowState } from '@xyflow/react';
import { memo, useMemo } from 'react';
import { boxOf, boxText, parseBoxes } from './nodeBoxes';
import { avoidingRoute } from './fkRouter';
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
  /** Entre nodos de motores distintos: la referencia la guarda la aplicación (línea discontinua). */
  crossEngine?: boolean;
}

export type ForeignKeyEdgeType = Edge<ForeignKeyEdgeData, 'foreignKey'>;

/**
 * Las tarjetas del lienzo como obstáculos, en texto (así la línea solo se vuelve a calcular si alguna se
 * mueve o cambia de tamaño). Mientras se arrastra una, `null`: se usa la ruta de siempre, que es inmediata.
 */
const obstaclesKey = (s: ReactFlowState): string | null => {
  const boxes: string[] = [];
  for (const n of s.nodeLookup.values()) {
    if (n.dragging) return null;
    if (n.hidden) continue;
    boxes.push(boxText(boxOf(n), true));
  }
  return boxes.join(';');
};

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
  const obstacles = useStore(obstaclesKey);
  const a = sourceNode && boxOf(sourceNode);
  const b = targetNode && boxOf(targetNode);
  const key = a && b ? `${boxText(a)};${boxText(b)}` : '';
  // Rodea las demás tarjetas (fkRouter.ts); arrastrando, o si no encuentra camino, la ruta directa.
  const avoiding = useMemo(() => {
    if (!a || !b || !data || obstacles === null) return null;
    return avoidingRoute(a, b, data.sourceRow, data.targetRow, data.lane, parseBoxes(obstacles));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `key` resume las dos cajas
  }, [key, obstacles, data?.sourceRow, data?.targetRow, data?.lane]);
  if (!a || !b || !data) return null;
  const route = avoiding ?? foreignKeyRoute(a, b, data.sourceRow, data.targetRow, data.lane);
  const { many, one } = route;
  return (
    <>
      <BaseEdge
        id={id}
        path={route.d}
        className={`edge-flow foreign-key ${data.crossEngine ? 'cross-engine' : ''}`}
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
