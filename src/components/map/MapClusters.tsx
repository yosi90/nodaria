import { ViewportPortal } from '@xyflow/react';
import { useState } from 'react';

/*
 * Al alejar el zoom sobre el mapa, los marcadores que caen casi en el mismo píxel se funden en un
 * punto con su número. El punto mantiene su tamaño en pantalla; al pasar el ratón lista los nombres.
 */

export interface MapCluster {
  id: string;
  /** Centro en coordenadas del lienzo. */
  x: number;
  y: number;
  members: { id: string; label: string; color: string }[];
}

interface MapClustersProps {
  clusters: MapCluster[];
  zoom: number;
  onSelect: (nodeId: string) => void;
  onZoomTo: (cluster: MapCluster) => void;
}

export function MapClusters({ clusters, zoom, onSelect, onZoomTo }: MapClustersProps) {
  const [open, setOpen] = useState<string | null>(null);
  if (!clusters.length) return null;
  const inverse = 1 / zoom;
  return (
    <ViewportPortal>
      {clusters.map(c => (
        <div
          key={c.id}
          className={`map-cluster ${open === c.id ? 'open' : ''}`}
          style={{ left: c.x, top: c.y, transform: `translate(-50%, -50%) scale(${inverse})` }}
          onMouseEnter={() => setOpen(c.id)}
          onMouseLeave={() => setOpen(current => (current === c.id ? null : current))}
        >
          <button
            type="button"
            className="map-cluster-dot nodrag nopan"
            title={`${c.members.length} nodos · clic para acercar`}
            onClick={event => {
              event.stopPropagation();
              onZoomTo(c);
            }}
          >
            {c.members.length}
          </button>
          {open === c.id && (
            <div className="map-cluster-panel nodrag nopan" role="list">
              {c.members.slice(0, 12).map(m => (
                <button
                  key={m.id}
                  type="button"
                  role="listitem"
                  onClick={event => {
                    event.stopPropagation();
                    onSelect(m.id);
                  }}
                >
                  <span className="map-cluster-swatch" style={{ background: m.color }} />
                  {m.label}
                </button>
              ))}
              {c.members.length > 12 && <span className="muted">y {c.members.length - 12} más…</span>}
            </div>
          )}
        </div>
      ))}
    </ViewportPortal>
  );
}
