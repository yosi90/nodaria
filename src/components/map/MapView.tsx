import { PanelLeftOpen } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { uid } from '../../domain/factories';
import { cardinalityWarning } from '../../domain/cardinality';
import { compatibleRelationTypes, getNode, nodeLabel } from '../../domain/selectors';
import { creatableTypesIn } from '../../domain/structure';
import type { Position, Selection } from '../../domain/types';
import { useApp } from '../../state/AppContext';
import { useNavigation } from '../../state/navigation';
import { usePreferences } from '../../state/preferences';
import type { Anchor } from '../common/anchor';
import { IconButton } from '../common/Button';
import { isTypingTarget } from '../common/keyboard';
import { Splitter } from '../common/Splitter';
import { useToast } from '../common/toasts';
import { FlowCanvas } from './FlowCanvas';
import { Inspector } from './Inspector';
import { NodeTypeMenu } from './NodeTypeMenu';
import { RelationTypeMenu } from './RelationTypeMenu';
import { TreePanel } from './TreePanel';
import { useDeleteSelection } from './useDeleteSelection';

const RAIL_WIDTH = 44;

interface AddNodeMenu {
  parentId: string | null;
  anchor: Anchor;
  /** Posición del lienzo en la que se creó (doble clic); si falta, la coloca la disposición automática. */
  position?: Position;
}

interface ConnectMenu {
  sourceId: string;
  targetId: string;
  anchor: Anchor;
}

export function MapView() {
  const { project, dispatch } = useApp();
  const { preferences, setPreference } = usePreferences();
  const toast = useToast();
  const { selection, select, revealKey } = useNavigation();
  const setSelection = useCallback((s: Selection) => select(s), [select]);
  const selectAndReveal = useCallback((s: Selection) => select(s, { reveal: true }), [select]);
  const [addNodeMenu, setAddNodeMenu] = useState<AddNodeMenu | null>(null);
  const [connectMenu, setConnectMenu] = useState<ConnectMenu | null>(null);
  const [createdId, setCreatedId] = useState<string | null>(null);
  const closeAddNodeMenu = useCallback(() => setAddNodeMenu(null), []);
  const closeConnectMenu = useCallback(() => setConnectMenu(null), []);
  const deleteSelection = useDeleteSelection();
  const structureId = project.view.structureId;

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
  }, [activeSelection, deleteSelection, setSelection]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (isTypingTarget(event.target)) return;
      if (
        (event.ctrlKey || event.metaKey) &&
        !event.altKey &&
        event.key.toLowerCase() === 'd' &&
        activeSelection?.kind === 'node'
      ) {
        event.preventDefault();
        const newId = uid('node');
        dispatch({ type: 'duplicate-node', id: activeSelection.id, newId });
        selectAndReveal({ kind: 'node', id: newId });
        return;
      }
      if (event.ctrlKey || event.metaKey || event.altKey) return;
      // Teclear con un nodo seleccionado escribe directamente en su título (aunque el lienzo haya
      // tratado la tecla: React Flow usa espacio e Intro sobre el nodo enfocado).
      if (activeSelection?.kind === 'node' && event.key.length === 1 && event.key !== '[' && event.key !== '?') {
        const title = document.querySelector<HTMLInputElement>('.side-panel.right [data-title-field]');
        if (title) {
          event.preventDefault();
          title.focus();
          title.setSelectionRange(title.value.length, title.value.length);
          // Insertar la tecla pulsada como si se hubiera escrito en el campo (dispara onChange).
          document.execCommand('insertText', false, event.key);
        }
        return;
      }
      if (event.defaultPrevented) return;
      if (event.key === '[') toggleTree();
      else if (event.key === 'Escape' && activeSelection) setSelection(null);
      else if ((event.key === 'Delete' || event.key === 'Supr') && activeSelection) void removeSelected();
      else return;
      event.preventDefault();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [activeSelection, removeSelected, toggleTree, setSelection, dispatch, selectAndReveal]);

  const createNode = (typeId: string) => {
    if (!addNodeMenu) return;
    const id = uid('node');
    dispatch({
      type: 'add-node',
      typeId,
      parentId: addNodeMenu.parentId,
      structureId,
      position: addNodeMenu.position ?? null,
      id,
    });
    setAddNodeMenu(null);
    selectAndReveal({ kind: 'node', id });
    setCreatedId(id);
  };

  const onConnectNodes = useCallback(
    (sourceId: string, targetId: string, anchor: Anchor) => {
      if (!compatibleRelationTypes(project, sourceId, targetId).length) {
        toast({ message: 'Ningún tipo de relación admite estos dos nodos. Revisa «Desde» y «Hacia» en el tipo.' });
        return;
      }
      setConnectMenu({ sourceId, targetId, anchor });
    },
    [project, toast],
  );

  const createRelation = (typeId: string) => {
    if (!connectMenu) return;
    const warning = cardinalityWarning(project, typeId, connectMenu.sourceId, connectMenu.targetId);
    dispatch({ type: 'add-relation', typeId, sourceId: connectMenu.sourceId, targetId: connectMenu.targetId });
    if (warning) toast({ message: `Límite superado: ${warning}` });
    setConnectMenu(null);
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
            onSelect={selectAndReveal}
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
      <FlowCanvas
        selection={activeSelection}
        onSelect={setSelection}
        revealKey={revealKey}
        onAddNode={(anchor, position) => setAddNodeMenu({ parentId: null, anchor, position })}
        onConnectNodes={onConnectNodes}
      />
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
            focusTitle={createdId === activeSelection.id}
            onClose={() => setSelection(null)}
            onAddChild={(parentId, anchor) => setAddNodeMenu({ parentId, anchor })}
            onDelete={removeSelected}
          />
        </aside>
      )}
      {addNodeMenu && (
        <NodeTypeMenu
          anchor={addNodeMenu.anchor}
          schemas={creatableTypesIn(project, structureId, addNodeMenu.parentId)}
          parentLabel={menuParent ? nodeLabel(project, menuParent) : undefined}
          onSelect={createNode}
          onClose={closeAddNodeMenu}
        />
      )}
      {connectMenu && (
        <RelationTypeMenu
          project={project}
          sourceId={connectMenu.sourceId}
          targetId={connectMenu.targetId}
          anchor={connectMenu.anchor}
          onSelect={createRelation}
          onClose={closeConnectMenu}
        />
      )}
    </main>
  );
}
