import { analysisLinks } from '../../domain/centrality';
import { getSchema, nodeLabel } from '../../domain/selectors';
import type { Project } from '../../domain/types';
import { autoLayout } from '../map/layout';

/*
 * La imagen de un proyecto público (docs/roadmaps/ROADMAP_COMUNIDAD.md): la que acompaña a la novedad en el
 * feed y a la vista previa del enlace. Se dibuja aquí, sin el lienzo, con la misma disposición por fuerzas
 * (respetando lo que esté fijado a mano), y se pasa a PNG en el navegador al publicar.
 */

export const THUMB_W = 1200;
export const THUMB_H = 630;
const MAX_NODES = 400;
/** Con más nodos que estos, los nombres no se leerían: solo se dibujan los puntos. */
const LABELED = 25;

const escape = (text: string) =>
  text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** El SVG de la imagen: los nodos con el color de su tipo, sus vínculos y, si caben, sus nombres. */
export function thumbnailSvg(p: Project, theme: { bg: string; edge: string; text: string } = DEFAULT_THEME) {
  const nodes = p.nodes.slice(0, MAX_NODES);
  const ids = new Set(nodes.map(n => n.id));
  const links = analysisLinks(p).filter(l => ids.has(l.a) && ids.has(l.b));
  const fixed = new Map(nodes.filter(n => n.positions.force).map(n => [n.id, n.positions.force!] as const));
  const positions = nodes.length ? autoLayout({ ...p, nodes }, 'force', null, links, null, fixed) : new Map();
  const points = nodes.map(n => ({ node: n, at: positions.get(n.id) ?? { x: 0, y: 0 } }));
  const xs = points.map(pt => pt.at.x);
  const ys = points.map(pt => pt.at.y);
  const [minX, maxX, minY, maxY] = xs.length
    ? [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)]
    : [0, 1, 0, 1];
  // Se rellena el formato apaisado: cada eje con su escala, sin deformar más del doble, y abajo queda sitio
  // para el nombre del proyecto.
  const margin = 60;
  const availW = THUMB_W - margin * 2;
  const availH = THUMB_H - margin * 2 - 50;
  let scaleX = Math.min(availW / Math.max(maxX - minX, 1), 1.6);
  let scaleY = Math.min(availH / Math.max(maxY - minY, 1), 1.6);
  scaleX = Math.min(scaleX, scaleY * 2);
  scaleY = Math.min(scaleY, scaleX * 2);
  const offsetX = (THUMB_W - (maxX - minX) * scaleX) / 2;
  const offsetY = margin + (availH - (maxY - minY) * scaleY) / 2;
  const place = (at: { x: number; y: number }) => ({
    x: Math.round((at.x - minX) * scaleX + offsetX),
    y: Math.round((at.y - minY) * scaleY + offsetY),
  });
  const byId = new Map(points.map(pt => [pt.node.id, place(pt.at)]));
  const radius = nodes.length > LABELED ? 7 : 11;

  const edges = links
    .map(l => {
      const a = byId.get(l.a);
      const b = byId.get(l.b);
      return a && b ? `<line x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}"/>` : '';
    })
    .join('');
  const dots = points
    .map(pt => {
      const at = byId.get(pt.node.id)!;
      const color = getSchema(p, pt.node.typeId)?.color || '#7c6cf0';
      const label =
        nodes.length <= LABELED
          ? `<text x="${at.x}" y="${at.y + radius + 18}">${escape(nodeLabel(p, pt.node).slice(0, 28))}</text>`
          : '';
      return `<circle cx="${at.x}" cy="${at.y}" r="${radius}" fill="${escape(color)}"/>${label}`;
    })
    .join('');
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${THUMB_W}" height="${THUMB_H}" viewBox="0 0 ${THUMB_W} ${THUMB_H}">` +
    `<rect width="100%" height="100%" fill="${theme.bg}"/>` +
    `<g stroke="${theme.edge}" stroke-width="2" stroke-opacity="0.55">${edges}</g>` +
    `<g font-family="Inter, Segoe UI, sans-serif" font-size="15" fill="${theme.text}" text-anchor="middle">${dots}</g>` +
    `<text x="40" y="${THUMB_H - 34}" font-family="Fraunces, Georgia, serif" font-size="30" fill="${theme.text}">${escape(p.name.slice(0, 60))}</text>` +
    `<text x="${THUMB_W - 40}" y="${THUMB_H - 34}" font-family="Inter, Segoe UI, sans-serif" font-size="18" fill="${theme.edge}" text-anchor="end">Nodaria</text>` +
    '</svg>'
  );
}

const DEFAULT_THEME = { bg: '#f7f5f0', edge: '#8a8478', text: '#1f1d1a' };

/** La imagen en PNG (data URL), o `null` si el navegador no la puede dibujar. */
export async function thumbnailPng(p: Project): Promise<string | null> {
  try {
    const svg = thumbnailSvg(p);
    const image = new Image();
    const loaded = new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new Error('No se ha podido dibujar la imagen'));
    });
    image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
    await loaded;
    const canvas = document.createElement('canvas');
    canvas.width = THUMB_W;
    canvas.height = THUMB_H;
    const context = canvas.getContext('2d');
    if (!context) return null;
    context.drawImage(image, 0, 0);
    return canvas.toDataURL('image/png');
  } catch {
    return null;
  }
}
