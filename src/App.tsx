import { Fragment, useCallback, useEffect, useState } from 'react';
import { isTypingTarget } from './components/common/keyboard';
import { CommandPalette } from './components/layout/CommandPalette';
import { RepairNotice } from './components/layout/RepairNotice';
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
import { TableView } from './components/table/TableView';
import { SchemaView } from './components/schema/SchemaView';
import { useApp } from './state/AppContext';
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
  // Al cambiar de proyecto, la selección (y su historial) pertenecen al anterior.
  useEffect(() => clearSelection(), [project.id, clearSelection]);
  const openHelp = useCallback(() => openHelpTopic('start'), [openHelpTopic]);
  const openPalette = useCallback(() => setPaletteOpen(true), [setPaletteOpen]);
  useGlobalShortcuts(setView, openHelp, openPalette, back, forward);
  const [templatesOpen, setTemplatesOpen] = useState(false);
  const openTemplates = useCallback(() => setTemplatesOpen(true), []);
  const closeTemplates = useCallback(() => setTemplatesOpen(false), []);
  const welcome = useWelcome();
  return (
    <div className="app">
      <Topbar view={view} onView={setView} onHelp={openHelp} onSearch={openPalette} onTemplates={openTemplates} />
      {/* Cada vista guarda estado local (tipo elegido, filtros, plegados) que solo vale para un proyecto. */}
      <Fragment key={project.id}>
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
        ) : (
          <PropertiesView />
        )}
      </Fragment>
      <RepairNotice />
      {help && <HelpDialog topic={help} onTopic={openHelpTopic} onClose={closeHelp} onTemplates={openTemplates} />}
      {templatesOpen && <TemplatesDialog onClose={closeTemplates} />}
      {welcome.open && <WelcomeDialog onClose={welcome.dismiss} onTemplates={openTemplates} />}
      <Tour />
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
        ['Digit1', 'Digit2', 'Digit3', 'Digit4', 'Digit5', 'Digit6'].includes(event.code)
      )
        setView(
          (['map', 'table', 'health', 'schema', 'relations', 'properties'] as const)[Number(event.code.slice(-1)) - 1],
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
