import {
  ChevronDown,
  ChevronRight,
  Folder,
  FolderOpen,
  FolderPlus,
  PanelLeftClose,
  Pencil,
  Plus,
  Search,
  Trash2,
} from 'lucide-react';
import { Fragment, useEffect, useId, useMemo, useRef, useState, type DragEvent, type KeyboardEvent } from 'react';
import { folderMembers, folderOf, looseRoots, type Folder as TreeFolder } from '../../domain/folders';
import { useDialogs } from '../common/dialogs';
import { canMoveInStructure } from '../../domain/structureMove';
import { useToast } from '../common/toasts';
import { allFields, getSchema, nodeLabel } from '../../domain/selectors';
import { resolveStructure, structureChildren, structureLenses } from '../../domain/structure';
import type { Node, Selection } from '../../domain/types';
import { useApp } from '../../state/AppContext';
import { usePreferences } from '../../state/preferences';
import { IconButton } from '../common/Button';
import { NodeAvatar } from '../common/NodeAvatar';
import { schemaOption } from '../common/options';
import { anchorOf, type Anchor } from '../common/anchor';
import { Select } from '../common/Select';

interface Row {
  /** Ruta de ids hasta el nodo; un nodo con varios superiores aparece una vez por ruta. */
  key: string;
  node: Node;
  depth: number;
  hasChildren: boolean;
  expanded: boolean;
  /** Ancestro mostrado solo para dar contexto a un resultado del filtro. */
  contextOnly: boolean;
}

interface TreePanelProps {
  selection: Selection;
  onSelect: (s: Selection) => void;
  onAdd: (parent: string | null, anchor: Anchor) => void;
  onCollapse: () => void;
}

