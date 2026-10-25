import {
  CalendarCog,
  CalendarDays,
  Share2,
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
  History,
  FileArchive,
  Sheet,
  CalendarRange,
  UserPlus,
  UserCog,
  type LucideIcon,
  ExternalLink,
  Globe,
} from 'lucide-react';
import { hasDataTables } from '../../domain/tableData';
import { PublishDialog } from '../community/PublishDialog';
import { CommunityButton } from '../community/CommunityButton';
import { Fragment, useCallback, useRef, useState } from 'react';
import { downloadBytes, downloadProject, downloadText } from '../../services/files';
import { exportZip } from '../../services/exportBundle';
import { sqlScript } from '../../domain/sqlScript';
import {
  openDb2Export,
  openDocumentConversion,
  openDocumentImport,
  openTableConversion,
  openTablesImport,
} from './openDialogs';
import { documentCollections } from '../../domain/tableConversion';
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
import { projectEngines } from '../../domain/database';
import { mongoScript } from '../../domain/mongoScript';
import { firestoreRules } from '../../domain/firestoreRules';
import { neo4jSchema, projectCypher } from '../../domain/neo4j';
import { EcosystemWebs } from './EcosystemWebs';
import { SnapshotsDialog } from './SnapshotsDialog';
import { CsvImportDialog } from './CsvImportDialog';
import { ImportProjectDialog } from './ImportProjectDialog';
import type { Project } from '../../domain/types';
import { parseCsv, type CsvTable } from '../../domain/csvImport';
import { fileSafeName } from '../../domain/text';
import { NewProjectDialog } from '../onboarding/NewProjectDialog';
import { GroupDialog, type GroupDialogMode } from '../groups/GroupDialog';
import { ShareDialog } from '../groups/ShareDialog';
import { canManageGroup, roleLabel, type GroupInfo } from '../../services/groups';
import { useAuth } from '../../state/auth';
import { useGroups } from '../../state/groups';
import { useTopbarDensity } from './useTopbarDensity';

export type { View } from '../../state/navigation';

const THEME_CYCLE: Record<Preferences['theme'], { next: Preferences['theme']; label: string; icon: typeof Sun }> = {
  system: { next: 'light', label: 'Tema: sistema', icon: Monitor },
  light: { next: 'dark', label: 'Tema: claro', icon: Sun },
  dark: { next: 'system', label: 'Tema: oscuro', icon: Moon },
};

interface ViewEntry {
  id: View;
  label: string;
  icon: LucideIcon;
  /** Número del atajo Alt+N (App.tsx). */
  key: number;
}
const VIEW_GROUPS: { id: 'data' | 'schema'; label: string; title: string; icon: LucideIcon; views: ViewEntry[] }[] = [
  {
    id: 'data',
    label: 'Datos',
    title: 'Ver y revisar los datos del proyecto',
    icon: Network,
    views: [
      { id: 'map', label: 'Mapa', icon: Network, key: 1 },
      { id: 'table', label: 'Tabla', icon: Table2, key: 2 },
      { id: 'timeline', label: 'Cronología', icon: CalendarRange, key: 7 },
      { id: 'calendar', label: 'Calendario', icon: CalendarDays, key: 8 },
      // Solo con tablas relacionales (docs/roadmaps/ROADMAP_DATOS_BD.md).
      { id: 'records', label: 'Registros', icon: Database, key: 9 },
      { id: 'health', label: 'Salud', icon: HeartPulse, key: 3 },
    ],
  },
  {
    id: 'schema',
    label: 'Esquema',
    title: 'Definir qué cosas existen y cómo se conectan',
    icon: Shapes,
    views: [
      { id: 'schema', label: 'Tipos', icon: Shapes, key: 4 },
      { id: 'relations', label: 'Relaciones', icon: GitFork, key: 5 },
      { id: 'properties', label: 'Propiedades', icon: Library, key: 6 },
    ],
  },
];

/**
 * Niveles de compactación de la barra, de menos a más: cuando el contenido no cabe se aplica el
 * siguiente (useTopbarDensity).
 */
