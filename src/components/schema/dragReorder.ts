import { useState, type DragEvent } from 'react';

/*
 * Arrastrar para reordenar los atributos de un tipo (`AttributesCard`) y las preformas (`LibraryEditor`):
 * mientras se arrastra, la lista se enseña ya reordenada y el elemento movido va como fantasma en el sitio
 * donde quedaría; al soltar se confirma ese orden.
 */

/** `ids` con `moving` antes o después de `targetId`; igual si alguno no está o son el mismo. */
export function moveId(ids: string[], moving: string, targetId: string, after: boolean): string[] {
  if (moving === targetId || !ids.includes(moving)) return ids;
  const rest = ids.filter(id => id !== moving);
  const index = rest.indexOf(targetId);
  if (index < 0) return ids;
  rest.splice(index + (after ? 1 : 0), 0, moving);
  return rest;
}

/**
 * El arrastre de una lista de `ids`: `shown` es el orden que se enseña, `dropped` el que se confirma al
 * soltar (`null` si no hay ningún cambio a la vista) y `end` termina el arrastre.
 */
export function useDragReorder(ids: string[]) {
  const [dragged, setDragged] = useState<string | null>(null);
  const [preview, setPreview] = useState<{ targetId: string; after: boolean } | null>(null);
  const dropped = dragged && preview ? moveId(ids, dragged, preview.targetId, preview.after) : null;
  const hover = (targetId: string, after: boolean) => {
    if (!dragged || targetId === dragged) return;
    setPreview(current =>
      current && current.targetId === targetId && current.after === after ? current : { targetId, after },
    );
  };
  const end = () => {
    setDragged(null);
    setPreview(null);
  };
  return { dragged, start: setDragged, hover, end, shown: dropped ?? ids, dropped };
}

/**
 * Lo que hace de una fila un destino del arrastre: según la mitad por la que se pasa, antes o después de ella.
 * `data-field-id` deja que el buscador (`revealField`) encuentre la fila.
 */
export const dropTarget = (
  id: string,
  onHover: ((id: string, after: boolean) => void) | undefined,
  onDrop: () => void,
) => ({
  'data-field-id': id,
  onDragOver: (event: DragEvent<HTMLElement>) => {
    event.preventDefault();
    const bounds = event.currentTarget.getBoundingClientRect();
    onHover?.(id, event.clientY > bounds.top + bounds.height / 2);
  },
  onDrop: (event: DragEvent<HTMLElement>) => {
    event.preventDefault();
    onDrop();
  },
});