export function TreePanel({ selection, onSelect, onAdd, onCollapse }: TreePanelProps) {
  const { project, dispatch } = useApp();
  const treeId = useId();
  const structure = resolveStructure(project, project.view.structureId);
  const [query, setQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState<string | null>(null);
  // Las ramas plegadas se recuerdan por proyecto y estructura en este navegador: sobreviven a cambiar de
  // vista (el panel se desmonta) y a recargar.
  const { preferences, setPreference } = usePreferences();
  const collapsedKey = `${project.id}:${project.view.structureId ?? 'hierarchy'}`;
  const collapsed = useMemo(
    () => new Set(preferences.collapsedRows[collapsedKey] ?? []),
    [preferences.collapsedRows, collapsedKey],
  );
  const setCollapsed = (update: (current: Set<string>) => Set<string>) =>
    setPreference('collapsedRows', { ...preferences.collapsedRows, [collapsedKey]: [...update(collapsed)] });
  const [focusedId, setFocusedId] = useState<string | null>(null);
  const toast = useToast();
  // Arrastrar y soltar: nodo arrastrado, fila bajo el puntero y zona (antes, dentro, después).
  const [dragging, setDragging] = useState<{ nodeId: string; parentId: string | null } | null>(null);
  const [dropAt, setDropAt] = useState<{ key: string; zone: 'before' | 'inside' | 'after'; ok: boolean } | null>(null);
  const [dropRoot, setDropRoot] = useState(false);
  // Carpeta bajo el puntero al arrastrar un nodo raíz.
  const [dropFolder, setDropFolder] = useState<string | null>(null);
  const { prompt, confirm } = useDialogs();
  const treeRef = useRef<HTMLDivElement>(null);
  const selectedNodeId = selection?.kind === 'node' ? selection.id : null;

  const children = useMemo(() => structureChildren(project, structure.id), [project, structure.id]);

  const tree = useMemo(() => {
    const q = query.trim().toLowerCase();
    const filtering = Boolean(q || typeFilter);
    const matches = (n: Node) =>
      (!typeFilter || n.typeId === typeFilter) &&
      (!q ||
        nodeLabel(project, n).toLowerCase().includes(q) ||
        allFields(project, n.typeId).some(
          f =>
            f.type !== 'image' &&
            String(n.values[f.id] ?? '')
              .toLowerCase()
              .includes(q),
        ));
    // Un nodo es visible si coincide o si algún descendiente coincide (entonces sirve de contexto).
    const relevant = new Map<string, boolean>();
    const visit = (n: Node, seen: Set<string>): boolean => {
      if (relevant.has(n.id)) return relevant.get(n.id)!;
      if (seen.has(n.id)) return false;
      seen.add(n.id);
      const self = matches(n);
      const below = (children.get(n.id) ?? []).map(c => visit(c, seen)).some(Boolean);
      relevant.set(n.id, self || below);
      return self || below;
    };
    // Se evita repetir un nodo dentro de su propia rama (ciclos), pero sí puede aparecer bajo varios superiores.
    const walk = (nodes: Node[], depth: number, path: string[], into: Row[]) => {
      for (const node of nodes) {
        if (path.includes(node.id)) continue;
        if (filtering && !visit(node, new Set())) continue;
        const key = [...path, node.id].join('/');
        const hasChildren = (children.get(node.id) ?? []).some(c => !path.includes(c.id) && c.id !== node.id);
        const expanded = filtering || !collapsed.has(key);
        into.push({ key, node, depth, hasChildren, expanded, contextOnly: filtering && !matches(node) });
        if (expanded) walk(children.get(node.id) ?? [], depth + 1, [...path, node.id], into);
      }
    };
    // Bloques: una carpeta por bloque (solo en «Dentro de» y sin filtro) y, al final, los nodos sueltos.
    const blocks: { folder: TreeFolder | null; rows: Row[]; expanded: boolean; count: number }[] = [];
    const useFolders = structure.id === null && !filtering && project.folders.length > 0;
    if (useFolders) {
      project.folders.forEach(folder => {
        const members = folderMembers(project, folder);
        const expanded = !collapsed.has(`folder:${folder.id}`);
        const folderRows: Row[] = [];
        if (expanded) walk(members, 1, [], folderRows);
        blocks.push({ folder, rows: folderRows, expanded, count: members.length });
      });
    }
    const rest: Row[] = [];
    walk(useFolders ? looseRoots(project) : (children.get(null) ?? []), 0, [], rest);
    blocks.push({ folder: null, rows: rest, expanded: true, count: rest.length });
    return { blocks, rows: blocks.flatMap(b => b.rows) };
  }, [children, collapsed, project, query, typeFilter, structure.id]);
  const { blocks, rows } = tree;

  // El foco de teclado sigue a la selección hecha desde el lienzo o el inspector.
  const focused = rows.some(r => r.node.id === focusedId) ? focusedId : (selectedNodeId ?? rows[0]?.node.id ?? null);
  useEffect(() => {
    if (!focused) return;
    treeRef.current?.querySelector(`[data-node="${focused}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [focused]);

  const parentOfRow = (row: Row) => {
    const path = row.key.split('/');
    return path.length > 1 ? path[path.length - 2] : null;
  };
  const zoneFor = (event: DragEvent): 'before' | 'inside' | 'after' => {
    const rect = event.currentTarget.getBoundingClientRect();
    const y = (event.clientY - rect.top) / rect.height;
    if (y < 0.25) return 'before';
    if (y > 0.75) return 'after';
    return 'inside';
  };
  const onRowDragOver = (event: DragEvent, row: Row) => {
    if (!dragging) return;
    event.preventDefault();
    event.stopPropagation();
    const zone = zoneFor(event);
    const targetParent = zone === 'inside' ? row.node.id : parentOfRow(row);
    const ok =
      row.node.id !== dragging.nodeId &&
      !row.key.split('/').includes(dragging.nodeId) &&
      canMoveInStructure(project, structure.id, dragging.nodeId, targetParent);
    event.dataTransfer.dropEffect = ok ? 'move' : 'none';
    setDropRoot(false);
    setDropAt(current =>
      current && current.key === row.key && current.zone === zone && current.ok === ok
        ? current
        : { key: row.key, zone, ok },
    );
  };
  const onRowDrop = (event: DragEvent, row: Row) => {
    event.preventDefault();
    event.stopPropagation();
    if (!dragging || !dropAt || !dropAt.ok) return cleanupDrag();
    const zone = dropAt.zone;
    const parentId = zone === 'inside' ? row.node.id : parentOfRow(row);
    let beforeId: string | null = null;
    if (zone === 'before') beforeId = row.node.id;
    else if (zone === 'after') {
      const siblings = (children.get(parentId) ?? []).filter(n => n.id !== dragging.nodeId);
      const index = siblings.findIndex(n => n.id === row.node.id);
      beforeId = siblings[index + 1]?.id ?? null;
    }
    dispatch({
      type: 'move-in-structure',
      structureId: structure.id,
      nodeId: dragging.nodeId,
      fromParentId: dragging.parentId,
      parentId,
      beforeId,
    });
    // Carpetas: como hermano de un nodo raíz adopta su carpeta (o ninguna); dentro de un nodo, sale de la suya.
    if (structure.id === null) {
      const folder = parentId === null ? (folderOf(project, row.node.id) ?? null) : null;
      const order = folder
        ? folderMembers(project, folder)
            .map(n => n.id)
            .filter(id => id !== dragging.nodeId)
        : [];
      const at = order.indexOf(row.node.id);
      const folderBefore = folder ? (zone === 'before' ? row.node.id : (order[at + 1] ?? null)) : null;
      dispatch({
        type: 'set-node-folder',
        nodeId: dragging.nodeId,
        folderId: folder?.id ?? null,
        beforeId: folderBefore,
      });
    }
    if (zone === 'inside') toggle(row.key, true);
    toast({
      message: parentId === null ? 'Nodo movido a la raíz' : `Nodo movido dentro de «${nodeLabel(project, row.node)}»`,
      undoable: true,
    });
    cleanupDrag();
  };
  const onFolderDragOver = (event: DragEvent, folder: TreeFolder) => {
    if (!dragging) return;
    event.preventDefault();
    event.stopPropagation();
    const ok = canMoveInStructure(project, structure.id, dragging.nodeId, null);
    event.dataTransfer.dropEffect = ok ? 'move' : 'none';
    setDropAt(null);
    setDropRoot(false);
    setDropFolder(ok ? folder.id : null);
  };
  const onFolderDrop = (event: DragEvent, folder: TreeFolder) => {
    event.preventDefault();
    event.stopPropagation();
    if (!dragging || dropFolder !== folder.id) return cleanupDrag();
    if (dragging.parentId !== null)
      dispatch({
        type: 'move-in-structure',
        structureId: structure.id,
        nodeId: dragging.nodeId,
        fromParentId: dragging.parentId,
        parentId: null,
        beforeId: null,
      });
    dispatch({ type: 'set-node-folder', nodeId: dragging.nodeId, folderId: folder.id });
    toggle(`folder:${folder.id}`, true);
    toast({ message: `Nodo guardado en la carpeta «${folder.name}»`, undoable: true });
    cleanupDrag();
  };
  const createFolder = async () => {
    const name = await prompt({
      title: 'Nueva carpeta',
      label: 'Nombre',
      placeholder: 'Por ejemplo: Secundarios',
      confirmLabel: 'Crear',
    });
    if (name) dispatch({ type: 'add-folder', name });
  };
  const renameFolderDialog = async (folder: TreeFolder) => {
    const name = await prompt({
      title: 'Renombrar carpeta',
      label: 'Nombre',
      initialValue: folder.name,
      confirmLabel: 'Renombrar',
    });
    if (name) dispatch({ type: 'rename-folder', id: folder.id, name });
  };
  const removeFolder = async (folder: TreeFolder, count: number) => {
    if (count > 0) {
      const ok = await confirm({
        title: `Eliminar la carpeta «${folder.name}»`,
        message: `Sus ${count} ${count === 1 ? 'nodo volverá' : 'nodos volverán'} a verse sueltos en la raíz. No se borra ningún nodo.`,
        confirmLabel: 'Eliminar carpeta',
        danger: true,
      });
      if (!ok) return;
    }
    dispatch({ type: 'delete-folder', id: folder.id });
    toast({ message: `Carpeta «${folder.name}» eliminada`, undoable: true });
  };
  const cleanupDrag = () => {
    setDragging(null);
    setDropAt(null);
    setDropRoot(false);
    setDropFolder(null);
  };
  const toggle = (id: string, open?: boolean) =>
    setCollapsed(current => {
      const next = new Set(current);
      const shouldOpen = open ?? next.has(id);
      if (shouldOpen) next.delete(id);
      else next.add(id);
      return next;
    });

  const onKeyDown = (event: KeyboardEvent) => {
    const index = rows.findIndex(r => r.node.id === focused);
    const row = rows[index];
    const focusAt = (i: number) => rows[i] && setFocusedId(rows[i].node.id);
    switch (event.key) {
      case 'ArrowDown':
        focusAt(Math.min(rows.length - 1, index + 1));
        break;
      case 'ArrowUp':
        focusAt(Math.max(0, index - 1));
        break;
      case 'Home':
        focusAt(0);
        break;
      case 'End':
        focusAt(rows.length - 1);
        break;
      case 'ArrowRight':
        if (!row?.hasChildren) break;
        if (!row.expanded) toggle(row.key, true);
        else focusAt(index + 1);
        break;
      case 'ArrowLeft': {
        if (row?.hasChildren && row.expanded && !query && !typeFilter) toggle(row.key, false);
        else if (row) {
          const parentKey = row.key.split('/').slice(0, -1).join('/');
          const parentRow = rows.find(r => r.key === parentKey);
          if (parentRow) setFocusedId(parentRow.node.id);
        }
        break;
      }
      case 'Enter':
      case ' ':
        if (row) onSelect({ kind: 'node', id: row.node.id });
        break;
      default:
        return;
    }
    event.preventDefault();
  };

  const entityTypes = project.schemas.filter(s => s.kind === 'entity');

  return (
    <>
      <div className="panel-head">
        <h2>Estructura</h2>
        <div className="spacer" />
        <IconButton
          icon={Plus}
          label="Añadir nodo raíz"
          size="sm"
          onClick={event => onAdd(null, anchorOf(event.currentTarget))}
        />
        {structure.id === null && (
          <IconButton
            icon={FolderPlus}
            label="Nueva carpeta (solo organiza el árbol)"
            size="sm"
            onClick={() => void createFolder()}
          />
        )}
        <IconButton icon={PanelLeftClose} label="Ocultar panel ([)" size="sm" onClick={onCollapse} />
      </div>
      <div className="tree-filters">
        <div className="field-inline">
          <span className="flow-toolbar-label">Ver por</span>
          <Select
            compact
            aria-label="Estructura"
            options={structureLenses(project).map(l => ({ value: l.id ?? '', label: l.name }))}
            value={structure.id ?? ''}
            onChange={id => dispatch({ type: 'update-view', view: { structureId: id || null } })}
          />
        </div>
        <div className="search-input">
          <Search size={14} aria-hidden />
          <input
            type="search"
            placeholder="Buscar…"
            aria-label="Buscar nodos"
            value={query}
            onChange={e => setQuery(e.target.value)}
          />
        </div>
        <Select
          compact
          aria-label="Filtrar por tipo"
          options={entityTypes.map(s => schemaOption(s))}
          value={typeFilter}
          nullLabel="Todos los tipos"
          onChange={setTypeFilter}
        />
      </div>
      <div
        ref={treeRef}
        className="tree"
        role="tree"
        aria-label="Estructura del proyecto"
        tabIndex={rows.length ? 0 : -1}
        aria-activedescendant={focused ? `${treeId}-${focused}` : undefined}
        onKeyDown={onKeyDown}
        onDragOver={event => {
          // Zona libre del árbol: soltar aquí lo lleva a la raíz, al final.
          if (!dragging) return;
          event.preventDefault();
          const ok = canMoveInStructure(project, structure.id, dragging.nodeId, null);
          event.dataTransfer.dropEffect = ok ? 'move' : 'none';
          setDropAt(null);
          setDropRoot(ok);
        }}
        onDragLeave={event => {
          if (event.currentTarget === event.target) setDropRoot(false);
        }}
        onDrop={event => {
          event.preventDefault();
          if (!dragging || !dropRoot) return cleanupDrag();
          dispatch({
            type: 'move-in-structure',
            structureId: structure.id,
            nodeId: dragging.nodeId,
            fromParentId: dragging.parentId,
            parentId: null,
            beforeId: null,
          });
          if (structure.id === null) dispatch({ type: 'set-node-folder', nodeId: dragging.nodeId, folderId: null });
          toast({ message: 'Nodo movido a la raíz', undoable: true });
          cleanupDrag();
        }}
        data-drop-root={dropRoot || undefined}
      >
        {blocks.map(block => (
          <Fragment key={block.folder?.id ?? '__root'}>
            {block.folder && (
              <div
                className={`tree-folder ${dropFolder === block.folder.id ? 'drop-inside' : ''}`}
                role="treeitem"
                aria-level={1}
                aria-expanded={block.expanded}
                aria-label={`Carpeta ${block.folder.name}`}
                onDragOver={event => onFolderDragOver(event, block.folder!)}
                onDragLeave={() => setDropFolder(current => (current === block.folder!.id ? null : current))}
                onDrop={event => onFolderDrop(event, block.folder!)}
                onClick={() => toggle(`folder:${block.folder!.id}`)}
              >
                <button type="button" className="twist" tabIndex={-1} aria-hidden>
                  {block.expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                </button>
                <span className="folder-icon" aria-hidden>
                  {block.expanded ? <FolderOpen size={15} /> : <Folder size={15} />}
                </span>
                <span className="tree-label" title="Carpeta: solo organiza el árbol, no existe en el mapa">
                  {block.folder.name}
                </span>
                <span className="badge">{block.count}</span>
                <span className="row-actions">
                  <IconButton
                    icon={Pencil}
                    size="sm"
                    tabIndex={-1}
                    tooltip={false}
                    label="Renombrar carpeta"
                    onClick={event => {
                      event.stopPropagation();
                      void renameFolderDialog(block.folder!);
                    }}
                  />
                  <IconButton
                    icon={Trash2}
                    size="sm"
                    variant="danger"
                    tabIndex={-1}
                    tooltip={false}
                    label="Eliminar carpeta (los nodos vuelven a la raíz)"
                    onClick={event => {
                      event.stopPropagation();
                      void removeFolder(block.folder!, block.count);
                    }}
                  />
                </span>
              </div>
            )}
            {block.folder && block.expanded && block.count === 0 && (
              <p className="empty-copy folder-empty">Arrastra aquí nodos de primer nivel.</p>
            )}
            {block.rows.map(row => {
              const schema = getSchema(project, row.node.typeId);
              const label = nodeLabel(project, row.node);
              const isSelected = selectedNodeId === row.node.id;
              return (
                <div
                  key={row.key}
                  id={`${treeId}-${row.node.id}`}
                  data-node={row.node.id}
                  role="treeitem"
                  aria-level={row.depth + 1}
                  aria-expanded={row.hasChildren ? row.expanded : undefined}
                  aria-selected={isSelected}
                  className={`tree-row ${isSelected ? 'selected' : ''} ${focused === row.node.id ? 'focused' : ''} ${row.contextOnly ? 'dimmed' : ''} ${dragging?.nodeId === row.node.id ? 'dragging' : ''} ${dropAt?.key === row.key ? `drop-${dropAt.zone} ${dropAt.ok ? '' : 'drop-invalid'}` : ''}`}
                  style={{ paddingLeft: 4 + row.depth * 16 }}
                  draggable
                  onDragStart={event => {
                    event.dataTransfer.effectAllowed = 'move';
                    event.dataTransfer.setData('text/plain', row.node.id);
                    setDragging({ nodeId: row.node.id, parentId: parentOfRow(row) });
                  }}
                  onDragEnd={cleanupDrag}
                  onDragOver={event => onRowDragOver(event, row)}
                  onDragLeave={() => setDropAt(current => (current?.key === row.key ? null : current))}
                  onDrop={event => onRowDrop(event, row)}
                  onClick={() => {
                    setFocusedId(row.node.id);
                    onSelect({ kind: 'node', id: row.node.id });
                  }}
                >
                  <button
                    type="button"
                    className="twist"
                    tabIndex={-1}
                    aria-hidden={!row.hasChildren}
                    style={{ visibility: row.hasChildren ? 'visible' : 'hidden' }}
                    onClick={event => {
                      event.stopPropagation();
                      toggle(row.key);
                    }}
                  >
                    {row.expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                  </button>
                  <NodeAvatar project={project} node={row.node} size="sm" />
                  <span className="tree-label" title={`${label} · ${schema?.name ?? ''}`}>
                    {label}
                  </span>
                  <span className="row-actions">
                    <IconButton
                      icon={Plus}
                      size="sm"
                      tabIndex={-1}
                      tooltip={false}
                      label={`Añadir dentro de ${label}`}
                      onClick={event => {
                        event.stopPropagation();
                        onAdd(row.node.id, anchorOf(event.currentTarget));
                      }}
                    />
                  </span>
                </div>
              );
            })}
          </Fragment>
        ))}
        {!rows.length && !blocks.some(b => b.folder) && (
          <p className="empty-copy">
            {project.nodes.length
              ? 'Ningún nodo coincide con el filtro.'
              : entityTypes.length
                ? 'Aún no hay nodos. Usa ＋ para añadir el primero.'
                : 'Empieza creando un tipo de entidad en «Tipos».'}
          </p>
        )}
      </div>
    </>
  );
}
