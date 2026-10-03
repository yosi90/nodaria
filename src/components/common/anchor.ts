/** Rectángulo de anclaje en coordenadas de ventana. */
export interface Anchor {
  x: number;
  y: number;
  width: number;
  height: number;
  /** Elemento que abrió el popover: no lo cierra al pulsarlo y recupera el foco al cerrar. */
  element?: HTMLElement | null;
}

export function anchorOf(element: HTMLElement): Anchor {
  const rect = element.getBoundingClientRect();
  return { x: rect.left, y: rect.top, width: rect.width, height: rect.height, element };
}

export const pointAnchor = (x: number, y: number): Anchor => ({ x, y, width: 0, height: 0 });
