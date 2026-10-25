import type { InternalNode } from '@xyflow/react';
import type { Box } from './edgeGeometry';
import { NODE_H, NODE_W } from './layout';

/*
 * Las tarjetas del lienzo como cajas, para las líneas que las unen o las esquivan (`FloatingEdge`,
 * `ForeignKeyEdge`). En texto («x,y,ancho,alto», separadas por `;`) sirven de firma: la ruta solo se vuelve
 * a calcular si alguna cambia.
 */

/** La caja de una tarjeta, con su tamaño medido (o el de siempre, si aún no se ha medido). */
export const boxOf = (n: InternalNode): Box => ({
  x: n.internals.positionAbsolute.x,
  y: n.internals.positionAbsolute.y,
  width: n.measured.width ?? NODE_W,
  height: n.measured.height ?? NODE_H,
});

/** Una caja en texto; con `round`, en píxeles enteros. */
export const boxText = (b: Box, round = false) =>
  (round ? [b.x, b.y, b.width, b.height].map(Math.round) : [b.x, b.y, b.width, b.height]).join(',');

/** Las cajas de un texto hecho con `boxText` y `;`. */
export const parseBoxes = (text: string): Box[] =>
  text
    ? text.split(';').map(part => {
        const [x, y, width, height] = part.split(',').map(Number);
        return { x, y, width, height };
      })
    : [];
