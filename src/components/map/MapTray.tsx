import { Inbox } from 'lucide-react';
import { createElement, type DragEvent } from 'react';
import { getSchema, nodeLabel } from '../../domain/selectors';
import type { Node, Project } from '../../domain/types';
import { typeIcon } from '../common/icon-catalog';

export const TRAY_DRAG_TYPE = 'application/x-nodaria-node';

/**
 * Bandeja de la disposición «Mapa»: los nodos que aún no están colocados sobre la imagen. Vive fuera
 * del lienzo, así que no le afecta el zoom; se arrastran al mapa para colocarlos.
 */
export function MapTray({
  project,
  nodes,
  selectedId,
  onSelect,
}: {
  project: Project;
  nodes: Node[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  const sorted = [...nodes].sort((a, b) => {
    const ta = getSchema(project, a.typeId)?.name ?? '';
    const tb = getSchema(project, b.typeId)?.name ?? '';
    return ta.localeCompare(tb) || nodeLabel(project, a).localeCompare(nodeLabel(project, b));
  });
  const onDragStart = (event: DragEvent<HTMLButtonElement>, id: string) => {
    event.dataTransfer.setData(TRAY_DRAG_TYPE, id);
    event.dataTransfer.effectAllowed = 'move';
  };
  return (
    <aside className="map-tray" aria-label="Nodos sin colocar en el mapa">
      <header>
        <Inbox size={15} aria-hidden />
        <h3>Sin colocar</h3>
        <span className="badge">{sorted.length}</span>
      </header>
      {sorted.length === 0 ? (
        <p className="muted-note">
          Todos los nodos están en el mapa. Arranca la chincheta de uno para devolverlo aquí.
        </p>
      ) : (
        <>
          <p className="muted-note">Arrastra un nodo al mapa para colocarlo.</p>
          <div className="map-tray-list">
            {sorted.map(n => {
              const schema = getSchema(project, n.typeId);
              return (
                <button
                  key={n.id}
                  type="button"
                  className={`map-tray-item ${selectedId === n.id ? 'selected' : ''}`}
                  draggable
                  onDragStart={event => onDragStart(event, n.id)}
                  onClick={() => onSelect(n.id)}
                  style={{ '--type-color': schema?.color ?? '#888' } as React.CSSProperties}
                >
                  <span className="type-icon" aria-hidden>
                    {createElement(typeIcon(schema?.icon ?? 'circle'), { size: 14, strokeWidth: 2.2 })}
                  </span>
                  <span className="map-tray-texts">
                    <strong>{nodeLabel(project, n)}</strong>
                    <small>{schema?.name ?? 'Sin tipo'}</small>
                  </span>
                </button>
              );
            })}
          </div>
        </>
      )}
    </aside>
  );
}
