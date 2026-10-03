import { ChevronDown, ChevronRight, PanelLeftClose, Plus, Search } from 'lucide-react';
import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { allFields, getSchema, nodeLabel } from '../../domain/selectors';
import type { Node, Selection } from '../../domain/types';
import { useApp } from '../../state/AppContext';
import { IconButton } from '../common/Button';
import { TypeIcon } from '../common/icons';
import { schemaOption } from '../common/options';
import { anchorOf, type Anchor } from '../common/anchor';
import { Select } from '../common/Select';

interface Row {
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
  const { project } = useApp();
  const treeId = useId();
  const [query, setQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [focusedId, setFocusedId] = useState<string | null>(null);
  const treeRef = useRef<HTMLDivElement>(null);
  const selectedNodeId = selection?.kind === 'node' ? selection.id : null;

  const children = useMemo(() => {
    const map = new Map<string | null, Node[]>();
    const ids = new Set(project.nodes.map(n => n.id));
    project.nodes.forEach(n => {
      const parent = n.parentId && ids.has(n.parentId) ? n.parentId : null;
      map.set(parent, [...(map.get(parent) ?? []), n]);
    });
    return map;
  }, [project.nodes]);

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    const filtering = Boolean(q || typeFilter);
    const matches = (n: Node) =>
      (!typeFilter || n.typeId === typeFilter) &&
      (!q ||
        nodeLabel(project, n).toLowerCase().includes(q) ||
        allFields(project, n.typeId).some(f =>
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
    const walk = (parent: string | null, depth: number, seen: Set<string>) => {
      for (const node of children.get(parent) ?? []) {
        if (seen.has(node.id)) continue;
        seen.add(node.id);
        if (filtering && !visit(node, new Set())) continue;
        const hasChildren = (children.get(node.id) ?? []).length > 0;
        const expanded = filtering || !collapsed.has(node.id);
        result.push({ node, depth, hasChildren, expanded, contextOnly: filtering && !matches(node) });
        if (expanded) walk(node.id, depth + 1, seen);
      }
    };
    walk(null, 0, new Set());
    return result;
  }, [children, collapsed, project, query, typeFilter]);

  // El foco de teclado sigue a la selección hecha desde el lienzo o el inspector.
  const focused = rows.some(r => r.node.id === focusedId) ? focusedId : (selectedNodeId ?? rows[0]?.node.id ?? null);
  useEffect(() => {
    if (!focused) return;
    treeRef.current?.querySelector(`[data-node="${focused}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [focused]);

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
        if (!row.expanded) toggle(row.node.id, true);
        else focusAt(index + 1);
        break;
      case 'ArrowLeft':
        if (row?.hasChildren && row.expanded && !query && !typeFilter) toggle(row.node.id, false);
        else if (row?.node.parentId) setFocusedId(row.node.parentId);
        break;
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
      >
        {rows.map(row => {
          const schema = getSchema(project, row.node.typeId);
          const label = nodeLabel(project, row.node);
          const isSelected = selectedNodeId === row.node.id;
          return (
            <div
              key={row.node.id}
              id={`${treeId}-${row.node.id}`}
              data-node={row.node.id}
              role="treeitem"
              aria-level={row.depth + 1}
              aria-expanded={row.hasChildren ? row.expanded : undefined}
              aria-selected={isSelected}
              className={`tree-row ${isSelected ? 'selected' : ''} ${focused === row.node.id ? 'focused' : ''} ${row.contextOnly ? 'dimmed' : ''}`}
              style={{ paddingLeft: 4 + row.depth * 16 }}
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
                  toggle(row.node.id);
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
                : 'Empieza creando un tipo de entidad en «Tipos y propiedades».'}
          </p>
        )}
      </div>
    </>
  );
}
