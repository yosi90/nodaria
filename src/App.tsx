import { useCallback, useEffect } from 'react';
import { isTypingTarget } from './components/common/keyboard';
import { CommandPalette } from './components/layout/CommandPalette';
import { RepairNotice } from './components/layout/RepairNotice';
import { HelpDialog } from './components/layout/HelpDialog';
import { Topbar } from './components/layout/Topbar';
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
  } = useNavigation();
  const openHelp = useCallback(() => openHelpTopic('shortcuts'), [openHelpTopic]);
  const openPalette = useCallback(() => setPaletteOpen(true), [setPaletteOpen]);
  useGlobalShortcuts(setView, openHelp, openPalette, back, forward);
  return (
    <div className="app">
      <Topbar view={view} onView={setView} onHelp={openHelp} onSearch={openPalette} />
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
      <RepairNotice />
      {help && <HelpDialog topic={help} onTopic={openHelpTopic} onClose={closeHelp} />}
      {paletteOpen && <CommandPalette onClose={() => setPaletteOpen(false)} />}
    </div>
  );
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
