import { useCallback, useEffect, useState } from 'react';
import { isTypingTarget } from './components/common/keyboard';
import { CommandPalette } from './components/layout/CommandPalette';
import { RepairNotice } from './components/layout/RepairNotice';
import { ShortcutsHelp } from './components/layout/ShortcutsHelp';
import { Topbar } from './components/layout/Topbar';
import { MapView } from './components/map/MapView';
import { SchemaView } from './components/schema/SchemaView';
import { useApp } from './state/AppContext';
import { useNavigation, type View } from './state/navigation';

export default function App() {
  const { view, setView, paletteOpen, setPaletteOpen, back, forward } = useNavigation();
  const [help, setHelp] = useState(false);
  const openHelp = useCallback(() => setHelp(true), []);
  const openPalette = useCallback(() => setPaletteOpen(true), [setPaletteOpen]);
  useGlobalShortcuts(setView, openHelp, openPalette, back, forward);
  return (
    <div className="app">
      <Topbar view={view} onView={setView} onHelp={openHelp} onSearch={openPalette} />
      {view === 'map' ? <MapView /> : <SchemaView />}
      <RepairNotice />
      {help && <ShortcutsHelp onClose={() => setHelp(false)} />}
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
      else if (event.altKey && !mod && (event.code === 'Digit1' || event.code === 'Digit2'))
        setView(event.code === 'Digit1' ? 'map' : 'schema');
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
