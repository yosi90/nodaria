import {
  ChevronDown,
  CircleHelp,
  Copy,
  Download,
  FolderOpen,
  GitFork,
  HeartPulse,
  Library,
  Monitor,
  Moon,
  Network,
  Pencil,
  Plus,
  Redo2,
  Search,
  Shapes,
  Sun,
  Trash2,
  Undo2,
  Upload,
  Table2,
} from 'lucide-react';
import { useCallback, useRef, useState } from 'react';
import { parseProject, serializeProject } from '../../services/storage';
import { useApp } from '../../state/AppContext';
import { usePreferences, type Preferences } from '../../state/preferences';
import { IconButton } from '../common/Button';
import { useDialogs } from '../common/dialogs';
import { Menu, type MenuEntry } from '../common/Menu';
import type { View } from '../../state/navigation';
import { anchorOf, type Anchor } from '../common/anchor';
import { useToast } from '../common/toasts';
import { Logo } from '../common/Logo';
import { AccountButton } from '../account/AccountButton';

export type { View } from '../../state/navigation';

const THEME_CYCLE: Record<Preferences['theme'], { next: Preferences['theme']; label: string; icon: typeof Sun }> = {
  system: { next: 'light', label: 'Tema: sistema', icon: Monitor },
  light: { next: 'dark', label: 'Tema: claro', icon: Sun },
  dark: { next: 'system', label: 'Tema: oscuro', icon: Moon },
};

