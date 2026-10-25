import { Fragment, useCallback, useEffect, useState } from 'react';
import { isTypingTarget } from './components/common/keyboard';
import { CommandPalette } from './components/layout/CommandPalette';
import { RepairNotice } from './components/layout/RepairNotice';
import { StorageNotice } from './components/layout/StorageNotice';
import { HelpDialog } from './components/layout/HelpDialog';
import { Topbar } from './components/layout/Topbar';
import { TemplatesDialog } from './components/onboarding/TemplatesDialog';
import { Tour } from './components/onboarding/Tour';
import { WelcomeDialog } from './components/onboarding/WelcomeDialog';
import { isBlankProject } from './services/sync';
import { usePreferences } from './state/preferences';
import { MapView } from './components/map/MapView';
import { PropertiesView } from './components/schema/PropertiesView';
import { HealthView } from './components/health/HealthView';
import { TimelineView } from './components/timeline/TimelineView';
import { CalendarView } from './components/calendar/CalendarView';
import { RecordsView } from './components/records/RecordsView';
import { TableView } from './components/table/TableView';
import { SchemaView } from './components/schema/SchemaView';
import { ContextMenu } from './components/layout/ContextMenu';
import { AiPanel } from './components/ai/AiPanel';
import { GroupPanel } from './components/groups/GroupPanel';
import { FloatingChat } from './components/community/FloatingChat';
import { CommunityView } from './components/community/CommunityView';
import { useCommunityHash } from './components/community/communityHash';
import { PublicCopy } from './components/community/PublicCopy';
import { Db2ExportDialog } from './components/layout/Db2ExportDialog';
import { TablesImportDialog } from './components/layout/TablesImportDialog';
import { DocumentConversionDialog } from './components/layout/DocumentConversionDialog';
import { TableConversionDialog } from './components/layout/TableConversionDialog';
import { DocumentImportDialog } from './components/layout/DocumentImportDialog';
import {
  OPEN_DB2_EXPORT_EVENT,
  OPEN_DOCUMENT_CONVERSION_EVENT,
  OPEN_DOCUMENT_IMPORT_EVENT,
  OPEN_TABLE_CONVERSION_EVENT,
  OPEN_TABLES_IMPORT_EVENT,
} from './components/layout/openDialogs';
import { DialogHost } from './components/common/DialogHost';
import { useGroups } from './state/groups';
import { useApp } from './state/AppContext';
import { useAuth } from './state/auth';
import { useNavigation, type View } from './state/navigation';

