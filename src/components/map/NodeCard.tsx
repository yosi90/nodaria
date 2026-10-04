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
  /** Iconos de atributos marcados «Solo icono» (con valor), con su texto. */
  badges: { icon: string; title: string }[];
  /** Atributos marcados «Icono y texto»: una línea cada uno bajo el nombre. */
  lines: { icon: string | null; text: string }[];
  /** Marcador compacto (solo icono o retrato), como sobre la imagen del mapa. */
  compact?: boolean;
  /** Marcador expandido a tarjeta completa (al pasar el ratón). */
  expanded?: boolean;
  /** Altura de la tarjeta completa (para animar la expansión). */
  cardHeight?: number;
  /** Desplazamiento visual temporal (expansión centrada o apartarse de un vecino expandido). */
  offset?: { x: number; y: number };
  /** Escala visual por centralidad (1 = tamaño normal). */
  scale?: number;
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
  const card = (
    <div
      className={`node-card-flow ${selected ? 'selected' : ''} ${data.compact ? 'compact' : ''} ${data.expanded ? 'expanded' : ''}`}
      style={
        {
          '--type-color': data.color,
          transform:
            [
              data.offset ? `translate(${data.offset.x}px, ${data.offset.y}px)` : '',
              data.scale && data.scale !== 1 ? `scale(${data.scale})` : '',
            ]
              .filter(Boolean)
              .join(' ') || undefined,
          height: data.expanded ? data.cardHeight : undefined,
        } as CSSProperties
      }
    >
      <Handle type="target" position={Position.Left} className="node-target" isConnectableStart={false} />
      <div className="node-main">
        {data.image ? (
          <img className="node-portrait" src={data.image} alt="" />
        ) : (
          <span className="type-icon lg" aria-hidden>
            {createElement(typeIcon(data.icon), { size: 16, strokeWidth: 2.2 })}
          </span>
        )}
        <div className="node-texts">
          <strong title={data.label}>{data.label}</strong>
          <small>
            {data.typeName}
            {data.badges.map(b => (
              <span key={b.title} className="node-badge" title={b.title}>
                {createElement(typeIcon(b.icon), { size: 11, strokeWidth: 2.4 })}
              </span>
            ))}
          </small>
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
      </div>
      {data.lines.length > 0 && (
        <div className="node-lines">
          {data.lines.map(line => (
            <span key={line.text} className="node-line" title={line.text}>
              {line.icon ? (
                <span className="node-badge">{createElement(typeIcon(line.icon), { size: 11, strokeWidth: 2.4 })}</span>
              ) : (
                <span className="node-badge empty" />
              )}
              <span className="node-line-text">{line.text}</span>
            </span>
          ))}
        </div>
      )}
      {data.pinned && !data.compact && (
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
  // Sobre el mapa, el marcador mantiene su tamaño en pantalla sea cual sea el zoom (como un pin).
  return data.compact ? <div className="marker-zoom">{card}</div> : card;
});
