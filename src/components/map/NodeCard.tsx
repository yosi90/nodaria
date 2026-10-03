import { Handle, Position, type Node as FlowNode, type NodeProps } from '@xyflow/react';
import { Pin, TriangleAlert } from 'lucide-react';
import { createElement, memo, type CSSProperties } from 'react';
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
}

export type CardNode = FlowNode<NodeCardData, 'card'>;

/** Tarjeta de un nodo en el lienzo. Todo el borde admite conexiones; el asa de la derecha las inicia. */
export const NodeCard = memo(function NodeCard({ data, selected }: NodeProps<CardNode>) {
  return (
    <div
      className={`node-card-flow ${selected ? 'selected' : ''}`}
      style={{ '--type-color': data.color } as CSSProperties}
    >
      <Handle type="target" position={Position.Left} className="node-target" isConnectableStart={false} />
      <span className="type-icon lg" aria-hidden>
        {createElement(typeIcon(data.icon), { size: 16, strokeWidth: 2.2 })}
      </span>
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
        {data.pinned && (
          <span className="node-mark" title="Posición fijada">
            <Pin size={11} />
          </span>
        )}
        {data.degree > 0 && (
          <span className="node-degree" title={`${data.degree} relaciones`}>
            {data.degree}
          </span>
        )}
      </div>
      <Handle
        type="source"
        position={Position.Right}
        className="node-source"
        title="Arrastra para crear una relación"
      />
    </div>
  );
});
