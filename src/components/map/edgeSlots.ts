import { facingSides, type Box, type Side } from './edgeGeometry';

/*
 * Para cada extremo de cada línea, el lado de la tarjeta por el que sale y un desplazamiento
 * a lo largo de ese lado. Las líneas que comparten lado se ordenan por la posición del nodo al que
 * van (y para los laterales, x para arriba y abajo), de modo que no se cruzan al salir.
 */

export interface EdgeEnds {
  sideSource: Side;
  sideTarget: Side;
  offsetSource: number;
  offsetTarget: number;
}

const SLOT_GAP = 12;

export function edgeSlots(
  boxes: Map<string, Box>,
  edges: { id: string; source: string; target: string }[],
): Map<string, EdgeEnds> {
  const result = new Map<string, EdgeEnds>();
  // Por nodo y lado: las líneas que salen por ahí con la coordenada del otro extremo, para ordenarlas.
  const groups = new Map<string, { edgeId: string; end: 'source' | 'target'; key: number }[]>();
  edges.forEach(e => {
    const a = boxes.get(e.source);
    const b = boxes.get(e.target);
    if (!a || !b) return;
    const [sideSource, sideTarget] = facingSides(a, b);
    result.set(e.id, { sideSource, sideTarget, offsetSource: 0, offsetTarget: 0 });
    const push = (nodeId: string, side: Side, end: 'source' | 'target', other: Box) => {
      const k = `${nodeId}|${side}`;
      const horizontal = side === 'left' || side === 'right';
      const key = horizontal ? other.y + other.height / 2 : other.x + other.width / 2;
      groups.set(k, [...(groups.get(k) ?? []), { edgeId: e.id, end, key }]);
    };
    push(e.source, sideSource, 'source', b);
    push(e.target, sideTarget, 'target', a);
  });
  groups.forEach((list, k) => {
    const [nodeId, side] = k.split('|') as [string, Side];
    const box = boxes.get(nodeId)!;
    const extent = side === 'left' || side === 'right' ? box.height : box.width;
    const gap = Math.min(SLOT_GAP, list.length > 1 ? (extent - 16) / (list.length - 1) : SLOT_GAP);
    // Mismo otro extremo (relaciones paralelas): orden estable por id para que no cambien de sitio.
    list.sort((p, q) => p.key - q.key || p.edgeId.localeCompare(q.edgeId));
    list.forEach((item, i) => {
      const offset = (i - (list.length - 1) / 2) * gap;
      const ends = result.get(item.edgeId)!;
      if (item.end === 'source') ends.offsetSource = offset;
      else ends.offsetTarget = offset;
    });
  });
  return result;
}
