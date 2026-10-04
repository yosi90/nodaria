import { Handle, Position, type Node as FlowNode, type NodeProps } from '@xyflow/react';
import { TriangleAlert } from 'lucide-react';
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
  /** Retrato (data URL) del primer atributo de imagen con valor. */
  image: string | null;
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
        <span className="node-pushpin" title="Posición fijada en esta disposición" aria-hidden>
          <svg viewBox="0 0 32 40" width="30" height="38">
            <line x1="16" y1="24" x2="16" y2="39" stroke="#8d939c" strokeWidth="2.2" strokeLinecap="round" />
            <line x1="16" y1="24" x2="16" y2="39" stroke="#d9dde3" strokeWidth="0.9" strokeLinecap="round" />
            <ellipse cx="16" cy="22" rx="7" ry="2.6" fill="#b3202b" />
            <path d="M11 6 Q16 3 21 6 L20.5 20 Q16 22.5 11.5 20 Z" fill="#e1343f" />
            <ellipse cx="16" cy="6" rx="8" ry="4.2" fill="#f25560" />
            <ellipse cx="13.5" cy="5" rx="2.6" ry="1.2" fill="#ffffff" opacity="0.65" />
          </svg>
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
