import { Bookmark, BookmarkPlus, Check, ChevronDown, Pencil, RefreshCw, Trash2 } from 'lucide-react';
import { useCallback, useState } from 'react';
import { useApp } from '../../state/AppContext';
import { anchorOf, type Anchor } from '../common/anchor';
import { useDialogs } from '../common/dialogs';
import { Menu, type MenuEntry } from '../common/Menu';
import { Modal } from '../common/Modal';
import { useToast } from '../common/toasts';

/** Vistas guardadas del mapa: aplicar, guardar la actual, actualizar, renombrar y borrar. */
export function LensMenu() {
  const { project, dispatch } = useApp();
  const { prompt, confirm } = useDialogs();
  const toast = useToast();
  const [anchor, setAnchor] = useState<Anchor | null>(null);
  const [saving, setSaving] = useState(false);
  const close = useCallback(() => setAnchor(null), []);
  const active = project.lenses.find(l => l.id === project.view.lensId);

  const rename = async () => {
    if (!active) return;
    const name = await prompt({
      title: 'Renombrar vista',
      label: 'Nombre',
      initialValue: active.name,
      confirmLabel: 'Renombrar',
    });
    if (name) dispatch({ type: 'rename-lens', id: active.id, name });
  };
  const remove = async () => {
    if (!active) return;
    const ok = await confirm({
      title: `Eliminar la vista «${active.name}»`,
      message: 'Solo se borra la vista guardada; los nodos y relaciones no cambian.',
      confirmLabel: 'Eliminar',
      danger: true,
    });
    if (!ok) return;
    toast({ message: `Vista «${active.name}» eliminada`, undoable: true });
    dispatch({ type: 'delete-lens', id: active.id });
  };
  const update = () => {
    if (!active) return;
    dispatch({ type: 'save-lens', name: active.name, includePositions: active.positions !== null, id: active.id });
    toast({ message: `Vista «${active.name}» actualizada con la configuración actual`, undoable: true });
  };

  const entries: MenuEntry[] = [
    { section: 'Vistas guardadas' },
    ...(project.lenses.length
      ? project.lenses.map(l => ({
          label: l.name,
          icon: Bookmark,
          checked: l.id === project.view.lensId,
          hint: l.positions ? 'con posiciones' : undefined,
          onSelect: () => dispatch({ type: 'apply-lens', id: l.id }),
        }))
      : [{ label: 'Aún no hay vistas guardadas', icon: Bookmark, disabled: true, onSelect: () => {} }]),
    'separator',
    { label: 'Guardar la vista actual…', icon: BookmarkPlus, onSelect: () => setSaving(true) },
    ...(active
      ? [
          { label: `Actualizar «${active.name}»`, icon: RefreshCw, onSelect: update },
          { label: 'Renombrar', icon: Pencil, onSelect: rename },
          { label: 'Eliminar vista', icon: Trash2, danger: true, onSelect: remove },
        ]
      : []),
  ];

  return (
    <>
      <button
        type="button"
        className={`btn sm ${active ? '' : 'ghost'}`}
        aria-haspopup="menu"
        aria-expanded={Boolean(anchor)}
        title="Vistas guardadas: filtros, estructura, disposición y posiciones"
        onClick={event => (anchor ? close() : setAnchor(anchorOf(event.currentTarget)))}
      >
        <Bookmark size={14} aria-hidden />
        {active ? active.name : 'Vistas'}
        {active && <Check size={12} aria-hidden />}
        <ChevronDown size={12} aria-hidden className="menu-caret" />
      </button>
      {anchor && <Menu anchor={anchor} entries={entries} onClose={close} label="Vistas guardadas" />}
      {saving && <SaveLensModal onClose={() => setSaving(false)} />}
    </>
  );
}

function SaveLensModal({ onClose }: { onClose: () => void }) {
  const { project, dispatch } = useApp();
  const toast = useToast();
  const [name, setName] = useState('');
  const pinned = project.nodes.filter(n => n.positions[project.view.layout]).length;
  const [includePositions, setIncludePositions] = useState(pinned > 0);
  return (
    <Modal
      title="Guardar vista"
      submitLabel="Guardar"
      submitDisabled={!name.trim()}
      onSubmit={() => {
        dispatch({ type: 'save-lens', name: name.trim(), includePositions });
        toast({ message: `Vista «${name.trim()}» guardada` });
        onClose();
      }}
      onClose={onClose}
    >
      <div className="form-grid">
        <label className="field">
          Nombre
          <input
            autoFocus
            value={name}
            placeholder="Familia, Panteón, Conflictos…"
            onChange={e => setName(e.target.value)}
          />
        </label>
        <p className="muted-note">
          Se guardan la estructura («Ver por»), la disposición, el foco, las etiquetas y los tipos ocultos en la
          leyenda.
        </p>
        <label className="check">
          <input type="checkbox" checked={includePositions} onChange={e => setIncludePositions(e.target.checked)} />
          Guardar también las posiciones fijadas{pinned ? ` (${pinned})` : ''}
        </label>
      </div>
    </Modal>
  );
}