export function Topbar({
  view,
  onView,
  onHelp,
  onSearch,
}: {
  view: View;
  onView: (v: View) => void;
  onHelp: () => void;
  onSearch: () => void;
}) {
  const { state, project, dispatch, undo, redo, canUndo, canRedo, reportRepairs } = useApp();
  const { preferences, setPreference } = usePreferences();
  const { prompt, confirm } = useDialogs();
  const toast = useToast();
  const file = useRef<HTMLInputElement>(null);
  const [menuAnchor, setMenuAnchor] = useState<Anchor | null>(null);
  const closeMenu = useCallback(() => setMenuAnchor(null), []);
  const theme = THEME_CYCLE[preferences.theme];

  const create = async () => {
    const name = await prompt({
      title: 'Nuevo proyecto',
      label: 'Nombre',
      placeholder: 'Por ejemplo: Crónicas de Vael',
      confirmLabel: 'Crear',
    });
    if (name) dispatch({ type: 'add-project', name });
  };
  const rename = async () => {
    const name = await prompt({
      title: 'Renombrar proyecto',
      label: 'Nombre',
      initialValue: project.name,
      confirmLabel: 'Renombrar',
    });
    if (name) dispatch({ type: 'rename-project', name });
  };
  const remove = async () => {
    const ok = await confirm({
      title: 'Eliminar proyecto',
      message: (
        <>
          Se eliminará «{project.name}» con sus {project.nodes.length} nodos y {project.relations.length} relaciones.
          Descarga antes una copia si quieres conservarlo.
        </>
      ),
      confirmLabel: 'Eliminar proyecto',
      danger: true,
    });
    if (!ok) return;
    toast({ message: `Proyecto «${project.name}» eliminado`, undoable: true });
    dispatch({ type: 'delete-project' });
  };
  const download = () => {
    const blob = new Blob([serializeProject(project)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${project.name.replace(/[^a-z0-9áéíóúüñ]+/gi, '_')}.nodaria.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  };
  const upload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (!f) return;
    try {
      const { project: imported, issues } = parseProject(await f.text());
      dispatch({ type: 'import-project', project: imported });
      toast({ message: `Proyecto «${imported.name}» importado` });
      if (issues.length) reportRepairs({ projectName: imported.name, issues });
    } catch {
      toast({ message: 'El archivo no contiene un proyecto de Nodaria válido.' });
    }
  };

  const entries: MenuEntry[] = [
    { section: 'Proyectos' },
    ...state.projects.map(p => ({
      label: p.name,
      icon: FolderOpen,
      checked: p.id === project.id,
      onSelect: () => dispatch({ type: 'set-project', id: p.id }),
    })),
    'separator',
    { label: 'Nuevo proyecto', icon: Plus, onSelect: create },
    { label: 'Renombrar', icon: Pencil, onSelect: rename },
    { label: 'Duplicar', icon: Copy, onSelect: () => dispatch({ type: 'duplicate-project' }) },
    'separator',
    { label: 'Importar JSON…', icon: Upload, onSelect: () => file.current?.click() },
    { label: 'Exportar JSON', icon: Download, onSelect: download },
    'separator',
    { label: 'Eliminar proyecto', icon: Trash2, danger: true, onSelect: remove },
  ];

  return (
    <header className="topbar">
      <div className="brand">
        <span className="brand-mark" aria-hidden>
          <Logo size={18} />
        </span>
        <span className="brand-name">Nodaria</span>
      </div>
      <button
        type="button"
        className="project-switcher"
        aria-haspopup="menu"
        aria-expanded={Boolean(menuAnchor)}
        title="Proyecto actual"
        onClick={event => (menuAnchor ? closeMenu() : setMenuAnchor(anchorOf(event.currentTarget)))}
      >
        <span className="label">{project.name}</span>
        <ChevronDown size={15} aria-hidden />
      </button>
      {menuAnchor && <Menu anchor={menuAnchor} entries={entries} onClose={closeMenu} label="Proyecto" />}
      <span className="divider hide-narrow" aria-hidden />
      <nav className="segmented labeled views-nav" aria-label="Vistas">
        <span className="segmented-label" title="Ver y revisar los datos del mundo">
          Datos
        </span>
        <button type="button" aria-pressed={view === 'map'} onClick={() => onView('map')}>
          <Network size={15} aria-hidden />
          <span className="label">Mapa</span>
        </button>
        <button type="button" aria-pressed={view === 'table'} onClick={() => onView('table')}>
          <Table2 size={15} aria-hidden />
          <span className="label">Tabla</span>
        </button>
        <button type="button" aria-pressed={view === 'health'} onClick={() => onView('health')}>
          <HeartPulse size={15} aria-hidden />
          <span className="label">Salud</span>
        </button>
        <span className="views-divider" aria-hidden />
        <span className="segmented-label" title="Definir qué cosas existen y cómo se conectan">
          Esquema
        </span>
        <button type="button" aria-pressed={view === 'schema'} onClick={() => onView('schema')}>
          <Shapes size={15} aria-hidden />
          <span className="label">Tipos</span>
        </button>
        <button type="button" aria-pressed={view === 'relations'} onClick={() => onView('relations')}>
          <GitFork size={15} aria-hidden />
          <span className="label">Relaciones</span>
        </button>
        <button type="button" aria-pressed={view === 'properties'} onClick={() => onView('properties')}>
          <Library size={15} aria-hidden />
          <span className="label">Propiedades</span>
        </button>
      </nav>
      <div className="spacer" />
      <button type="button" className="search-button hide-narrow" onClick={onSearch}>
        <Search size={14} aria-hidden />
        <span>Buscar…</span>
        <kbd>Ctrl K</kbd>
      </button>
      <div className="topbar-actions">
        <IconButton icon={Undo2} label="Deshacer (Ctrl+Z)" disabled={!canUndo} onClick={undo} />
        <IconButton icon={Redo2} label="Rehacer (Ctrl+Shift+Z)" disabled={!canRedo} onClick={redo} />
        <span className="divider" aria-hidden />
        <IconButton
          icon={theme.icon}
          label={`${theme.label} (cambiar)`}
          onClick={() => setPreference('theme', theme.next)}
        />
        <IconButton icon={CircleHelp} label="Atajos de teclado (?)" tooltipSide="left" onClick={onHelp} />
        <span className="divider" aria-hidden />
        <AccountButton />
      </div>
      <input ref={file} hidden type="file" accept="application/json,.json" onChange={upload} />
    </header>
  );
}