const DENSITY = {
  /** El chat y los comentarios del grupo pasan al menú de la insignia del grupo. */
  groupMenu: 1,
  /** La búsqueda queda en un botón de icono. */
  searchIcon: 2,
  /** Sin los rótulos «Datos» y «Esquema»: el separador sigue dividiendo los dos grupos. */
  viewGroupLabels: 3,
  /** Las vistas, solo con iconos. */
  viewIcons: 4,
  /** «Datos» y «Esquema» pasan a ser dos menús. */
  viewMenus: 5,
  /** Nombre del proyecto más corto y menús de vistas solo con el icono. */
  tight: 6,
} as const;

type MenuKind = 'projects' | 'settings' | 'group' | 'data' | 'schema';
const MENU_LABELS: Record<MenuKind, string> = {
  projects: 'Proyectos',
  settings: 'Ajustes del proyecto',
  group: 'Grupo',
  data: 'Vistas de datos',
  schema: 'Vistas del esquema',
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
  const { state, project, dispatch, undo, redo, canUndo, canRedo } = useApp();
  // «Registros» solo aparece con tablas donde escribir filas (o si ya se está en ella).
  const withRecords = hasDataTables(project) || view === 'records';
  const viewGroups = withRecords
    ? VIEW_GROUPS
    : VIEW_GROUPS.map(g => ({ ...g, views: g.views.filter(v => v.id !== 'records') }));
  const { preferences, setPreference } = usePreferences();
  const { prompt, confirm } = useDialogs();
  const toast = useToast();
  const file = useRef<HTMLInputElement>(null);
  const [menu, setMenu] = useState<{ kind: MenuKind; anchor: Anchor } | null>(null);
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [snapshotsOpen, setSnapshotsOpen] = useState(false);
  const csvFile = useRef<HTMLInputElement>(null);
  const [importing, setImporting] = useState<{ project: Project; issues: string[] } | null>(null);
  const [csv, setCsv] = useState<{ name: string; table: CsvTable } | null>(null);
  const uploadCsv = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (!f) return;
    const table = parseCsv(await f.text());
    if (!table.header.length || !table.rows.length) toast({ message: 'El archivo no tiene filas que importar.' });
    else setCsv({ name: f.name, table });
  };
  // El asistente de IA trabaja de momento sobre esquemas de base de datos.
  const toggleAi = () => setPreference('aiPanelOpen', !preferences.aiPanelOpen);
  const [kindOpen, setKindOpen] = useState(false);
  const [publishOpen, setPublishOpen] = useState(false);
  const [newProjectOpen, setNewProjectOpen] = useState(false);
  const { status: authStatus, signIn } = useAuth();
  const { groupOf, present, syncState, isShared } = useGroups();
  const group = groupOf(project.id);
  const [shareOpen, setShareOpen] = useState(false);
  const [groupOpen, setGroupOpen] = useState<{
    group: GroupInfo;
    mode: GroupDialogMode;
    justCreated?: boolean;
  } | null>(null);
  const openSharing = () => {
    if (group) setGroupOpen({ group, mode: 'manage' });
    else if (authStatus === 'signed-in') setShareOpen(true);
    else void signIn();
  };
  const closeMenu = useCallback(() => setMenu(null), []);
  const toggleMenu = (kind: MenuKind, target: HTMLElement) =>
    setMenu(menu?.kind === kind ? null : { kind, anchor: anchorOf(target) });
  const theme = THEME_CYCLE[preferences.theme];
  const {
    ref: barRef,
    density,
    overflowing,
  } = useTopbarDensity<HTMLElement>(DENSITY.tight, `${project.name}|${group?.id ?? ''}|${authStatus}`);

  // Paneles del grupo (chat y comentarios): botones propios en la barra o, sin sitio, en el menú del grupo.
  const groupPanels = (['chat', 'comentarios'] as const).map(tab => {
    const open = preferences.groupChatOpen && preferences.groupPanelTab === tab;
    return {
      tab,
      open,
      icon: tab === 'chat' ? MessagesSquare : MessageSquareText,
      label: tab === 'chat' ? 'Chat del grupo' : 'Comentarios y sugerencias',
      closeLabel: tab === 'chat' ? 'Cerrar el chat del grupo' : 'Cerrar los comentarios del proyecto',
      toggle: () => {
        setPreference('groupPanelTab', tab);
        setPreference('groupChatOpen', !open);
      },
    };
  });
  const groupRole = group ? (group.isOwner ? 'Propiedad' : roleLabel(group.role, project.kind, group.roleLabels)) : '';
  const groupEntries: MenuEntry[] = group
    ? [
        { section: `Grupo «${group.name}»` },
        ...(density >= DENSITY.groupMenu
          ? [
              ...groupPanels.map(panel => ({
                label: panel.label,
                icon: panel.icon,
                checked: panel.open,
                onSelect: panel.toggle,
              })),
              'separator' as const,
            ]
          : []),
        ...(canManageGroup(group)
          ? [{ label: 'Invitar personas…', icon: UserPlus, onSelect: () => setGroupOpen({ group, mode: 'invite' }) }]
          : []),
        {
          label: 'Gestionar el grupo…',
          hint: groupRole,
          icon: UserCog,
          onSelect: () => setGroupOpen({ group, mode: 'manage' }),
        },
      ]
    : [];
  const viewEntries = (kind: 'data' | 'schema'): MenuEntry[] => {
    const viewGroup = viewGroups.find(g => g.id === kind)!;
    return [
      { section: viewGroup.label },
      ...viewGroup.views.map(v => ({
        label: v.label,
        icon: v.icon,
        hint: `Alt+${v.key}`,
        checked: view === v.id,
        onSelect: () => onView(v.id),
      })),
    ];
  };
  const menuEntries = (kind: MenuKind) =>
    kind === 'projects'
      ? projectEntries
      : kind === 'settings'
        ? settingsEntries
        : kind === 'group'
          ? groupEntries
          : viewEntries(kind);

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
      setImporting({ project: imported, issues: parsed.issues });
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
    { label: 'Importar nodos desde CSV…', icon: Sheet, onSelect: () => csvFile.current?.click() },
    { label: 'Importar tablas (SQL o DDS)…', icon: Database, onSelect: openTablesImport },
    { label: 'Importar colecciones (JSON)…', icon: Database, onSelect: openDocumentImport },
    // Pasar tablas a documentos (documentConversion.ts), si hay tablas relacionales.
    ...(tableTypes(project, 'sqlserver').length || tableTypes(project, 'db2i').length
      ? [{ label: 'Pasar tablas a documentos…', icon: Database, onSelect: openDocumentConversion }]
      : []),
    ...(documentCollections(project).length
      ? [{ label: 'Pasar documentos a tablas…', icon: Database, onSelect: openTableConversion }]
      : []),
    { label: 'Copias de seguridad…', icon: History, onSelect: () => setSnapshotsOpen(true) },
  ];
  const engines = projectEngines(project);
  const fileBase = fileSafeName(project.name, 'proyecto');
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
    { label: 'Configuración del calendario…', icon: CalendarCog, onSelect: () => setCalendarOpen(true) },
    // Una copia de un proyecto público recuerda de dónde sale y deja abrir el original.
    ...(project.origin
      ? [
          {
            label: `Copia de «${project.origin.name}»`,
            hint: 'Ver el original',
            icon: ExternalLink,
            onSelect: () => window.open(`/p/${project.origin!.publicId}`, '_blank', 'noopener'),
          },
        ]
      : []),
    group
      ? {
          label: `Grupo «${group.name}»…`,
          hint: groupRole,
          icon: Users,
          onSelect: openSharing,
        }
      : {
          label: 'Compartir con un grupo…',
          hint: authStatus === 'signed-in' ? undefined : 'Entra con tu cuenta',
          icon: Users,
          onSelect: openSharing,
        },
    {
      label: 'Publicar…',
      hint: group
        ? group.isOwner
          ? 'Como propiedad del grupo'
          : 'Solo la propiedad del grupo'
        : authStatus === 'signed-in'
          ? 'Solo lectura, con enlace'
          : 'Entra con tu cuenta',
      icon: Globe,
      onSelect: () => setPublishOpen(true),
    },
    'separator',
    { label: 'Exportar JSON', icon: Download, onSelect: () => downloadProject(project) },
    {
      label: 'Exportar ZIP (notas Markdown, CSV e imágenes)',
      icon: FileArchive,
      onSelect: () => downloadBytes(`${fileBase}.zip`, exportZip(project)),
    },
    ...(tableTypes(project, 'db2i').length
      ? [
          {
            label: 'Exportar Db2 for i (IBM i)…',
            icon: Database,
            onSelect: openDb2Export,
          },
        ]
      : []),
    ...(tableTypes(project, 'sqlserver').length
      ? [
          {
            label: 'Exportar SQL Server (.sql)',
            icon: Database,
            onSelect: () => downloadText(`${fileBase}.sql`, sqlScript(project), 'application/sql'),
          },
        ]
      : []),
    // Bases no relacionales (ROADMAP_NOSQL.md): cada exportación, si el proyecto usa ese motor.
    ...(engines.has('mongodb')
      ? [
          {
            label: 'Exportar MongoDB (.js para mongosh)',
            icon: Database,
            onSelect: () => downloadText(`${fileBase}.mongodb.js`, mongoScript(project), 'text/javascript'),
          },
        ]
      : []),
    ...(engines.has('firestore')
      ? [
          {
            label: 'Exportar reglas de Firestore',
            icon: Database,
            onSelect: () => downloadText('firestore.rules', firestoreRules(project), 'text/plain'),
          },
        ]
      : []),
    ...(engines.has('neo4j')
      ? [
          {
            label: 'Exportar esquema de Neo4j (.cypher)',
            icon: Database,
            onSelect: () => downloadText(`${fileBase}.esquema.cypher`, neo4jSchema(project), 'text/plain'),
          },
        ]
      : []),
    {
      label: 'Exportar el grafo a Neo4j (.cypher)',
      icon: Share2,
      onSelect: () => downloadText(`${fileBase}.grafo.cypher`, projectCypher(project), 'text/plain'),
    },
    'separator',
    { label: 'Eliminar proyecto', icon: Trash2, danger: true, onSelect: remove },
  ];

  return (
    <header
      ref={barRef}
      className={`topbar ${overflowing ? 'overflowing' : ''} ${density >= DENSITY.tight ? 'tight' : ''}`}
    >
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
            aria-haspopup="menu"
            aria-expanded={menu?.kind === 'group'}
            title={`Proyecto del grupo «${group.name}». Tu rol: ${groupRole.toLowerCase()}.${
              present.length
                ? ` ${present.length === 1 ? 'Otra persona lo tiene' : `${present.length} personas más lo tienen`} abierto ahora.`
                : ''
            }`}
            onClick={event => toggleMenu('group', event.currentTarget)}
          >
            <Users size={13} aria-hidden />
            {density < DENSITY.tight && <span className="label">{groupRole}</span>}
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
            <ChevronDown size={12} className="menu-caret" aria-hidden />
          </button>
        )}
        {group &&
          density < DENSITY.groupMenu &&
          groupPanels.map(panel => (
            <IconButton
              key={panel.tab}
              icon={panel.icon}
              label={panel.open ? panel.closeLabel : panel.label}
              active={panel.open}
              aria-pressed={panel.open}
              onClick={panel.toggle}
            />
          ))}
      </div>
      {menu && (
        <Menu
          anchor={menu.anchor}
          entries={menuEntries(menu.kind)}
          onClose={closeMenu}
          label={MENU_LABELS[menu.kind]}
        />
      )}
      {calendarOpen && <CalendarDialog onClose={() => setCalendarOpen(false)} />}
      {snapshotsOpen && <SnapshotsDialog onClose={() => setSnapshotsOpen(false)} />}
      {importing && (
        <ImportProjectDialog
          imported={importing.project}
          issues={importing.issues}
          onClose={() => setImporting(null)}
        />
      )}
      {csv && <CsvImportDialog fileName={csv.name} table={csv.table} onClose={() => setCsv(null)} />}
      {kindOpen && <ProjectKindDialog onClose={() => setKindOpen(false)} />}
      {publishOpen && <PublishDialog onClose={() => setPublishOpen(false)} />}
      <span className="divider hide-narrow" aria-hidden />
      {density >= DENSITY.viewMenus ? (
        // Sin sitio, cada grupo de vistas es un menú que enseña la vista abierta.
        <nav className="segmented views-nav views-menus" aria-label="Vistas" data-tour="views">
          {viewGroups.map(viewGroup => {
            const current = viewGroup.views.find(v => v.id === view);
            const Icon = current?.icon ?? viewGroup.icon;
            const text = current ? current.label : viewGroup.label;
            return (
              <button
                key={viewGroup.id}
                type="button"
                aria-haspopup="menu"
                aria-expanded={menu?.kind === viewGroup.id}
                aria-pressed={Boolean(current)}
                aria-label={`${viewGroup.label}: ${current ? current.label : 'elegir vista'}`}
                data-tooltip={density >= DENSITY.tight ? `${viewGroup.label}: ${text}` : undefined}
                onClick={event => toggleMenu(viewGroup.id, event.currentTarget)}
              >
                <Icon size={15} aria-hidden />
                {density < DENSITY.tight && <span className="label">{text}</span>}
                <ChevronDown size={12} className="menu-caret" aria-hidden />
              </button>
            );
          })}
        </nav>
      ) : (
        <nav
          className={`segmented labeled views-nav ${density >= DENSITY.viewGroupLabels ? 'no-group-labels' : ''} ${
            density >= DENSITY.viewIcons ? 'icon-only' : ''
          }`}
          aria-label="Vistas"
          data-tour="views"
        >
          {viewGroups.map((viewGroup, index) => (
            <Fragment key={viewGroup.id}>
              {index > 0 && <span className="views-divider" aria-hidden />}
              <span className="segmented-label" title={viewGroup.title}>
                {viewGroup.label}
              </span>
              {viewGroup.views.map(v => (
                <button
                  key={v.id}
                  type="button"
                  aria-pressed={view === v.id}
                  aria-label={density >= DENSITY.viewIcons ? v.label : undefined}
                  data-tooltip={density >= DENSITY.viewIcons ? `${v.label} (Alt+${v.key})` : undefined}
                  onClick={() => onView(v.id)}
                >
                  <v.icon size={15} aria-hidden />
                  <span className="label">{v.label}</span>
                </button>
              ))}
            </Fragment>
          ))}
        </nav>
      )}
      <CommunityButton compact={density >= DENSITY.viewIcons} />
      <div className="spacer" />
      {density >= DENSITY.searchIcon ? (
        <IconButton icon={Search} label="Buscar (Ctrl+K)" className="hide-narrow" onClick={onSearch} />
      ) : (
        <button type="button" className="search-button hide-narrow" onClick={onSearch}>
          <Search size={14} aria-hidden />
          <span>Buscar…</span>
          <kbd>Ctrl K</kbd>
        </button>
      )}
      <div className="topbar-actions">
        <IconButton icon={Undo2} label="Deshacer (Ctrl+Z)" disabled={!canUndo} onClick={undo} />
        <IconButton icon={Redo2} label="Rehacer (Ctrl+Shift+Z)" disabled={!canRedo} onClick={redo} />
        <IconButton
          icon={Sparkles}
          label={preferences.aiPanelOpen ? 'Cerrar el asistente de IA' : 'Asistente de IA'}
          active={preferences.aiPanelOpen}
          aria-pressed={preferences.aiPanelOpen}
          onClick={toggleAi}
        />
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
        <EcosystemWebs />
        <AccountButton />
      </div>
      <input ref={file} hidden type="file" accept="application/json,.json" onChange={upload} />
      <input ref={csvFile} hidden type="file" accept="text/csv,.csv,text/plain,.txt" onChange={uploadCsv} />
      {newProjectOpen && <NewProjectDialog onClose={() => setNewProjectOpen(false)} />}
      {shareOpen && (
        <ShareDialog
          onClose={() => setShareOpen(false)}
          onShared={created => {
            setShareOpen(false);
            // Al crear el grupo solo se invita; el resto se gestiona después desde su menú.
            setGroupOpen({ group: created, mode: 'invite', justCreated: true });
          }}
        />
      )}
      {groupOpen && (
        <GroupDialog
          group={groupOf(project.id) ?? groupOpen.group}
          mode={groupOpen.mode}
          justCreated={groupOpen.justCreated}
          onClose={() => setGroupOpen(null)}
        />
      )}
    </header>
  );
}
