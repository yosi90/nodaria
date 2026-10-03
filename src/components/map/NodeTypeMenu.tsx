import { useEffect, useRef } from 'react';
import type { Schema } from '../../domain/types';

interface NodeTypeMenuProps {
  anchor: { x: number; y: number };
  schemas: Schema[];
  onSelect: (schemaId: string) => void;
  onClose: () => void;
}

export function NodeTypeMenu({ anchor, schemas, onSelect, onClose }: NodeTypeMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const closeOnOutsideClick = (event: PointerEvent) => {
      if (!menuRef.current?.contains(event.target as globalThis.Node)) onClose();
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('pointerdown', closeOnOutsideClick);
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.removeEventListener('pointerdown', closeOnOutsideClick);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, [onClose]);

  const left = Math.min(anchor.x, window.innerWidth - 250);
  const top = Math.min(anchor.y, window.innerHeight - 300);

  return (
    <div
      ref={menuRef}
      className="node-type-menu"
      style={{ left: Math.max(8, left), top: Math.max(8, top) }}
      role="menu"
      aria-label="Elegir tipo de nodo"
    >
      <div className="node-type-menu-title">Añadir nodo</div>
      <div className="node-type-menu-options">
        {schemas.length ? (
          schemas.map(schema => (
            <button key={schema.id} type="button" role="menuitem" onClick={() => onSelect(schema.id)}>
              <span className="type-dot" style={{ background: schema.color }} />
              <span>{schema.name}</span>
            </button>
          ))
        ) : (
          <p>No hay tipos de nodo válidos aquí.</p>
        )}
      </div>
    </div>
  );
}
