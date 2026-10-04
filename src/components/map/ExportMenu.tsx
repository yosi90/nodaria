import { getNodesBounds, useReactFlow } from '@xyflow/react';
import { toPng, toSvg } from 'html-to-image';
import { Download, FileImage, FileCode2 } from 'lucide-react';
import { useCallback, useState } from 'react';
import { anchorOf, type Anchor } from '../common/anchor';
import { IconButton } from '../common/Button';
import { Menu, type MenuEntry } from '../common/Menu';
import { useToast } from '../common/toasts';

/*
 * Exportar el lienzo como imagen. «Todo el mapa» encuadra todos los nodos en la imagen aunque no
 * quepan en pantalla; «Vista actual» captura lo que se ve con el zoom y el encuadre actuales.
 */

interface ExportMenuProps {
  /** Nombre base del archivo (el del proyecto). */
  name: string;
  /** Elemento del lienzo (sección que contiene a React Flow). */
  container: () => HTMLElement | null;
}

const MARGIN = 48;
const MAX_SIZE = 8192;

export function ExportMenu({ name, container }: ExportMenuProps) {
  const flow = useReactFlow();
  const toast = useToast();
  const [anchor, setAnchor] = useState<Anchor | null>(null);
  const [busy, setBusy] = useState(false);

  const exportImage = useCallback(
    async (format: 'png' | 'svg', scope: 'all' | 'view') => {
      const root = container();
      const viewport = root?.querySelector<HTMLElement>('.react-flow__viewport');
      if (!root || !viewport) return;
      setBusy(true);
      try {
        const nodes = flow.getNodes();
        let width = root.clientWidth;
        let height = root.clientHeight;
        let transform = viewport.style.transform;
        if (scope === 'all' && nodes.length) {
          // Escala 1 con un margen fijo; si el mapa es enorme, se reduce para no pasar del tamaño máximo.
          const bounds = getNodesBounds(nodes);
          const zoom = Math.min(1, (MAX_SIZE - MARGIN * 2) / Math.max(bounds.width, bounds.height, 1));
          width = Math.ceil(bounds.width * zoom + MARGIN * 2);
          height = Math.ceil(bounds.height * zoom + MARGIN * 2);
          transform = `translate(${MARGIN - bounds.x * zoom}px, ${MARGIN - bounds.y * zoom}px) scale(${zoom})`;
        }
        const background = getComputedStyle(root).getPropertyValue('--canvas-bg').trim() || '#ffffff';
        const options = {
          backgroundColor: background,
          width,
          height,
          pixelRatio: format === 'png' ? 2 : 1,
          style: { width: `${width}px`, height: `${height}px`, transform },
          filter: (el: Element) => !(el instanceof HTMLElement && el.classList.contains('react-flow__attribution')),
        };
        const dataUrl = format === 'png' ? await toPng(viewport, options) : await toSvg(viewport, options);
        const link = document.createElement('a');
        link.download = `${name || 'nodaria'}${scope === 'all' ? '' : ' (vista)'}.${format}`;
        link.href = dataUrl;
        link.click();
        toast({ message: `Imagen ${format.toUpperCase()} descargada` });
      } catch (error) {
        toast({ message: `No se pudo exportar: ${error instanceof Error ? error.message : String(error)}` });
      } finally {
        setBusy(false);
      }
    },
    [container, flow, name, toast],
  );

  const entries: MenuEntry[] = [
    { section: 'Todo el mapa' },
    { label: 'PNG (doble resolución)', icon: FileImage, onSelect: () => void exportImage('png', 'all') },
    { label: 'SVG (vectorial)', icon: FileCode2, onSelect: () => void exportImage('svg', 'all') },
    { section: 'Vista actual (zoom y encuadre)' },
    { label: 'PNG de la vista', icon: FileImage, onSelect: () => void exportImage('png', 'view') },
    { label: 'SVG de la vista', icon: FileCode2, onSelect: () => void exportImage('svg', 'view') },
  ];

  return (
    <>
      <IconButton
        icon={Download}
        label="Exportar imagen (PNG o SVG)"
        disabled={busy}
        active={Boolean(anchor)}
        onClick={event => (anchor ? setAnchor(null) : setAnchor(anchorOf(event.currentTarget)))}
      />
      {anchor && <Menu anchor={anchor} entries={entries} onClose={() => setAnchor(null)} label="Exportar imagen" />}
    </>
  );
}
