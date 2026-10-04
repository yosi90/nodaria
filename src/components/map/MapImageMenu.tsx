import { Image as ImageIcon, Trash2, Upload } from 'lucide-react';
import { useRef, useState, type ChangeEvent } from 'react';
import { useApp } from '../../state/AppContext';
import { anchorOf, type Anchor } from '../common/anchor';
import { Button } from '../common/Button';
import { Menu, type MenuEntry } from '../common/Menu';
import { useToast } from '../common/toasts';
import { loadMapImage } from './images';

/** Subir, cambiar o quitar la imagen de fondo de la disposición «Mapa». */
export function MapImageMenu() {
  const { project, dispatch } = useApp();
  const toast = useToast();
  const input = useRef<HTMLInputElement>(null);
  const [anchor, setAnchor] = useState<Anchor | null>(null);
  const has = Boolean(project.mapImage);

  const onFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    try {
      const image = await loadMapImage(file);
      dispatch({ type: 'set-map-image', image });
      toast({
        message: `Imagen de fondo ${has ? 'cambiada' : 'añadida'} (${image.width} × ${image.height})`,
        undoable: true,
      });
    } catch {
      toast({ message: 'No se pudo leer la imagen.' });
    }
  };

  const entries: MenuEntry[] = [
    { label: has ? 'Cambiar imagen…' : 'Subir imagen…', icon: Upload, onSelect: () => input.current?.click() },
    ...(has
      ? [
          {
            label: 'Quitar imagen',
            icon: Trash2,
            danger: true,
            onSelect: () => {
              dispatch({ type: 'set-map-image', image: null });
              toast({ message: 'Imagen de fondo quitada', undoable: true });
            },
          } as MenuEntry,
        ]
      : []),
  ];

  return (
    <>
      <Button
        size="sm"
        icon={ImageIcon}
        aria-haspopup="menu"
        aria-expanded={Boolean(anchor)}
        onClick={event => (anchor ? setAnchor(null) : setAnchor(anchorOf(event.currentTarget)))}
      >
        {has ? 'Imagen' : 'Subir imagen'}
      </Button>
      <input ref={input} type="file" accept="image/*" hidden onChange={e => void onFile(e)} />
      {anchor && <Menu anchor={anchor} entries={entries} onClose={() => setAnchor(null)} label="Imagen de fondo" />}
    </>
  );
}
