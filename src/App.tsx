import { useEffect, useState } from 'react';
import { RepairNotice } from './components/layout/RepairNotice';
import { Topbar } from './components/layout/Topbar';
import { MapView } from './components/map/MapView';
import { SchemaView } from './components/schema/SchemaView';
import { useApp } from './state/AppContext';

export default function App() {
  const [view, setView] = useState<'map' | 'schema'>('map');
  useUndoShortcuts();
  return (
    <div className="app">
      <Topbar view={view} onView={setView} />
      {view === 'map' ? <MapView /> : <SchemaView />}
      <RepairNotice />
    </div>
  );
}

/** Ctrl+Z / Ctrl+Shift+Z / Ctrl+Y fuera de campos de texto, que conservan su deshacer nativo. */
function useUndoShortcuts() {
  const { undo, redo } = useApp();
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey) || event.altKey) return;
      const target = event.target as HTMLElement | null;
      if (target?.closest('input, textarea, select, [contenteditable="true"]')) return;
      const key = event.key.toLowerCase();
      if (key === 'z' && !event.shiftKey) undo();
      else if ((key === 'z' && event.shiftKey) || key === 'y') redo();
      else return;
      event.preventDefault();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [undo, redo]);
}
