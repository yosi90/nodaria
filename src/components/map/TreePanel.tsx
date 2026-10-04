import { ChevronDown, ChevronRight, PanelLeftClose, Plus, Search } from 'lucide-react';
import { useEffect, useId, useMemo, useRef, useState, type DragEvent, type KeyboardEvent } from 'react';
import { canMoveInStructure } from '../../domain/structureMove';
import { useToast } from '../common/toasts';
import { allFields, getSchema, nodeLabel } from '../../domain/selectors';
import { resolveStructure, structureChildren, structureLenses } from '../../domain/structure';
import type { Node, Selection } from '../../domain/types';
import { useApp } from '../../state/AppContext';
import { IconButton } from '../common/Button';
import { TypeIcon } from '../common/icons';
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
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [focusedId, setFocusedId] = useState<string | null>(null);
  const toast = useToast();
  // Arrastrar y soltar: nodo arrastrado, fila bajo el puntero y zona (antes, dentro, después).
  const [dragging, setDragging] = useState<{ nodeId: string; parentId: string | null } | null>(null);
  const [dropAt, setDropAt] = useState<{ key: string; zone: 'before' | 'inside' | 'after'; ok: boolean } | null>(null);
  const [dropRoot, setDropRoot] = useState(false);
  const treeRef = useRef<HTMLDivElement>(null);
  const selectedNodeId = selection?.kind === 'node' ? selection.id : null;

  const children = useMemo(() => structureChildren(project, structure.id), [project, structure.id]);

  const rows = useMemo(() => {
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
    const result: Row[] = [];
    // Se evita repetir un nodo dentro de su propia rama (ciclos), pero sí puede aparecer bajo varios superiores.
    const walk = (parent: string | null, depth: number, path: string[]) => {
      for (const node of children.get(parent) ?? []) {
        if (path.includes(node.id)) continue;
        if (filtering && !visit(node, new Set())) continue;
        const key = [...path, node.id].join('/');
        const hasChildren = (children.get(node.id) ?? []).some(c => !path.includes(c.id) && c.id !== node.id);
        const expanded = filtering || !collapsed.has(key);
        result.push({ key, node, depth, hasChildren, expanded, contextOnly: filtering && !matches(node) });
        if (expanded) walk(node.id, depth + 1, [...path, node.id]);
      }
    };
    walk(null, 0, []);
    return result;
  }, [children, collapsed, project, query, typeFilter]);

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
    if (zone === 'inside') toggle(row.key, true);
    toast({
      message: parentId === null ? 'Nodo movido a la raíz' : `Nodo movido dentro de «${nodeLabel(project, row.node)}»`,
      undoable: true,
    });
    cleanupDrag();
  };
  const cleanupDrag = () => {
    setDragging(null);
    setDropAt(null);
    setDropRoot(false);
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
          toast({ message: 'Nodo movido a la raíz', undoable: true });
          cleanupDrag();
        }}
        data-drop-root={dropRoot || undefined}
      >
        {rows.map(row => {
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
              <TypeIcon icon={schema?.icon} color={schema?.color} size="sm" />
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
        {!rows.length && (
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
