import {
  CalendarDays,
  ChevronDown,
  CircleHelp,
  Lightbulb,
  Copy,
  Download,
  FolderOpen,
  Layers,
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
  Settings,
  Shapes,
  Sparkles,
  Sun,
  Trash2,
  Undo2,
  Upload,
  Table2,
  Database,
  Tags,
  Users,
  MessagesSquare,
  Lock,
  CloudOff,
  MessageSquareText,
} from 'lucide-react';
import { useCallback, useRef, useState } from 'react';
import { downloadProject, downloadText } from '../../services/files';
import { sqlScript } from '../../domain/sqlScript';
import { tableTypes } from '../../domain/database';
import { kindLabel } from '../../domain/projectKinds';
import { ProjectKindDialog } from './ProjectKindDialog';
import { parseProject } from '../../services/storage';
import { uid } from '../../domain/factories';
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
import { sdk } from '../../services/yosiftware';
import { CalendarDialog } from './CalendarDialog';
import { NewProjectDialog } from '../onboarding/NewProjectDialog';
import { GroupDialog } from '../groups/GroupDialog';
import { ShareDialog } from '../groups/ShareDialog';
import { roleLabel, type GroupInfo } from '../../services/groups';
import { useAuth } from '../../state/auth';
import { useGroups } from '../../state/groups';

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
  onTemplates,
}: {
  view: View;
  onView: (v: View) => void;
  onHelp: () => void;
  onSearch: () => void;
  onTemplates: () => void;
}) {
  const { state, project, dispatch, undo, redo, canUndo, canRedo, reportRepairs } = useApp();
  const { preferences, setPreference } = usePreferences();
  const { prompt, confirm } = useDialogs();
  const toast = useToast();
  const file = useRef<HTMLInputElement>(null);
  const [menu, setMenu] = useState<{ kind: 'projects' | 'settings'; anchor: Anchor } | null>(null);
  const [calendarOpen, setCalendarOpen] = useState(false);
  // El asistente de IA trabaja de momento sobre esquemas de base de datos.
  const aiAvailable = project.kind === 'database' || tableTypes(project).length > 0;
  const toggleAi = () => setPreference('aiPanelOpen', !preferences.aiPanelOpen);
  const [kindOpen, setKindOpen] = useState(false);
  const [newProjectOpen, setNewProjectOpen] = useState(false);
  const { status: authStatus, signIn } = useAuth();
  const { groupOf, present, syncState, isShared } = useGroups();
  const group = groupOf(project.id);
  const [shareOpen, setShareOpen] = useState(false);
  const [groupOpen, setGroupOpen] = useState<GroupInfo | null>(null);
  const openSharing = () => {
    if (group) setGroupOpen(group);
    else if (authStatus === 'signed-in') setShareOpen(true);
    else void signIn();
  };
  const closeMenu = useCallback(() => setMenu(null), []);
  const toggleMenu = (kind: 'projects' | 'settings', target: HTMLElement) =>
    setMenu(menu?.kind === kind ? null : { kind, anchor: anchorOf(target) });
  const theme = THEME_CYCLE[preferences.theme];

  const create = () => setNewProjectOpen(true);
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
  const upload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (!f) return;
    try {
      const parsed = parseProject(await f.text());
      // Importar crea siempre una copia propia: un JSON de un proyecto de grupo no hereda el grupo.
      const imported = isShared(parsed.project.id) ? { ...parsed.project, id: uid('project') } : parsed.project;
      const { issues } = parsed;
      dispatch({ type: 'import-project', project: imported });
      toast({ message: `Proyecto «${imported.name}» importado` });
      if (issues.length) reportRepairs({ projectName: imported.name, issues });
    } catch {
      toast({ message: 'El archivo no contiene un proyecto de Nodaria válido.' });
    }
  };

  const projectEntries: MenuEntry[] = [
    { section: 'Proyectos' },
    ...state.projects.map(p => ({
      label: p.name,
      icon: groupOf(p.id) ? Users : FolderOpen,
      hint: groupOf(p.id) ? 'Grupo' : undefined,
      checked: p.id === project.id,
      onSelect: () => dispatch({ type: 'set-project', id: p.id }),
    })),
    'separator',
    { label: 'Nuevo proyecto', icon: Plus, onSelect: create },
    { label: 'Ejemplos y plantillas…', icon: Layers, onSelect: onTemplates },
    { label: 'Importar JSON…', icon: Upload, onSelect: () => file.current?.click() },
  ];
  const settingsEntries: MenuEntry[] = [
    { section: project.name },
    { label: 'Renombrar', icon: Pencil, onSelect: rename },
    { label: 'Duplicar', icon: Copy, onSelect: () => dispatch({ type: 'duplicate-project' }) },
    {
      label: 'Tipo de proyecto…',
      hint: kindLabel(project.kind),
      icon: Tags,
      onSelect: () => setKindOpen(true),
    },
    { label: 'Calendario del proyecto…', icon: CalendarDays, onSelect: () => setCalendarOpen(true) },
    group
      ? {
          label: `Grupo «${group.name}»…`,
          hint: group.isOwner ? 'Propiedad' : roleLabel(group.role, project.kind, group.roleLabels),
          icon: Users,
          onSelect: openSharing,
        }
      : {
          label: 'Compartir con un grupo…',
          hint: authStatus === 'signed-in' ? undefined : 'Entra con tu cuenta',
          icon: Users,
          onSelect: openSharing,
        },
    // El asistente de IA trabaja de momento sobre esquemas de base de datos.
    ...(aiAvailable
      ? [{ label: 'Asistente de IA', icon: Sparkles, checked: preferences.aiPanelOpen, onSelect: toggleAi }]
      : []),
    'separator',
    { label: 'Exportar JSON', icon: Download, onSelect: () => downloadProject(project) },
    ...(tableTypes(project).length
      ? [
          {
            label: 'Exportar SQL Server (.sql)',
            icon: Database,
            onSelect: () =>
              downloadText(
                `${project.name.replace(/[^a-z0-9áéíóúüñ]+/gi, '_')}.sql`,
                sqlScript(project),
                'application/sql',
              ),
          },
        ]
      : []),
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
      <div className="project-controls" data-tour="project">
        <button
          type="button"
          className="project-switcher"
          aria-haspopup="menu"
          aria-expanded={menu?.kind === 'projects'}
          title="Cambiar de proyecto"
          onClick={event => toggleMenu('projects', event.currentTarget)}
        >
          <span className="label">{project.name}</span>
          <ChevronDown size={15} aria-hidden />
        </button>
        <IconButton
          icon={Settings}
          label="Ajustes del proyecto"
          active={menu?.kind === 'settings'}
          aria-haspopup="menu"
          aria-expanded={menu?.kind === 'settings'}
          onClick={event => toggleMenu('settings', event.currentTarget)}
        />
        {group && (
          <button
            type="button"
            className="group-chip"
            title={`Proyecto del grupo «${group.name}». Tu rol: ${group.isOwner ? 'propiedad' : roleLabel(group.role, project.kind, group.roleLabels)}.${
              present.length
                ? ` ${present.length === 1 ? 'Otra persona lo tiene' : `${present.length} personas más lo tienen`} abierto ahora.`
                : ''
            }`}
            onClick={() => setGroupOpen(group)}
          >
            <Users size={13} aria-hidden />
            <span className="label">
              {group.isOwner ? 'Propiedad' : roleLabel(group.role, project.kind, group.roleLabels)}
            </span>
            {!group.capabilities.edit && <Lock size={12} aria-label="solo lectura" />}
            {syncState !== 'ok' && (
              <CloudOff
                size={13}
                className="group-offline"
                aria-label={
                  syncState === 'offline'
                    ? 'Sin conexión: tus cambios se subirán al volver'
                    : 'No se ha podido sincronizar el proyecto del grupo'
                }
              />
            )}
            {present.length > 0 && (
              <span className="group-presence" aria-label={`${present.length} más conectadas`}>
                +{present.length}
              </span>
            )}
          </button>
        )}
        {group &&
          (['chat', 'comentarios'] as const).map(tab => {
            const open = preferences.groupChatOpen && preferences.groupPanelTab === tab;
            const name = tab === 'chat' ? 'el chat del grupo' : 'los comentarios del proyecto';
            return (
              <IconButton
                key={tab}
                icon={tab === 'chat' ? MessagesSquare : MessageSquareText}
                label={open ? `Cerrar ${name}` : tab === 'chat' ? 'Chat del grupo' : 'Comentarios y sugerencias'}
                active={open}
                aria-pressed={open}
                onClick={() => {
                  setPreference('groupPanelTab', tab);
                  setPreference('groupChatOpen', !open);
                }}
              />
            );
          })}
      </div>
      {menu && (
        <Menu
          anchor={menu.anchor}
          entries={menu.kind === 'projects' ? projectEntries : settingsEntries}
          onClose={closeMenu}
          label={menu.kind === 'projects' ? 'Proyectos' : 'Ajustes del proyecto'}
        />
      )}
      {calendarOpen && <CalendarDialog onClose={() => setCalendarOpen(false)} />}
      {kindOpen && <ProjectKindDialog onClose={() => setKindOpen(false)} />}
      <span className="divider hide-narrow" aria-hidden />
      <nav className="segmented labeled views-nav" aria-label="Vistas" data-tour="views">
        <span className="segmented-label" title="Ver y revisar los datos del proyecto">
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
        {aiAvailable && (
          <IconButton
            icon={Sparkles}
            label={preferences.aiPanelOpen ? 'Cerrar el asistente de IA' : 'Asistente de IA'}
            active={preferences.aiPanelOpen}
            aria-pressed={preferences.aiPanelOpen}
            onClick={toggleAi}
          />
        )}
        <span className="divider" aria-hidden />
        <IconButton
          icon={theme.icon}
          label={`${theme.label} (cambiar)`}
          onClick={() => setPreference('theme', theme.next)}
        />
        <IconButton
          icon={Lightbulb}
          label="Errores y propuestas: avisa de un fallo o propón una mejora"
          tooltipSide="left"
          onClick={() => void sdk()?.reportar()}
        />
        <IconButton icon={CircleHelp} label="Ayuda (?)" tooltipSide="left" onClick={onHelp} data-tour="help" />
        <span className="divider" aria-hidden />
        <AccountButton />
      </div>
      <input ref={file} hidden type="file" accept="application/json,.json" onChange={upload} />
      {newProjectOpen && <NewProjectDialog onClose={() => setNewProjectOpen(false)} />}
      {shareOpen && (
        <ShareDialog
          onClose={() => setShareOpen(false)}
          onShared={created => {
            setShareOpen(false);
            toast({ message: `«${project.name}» ya es del grupo «${created.name}». Invita a quien quieras.` });
            setGroupOpen(created);
          }}
        />
      )}
      {groupOpen && <GroupDialog group={groupOf(project.id) ?? groupOpen} onClose={() => setGroupOpen(null)} />}
    </header>
  );
}
