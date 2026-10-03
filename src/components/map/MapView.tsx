import { PanelLeftOpen } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { uid } from '../../domain/factories';
import { creatableTypes, getNode, nodeLabel } from '../../domain/selectors';
import type { Selection } from '../../domain/types';
import { useApp } from '../../state/AppContext';
import { usePreferences } from '../../state/preferences';
import { IconButton } from '../common/Button';
import { isTypingTarget } from '../common/keyboard';
import type { Anchor } from '../common/anchor';
import { Splitter } from '../common/Splitter';
import { CreateRelationModal } from './CreateRelationModal';
import { GraphCanvas } from './GraphCanvas';
import { Inspector } from './Inspector';
import { NodeTypeMenu } from './NodeTypeMenu';
import { TreePanel } from './TreePanel';
import { useDeleteSelection } from './useDeleteSelection';

const RAIL_WIDTH = 44;

export function MapView() {
  const { project, dispatch } = useApp();
  const { preferences, setPreference } = usePreferences();
  const [selection, setSelection] = useState<Selection>(null);
  const [addNodeMenu, setAddNodeMenu] = useState<{ parentId: string | null; anchor: Anchor } | null>(null);
  const [relationSourceId, setRelationSourceId] = useState<string | null>(null);
  const closeAddNodeMenu = useCallback(() => setAddNodeMenu(null), []);
  const deleteSelection = useDeleteSelection();

  // La selección puede quedar huérfana tras deshacer o borrar desde otro sitio.
  const selectionExists =
    selection?.kind === 'node'
      ? Boolean(getNode(project, selection.id))
      : selection?.kind === 'relation' && project.relations.some(r => r.id === selection.id);
  const activeSelection = selectionExists ? selection : null;
  const treeCollapsed = preferences.treeCollapsed;
  const toggleTree = useCallback(() => setPreference('treeCollapsed', !treeCollapsed), [setPreference, treeCollapsed]);

  const removeSelected = useCallback(async () => {
    if (await deleteSelection(activeSelection)) setSelection(null);
  }, [activeSelection, deleteSelection]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || isTypingTarget(event.target) || event.ctrlKey || event.metaKey || event.altKey)
        return;
      if (event.key === '[') toggleTree();
      else if (event.key === 'Escape' && activeSelection) setSelection(null);
      else if ((event.key === 'Delete' || event.key === 'Supr') && activeSelection) void removeSelected();
      else return;
      event.preventDefault();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [activeSelection, removeSelected, toggleTree]);

  const createNode = (typeId: string) => {
    if (!addNodeMenu) return;
    const id = uid('node');
    dispatch({ type: 'add-node', typeId, parentId: addNodeMenu.parentId, id });
    setAddNodeMenu(null);
    setSelection({ kind: 'node', id });
  };

  const columns = [
    treeCollapsed ? `${RAIL_WIDTH}px` : `${preferences.treeWidth}px`,
    'minmax(0, 1fr)',
    activeSelection ? `${preferences.inspectorWidth}px` : null,
  ].filter(Boolean);
  const menuParent = addNodeMenu?.parentId ? getNode(project, addNodeMenu.parentId) : undefined;

  return (
    <main className="map-layout" style={{ gridTemplateColumns: columns.join(' ') }}>
      {treeCollapsed ? (
        <div className="panel-rail">
          <IconButton icon={PanelLeftOpen} label="Mostrar estructura ([)" onClick={toggleTree} />
        </div>
      ) : (
        <aside className="side-panel left" aria-label="Estructura">
          <TreePanel
            selection={activeSelection}
            onSelect={setSelection}
            onAdd={(parentId, anchor) => setAddNodeMenu({ parentId, anchor })}
            onCollapse={toggleTree}
          />
          <Splitter
            width={preferences.treeWidth}
            grow="right"
            label="Redimensionar panel de estructura"
            onChange={width => setPreference('treeWidth', width)}
          />
        </aside>
      )}
      <GraphCanvas selection={activeSelection} onSelect={setSelection} />
      {activeSelection && (
        <aside className="side-panel right" aria-label="Inspector">
          <Splitter
            width={preferences.inspectorWidth}
            grow="left"
            label="Redimensionar inspector"
            onChange={width => setPreference('inspectorWidth', width)}
          />
          <Inspector
            key={`${activeSelection.kind}-${activeSelection.id}`}
            selection={activeSelection}
            onClose={() => setSelection(null)}
            onRelation={setRelationSourceId}
            onAddChild={(parentId, anchor) => setAddNodeMenu({ parentId, anchor })}
            onDelete={removeSelected}
          />
        </aside>
      )}
      {addNodeMenu && (
        <NodeTypeMenu
          anchor={addNodeMenu.anchor}
          schemas={creatableTypes(project, addNodeMenu.parentId)}
          parentLabel={menuParent ? nodeLabel(project, menuParent) : undefined}
          onSelect={createNode}
          onClose={closeAddNodeMenu}
        />
      )}
      {relationSourceId && (
        <CreateRelationModal initialSourceId={relationSourceId} onClose={() => setRelationSourceId(null)} />
      )}
    </main>
  );
}
