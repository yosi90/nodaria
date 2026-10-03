import { useCallback, useEffect, useState } from 'react';
import { isTypingTarget } from './components/common/keyboard';
import { RepairNotice } from './components/layout/RepairNotice';
import { ShortcutsHelp } from './components/layout/ShortcutsHelp';
import { Topbar, type View } from './components/layout/Topbar';
import { MapView } from './components/map/MapView';
import { SchemaView } from './components/schema/SchemaView';
import { useApp } from './state/AppContext';

export default function App() {
  const [view, setView] = useState<View>('map');
  const [help, setHelp] = useState(false);
  const openHelp = useCallback(() => setHelp(true), []);
  useGlobalShortcuts(setView, openHelp);
  return (
    <div className="app">
      <Topbar view={view} onView={setView} onHelp={openHelp} />
      {view === 'map' ? <MapView /> : <SchemaView />}
      <RepairNotice />
      {help && <ShortcutsHelp onClose={() => setHelp(false)} />}
    </div>
  );
}

function useGlobalShortcuts(setView: (view: View) => void, openHelp: () => void) {
  const { undo, redo } = useApp();
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || isTypingTarget(event.target)) return;
      const key = event.key.toLowerCase();
      const mod = event.ctrlKey || event.metaKey;
      if (mod && !event.altKey && key === 'z' && !event.shiftKey) undo();
      else if (mod && !event.altKey && ((key === 'z' && event.shiftKey) || key === 'y')) redo();
      else if (event.altKey && !mod && (event.code === 'Digit1' || event.code === 'Digit2'))
        setView(event.code === 'Digit1' ? 'map' : 'schema');
      else if (event.key === '?' && !mod) openHelp();
      else return;
      event.preventDefault();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [undo, redo, setView, openHelp]);
}
