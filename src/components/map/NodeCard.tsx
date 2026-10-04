import { Handle, Position, type Node as FlowNode, type NodeProps } from '@xyflow/react';
import { TriangleAlert } from 'lucide-react';
import { createElement, memo, useEffect, useRef, useState, type CSSProperties, type PointerEvent } from 'react';
import { PushpinIcon } from './Pushpin';
import { typeIcon } from '../common/icon-catalog';

export interface NodeCardData extends Record<string, unknown> {
  label: string;
  typeName: string;
  color: string;
  icon: string;
  /** Número de relaciones del nodo. */
  degree: number;
  /** Tiene atributos obligatorios sin rellenar. */
  incomplete: boolean;
  /** Posición fijada por el usuario. */
  pinned: boolean;
  /** Arrancar la chincheta (tras mantenerla pulsada): `origin` es el centro de la chincheta en pantalla. */
  onUnpin?: (origin: { x: number; y: number }) => void;
  /** Retrato (data URL) del primer atributo de imagen con valor. */
  image: string | null;
}

export type CardNode = FlowNode<NodeCardData, 'card'>;

/** Tarjeta de un nodo en el lienzo. Todo el borde admite conexiones; el asa de la derecha las inicia. */
/** Tiempo que hay que mantener pulsada la chincheta para arrancarla. */
export const PULL_MS = 1500;

export const NodeCard = memo(function NodeCard({ data, selected }: NodeProps<CardNode>) {
  const [pulling, setPulling] = useState(false);
  const timer = useRef<number | null>(null);
  const pinRef = useRef<HTMLSpanElement>(null);
  const cancelPull = () => {
    if (timer.current !== null) window.clearTimeout(timer.current);
    timer.current = null;
    setPulling(false);
  };
  useEffect(() => cancelPull, []);
  const startPull = (event: PointerEvent) => {
    if (event.button !== 0) return;
    event.stopPropagation();
    event.preventDefault();
    setPulling(true);
    timer.current = window.setTimeout(() => {
      timer.current = null;
      setPulling(false);
      const rect = pinRef.current?.getBoundingClientRect();
      if (rect) data.onUnpin?.({ x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 });
    }, PULL_MS);
  };
  return (
    <div
      className={`node-card-flow ${selected ? 'selected' : ''}`}
      style={{ '--type-color': data.color } as CSSProperties}
    >
      <Handle type="target" position={Position.Left} className="node-target" isConnectableStart={false} />
      {data.image ? (
        <img className="node-portrait" src={data.image} alt="" />
      ) : (
        <span className="type-icon lg" aria-hidden>
          {createElement(typeIcon(data.icon), { size: 16, strokeWidth: 2.2 })}
        </span>
      )}
      <div className="node-texts">
        <strong title={data.label}>{data.label}</strong>
        <small>{data.typeName}</small>
      </div>
      <div className="node-marks" aria-hidden>
        {data.incomplete && (
          <span className="node-mark warning" title="Faltan atributos obligatorios">
            <TriangleAlert size={12} />
          </span>
        )}
        {data.degree > 0 && (
          <span className="node-degree" title={`${data.degree} relaciones`}>
            {data.degree}
          </span>
        )}
      </div>
      {data.pinned && (
        <span
          ref={pinRef}
          className={`node-pushpin nodrag nopan ${pulling ? 'pulling' : ''}`}
          title="Posición fijada en esta disposición. Mantén pulsado para arrancar la chincheta."
          onPointerDown={startPull}
          onPointerUp={cancelPull}
          onPointerLeave={cancelPull}
          onPointerCancel={cancelPull}
          onClick={e => e.stopPropagation()}
        >
          <PushpinIcon />
        </span>
      )}
      <Handle
        type="source"
        position={Position.Right}
        className="node-source"
        title="Arrastra para crear una relación"
      />
    </div>
  );
});