export default function App() {
  const {
    view,
    setView,
    paletteOpen,
    setPaletteOpen,
    back,
    forward,
    help,
    openHelp: openHelpTopic,
    closeHelp,
    clearSelection,
  } = useNavigation();
  const { project } = useApp();
  // Lo que se pinta con datos de la cuenta se monta de nuevo con cada cuenta (CAMBIO_DE_CUENTA.md).
  const { user } = useAuth();
  const account = user?.id ?? 'local';
  // Al cambiar de proyecto, la selección (y su historial) pertenecen al anterior.
  useEffect(() => clearSelection(), [project.id, clearSelection]);
  const openHelp = useCallback(() => openHelpTopic('start'), [openHelpTopic]);
  const openPalette = useCallback(() => setPaletteOpen(true), [setPaletteOpen]);
  useGlobalShortcuts(setView, openHelp, openPalette, back, forward);
  const [templatesOpen, setTemplatesOpen] = useState(false);
  const openTemplates = useCallback(() => setTemplatesOpen(true), []);
  const closeTemplates = useCallback(() => setTemplatesOpen(false), []);
  const welcome = useWelcome();
  const { preferences, setPreference } = usePreferences();
  const aiOpen = preferences.aiPanelOpen;
  // El chat del grupo solo con un proyecto compartido abierto.
  const { groupOf } = useGroups();
  const group = groupOf(project.id);
  // En «Comunidad» no van los paneles del proyecto (el asistente y el chat del grupo).
  const inCommunity = view === 'community';
  const chatOpen = preferences.groupChatOpen && group !== null && !inCommunity;
  const assistantOpen = aiOpen && !inCommunity;
  const columns = [
    'minmax(0, 1fr)',
    ...(assistantOpen ? [`${preferences.aiPanelWidth}px`] : []),
    ...(chatOpen ? [`${preferences.groupChatWidth}px`] : []),
  ];
  useCommunityHash();
  return (
    <div className="app">
      <Topbar view={view} onView={setView} onHelp={openHelp} onSearch={openPalette} onTemplates={openTemplates} />
      <div className="app-body" style={{ gridTemplateColumns: columns.join(' ') }}>
        {/* Cada vista guarda estado local (tipo elegido, filtros, plegados) que solo vale para un proyecto. */}
        {/* La comunidad es de la cuenta, no del proyecto: se monta de nuevo con cada cuenta (CAMBIO_DE_CUENTA.md). */}
        {inCommunity ? (
          <CommunityView key={`community:${account}`} />
        ) : (
          <Fragment key={`${account}:${project.id}`}>
            {view === 'map' ? (
              <MapView />
            ) : view === 'table' ? (
              <TableView />
            ) : view === 'schema' ? (
              <SchemaView kind="entity" />
            ) : view === 'relations' ? (
              <SchemaView kind="relationship" />
            ) : view === 'health' ? (
              <HealthView />
            ) : view === 'timeline' ? (
              <TimelineView />
            ) : view === 'calendar' ? (
              <CalendarView />
            ) : view === 'records' ? (
              <RecordsView />
            ) : (
              <PropertiesView />
            )}
          </Fragment>
        )}
        {/* El asistente queda al lado de la vista para poder seguir trabajando; su conversación es del proyecto. */}
        {assistantOpen && (
          <AiPanel key={`ai:${account}:${project.id}`} onClose={() => setPreference('aiPanelOpen', false)} />
        )}
        {chatOpen && group && (
          <GroupPanel
            key={`group:${account}:${group.id}`}
            group={group}
            onClose={() => setPreference('groupChatOpen', false)}
          />
        )}
      </div>
      <div className="notice-stack">
        <StorageNotice />
        <RepairNotice />
      </div>
      {help && <HelpDialog topic={help} onTopic={openHelpTopic} onClose={closeHelp} onTemplates={openTemplates} />}
      {templatesOpen && <TemplatesDialog onClose={closeTemplates} />}
      {welcome.open && <WelcomeDialog onClose={welcome.dismiss} onTemplates={openTemplates} />}
      <Tour />
      <ContextMenu />
      <PublicCopy />
      {/* La ventana de chats es de la cuenta: se monta de nuevo con cada cuenta (CAMBIO_DE_CUENTA.md). */}
      {preferences.floatingChat && <FloatingChat key={`chat:${account}`} />}
      <DialogHost event={OPEN_DB2_EXPORT_EVENT} dialog={Db2ExportDialog} />
      <DialogHost event={OPEN_TABLES_IMPORT_EVENT} dialog={TablesImportDialog} />
      <DialogHost event={OPEN_DOCUMENT_CONVERSION_EVENT} dialog={DocumentConversionDialog} />
      <DialogHost event={OPEN_TABLE_CONVERSION_EVENT} dialog={TableConversionDialog} />
      <DialogHost event={OPEN_DOCUMENT_IMPORT_EVENT} dialog={DocumentImportDialog} />
      {paletteOpen && <CommandPalette onClose={() => setPaletteOpen(false)} />}
    </div>
  );
}

/**
 * La bienvenida se muestra una sola vez y solo si todavía no hay datos (un único proyecto en blanco).
 * Quien ya tenía proyectos al llegar esta versión no la ve: se marca como vista en silencio.
 */
function useWelcome() {
  const { state } = useApp();
  const { preferences, setPreference } = usePreferences();
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (preferences.welcomed) return;
    const pristine = state.projects.length === 1 && isBlankProject(state.projects[0]);
    if (pristine) setOpen(true);
    else setPreference('welcomed', true);
    // Solo se evalúa al arrancar.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const dismiss = useCallback(() => {
    setOpen(false);
    setPreference('welcomed', true);
  }, [setPreference]);
  return { open, dismiss };
}

function useGlobalShortcuts(
  setView: (view: View) => void,
  openHelp: () => void,
  openPalette: () => void,
  back: () => void,
  forward: () => void,
) {
  const { undo, redo } = useApp();
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const mod = event.ctrlKey || event.metaKey;
      const key = event.key.toLowerCase();
      // Ctrl+K abre el buscador incluso desde un campo de texto.
      if (mod && !event.altKey && key === 'k') {
        event.preventDefault();
        openPalette();
        return;
      }
      if (event.defaultPrevented || isTypingTarget(event.target)) return;
      if (mod && !event.altKey && key === 'z' && !event.shiftKey) undo();
      else if (mod && !event.altKey && ((key === 'z' && event.shiftKey) || key === 'y')) redo();
      else if (
        event.altKey &&
        !mod &&
        ['Digit1', 'Digit2', 'Digit3', 'Digit4', 'Digit5', 'Digit6', 'Digit7', 'Digit8', 'Digit9'].includes(event.code)
      )
        setView(
          (['map', 'table', 'health', 'schema', 'relations', 'properties', 'timeline', 'calendar', 'records'] as const)[
            Number(event.code.slice(-1)) - 1
          ],
        );
      else if (event.altKey && !mod && event.key === 'ArrowLeft') back();
      else if (event.altKey && !mod && event.key === 'ArrowRight') forward();
      else if (event.key === '?' && !mod) openHelp();
      else return;
      event.preventDefault();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [undo, redo, setView, openHelp, openPalette, back, forward]);
}
