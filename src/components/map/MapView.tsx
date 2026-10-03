import { useCallback, useState } from 'react';
import { creatableTypes } from '../../domain/selectors';
import type { Schema, Selection } from '../../domain/types';
import { useApp } from '../../state/AppContext';
import { GraphCanvas } from './GraphCanvas';
import { CreateRelationModal } from './CreateRelationModal';
import { Inspector } from './Inspector';
import { NodeTypeMenu } from './NodeTypeMenu';
import { TreePanel } from './TreePanel';

interface AddNodeMenu {
  parentId: string | null;
  anchor: { x: number; y: number };
  schemas: Schema[];
}

export function MapView() {
  const { project, dispatch } = useApp();
  const [selection, setSelection] = useState<Selection>(null);
  const [addNodeMenu, setAddNodeMenu] = useState<AddNodeMenu | null>(null);
  const [relationSourceId, setRelationSourceId] = useState<string | null>(null);
  const closeAddNodeMenu = useCallback(() => setAddNodeMenu(null), []);

  const openAddNodeMenu = (parentId: string | null, anchor: { x: number; y: number }) => {
    setAddNodeMenu({ parentId, anchor, schemas: creatableTypes(project, parentId) });
  };

  const createNode = (typeId: string) => {
    if (!addNodeMenu) return;
    dispatch({ type: 'add-node', typeId, parentId: addNodeMenu.parentId });
    setAddNodeMenu(null);
  };

  return (
    <main className="map-layout">
      <TreePanel selection={selection} onSelect={setSelection} onAdd={openAddNodeMenu} />
      <GraphCanvas selection={selection} onSelect={setSelection} />
      <Inspector
        key={selection ? `${selection.kind}-${selection.id}` : 'empty'}
        selection={selection}
        onClose={() => setSelection(null)}
        onRelation={setRelationSourceId}
      />
      {addNodeMenu && (
        <NodeTypeMenu
          anchor={addNodeMenu.anchor}
          schemas={addNodeMenu.schemas}
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
