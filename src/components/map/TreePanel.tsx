import { useMemo, useState } from 'react';
import { allFields, getSchema, nodeLabel } from '../../domain/selectors';
import type { Node, Selection } from '../../domain/types';
import { useApp } from '../../state/AppContext';
export function TreePanel({
  selection,
  onSelect,
  onAdd,
}: {
  selection: Selection;
  onSelect: (s: Selection) => void;
  onAdd: (parent: string | null, anchor: { x: number; y: number }) => void;
}) {
  const { project } = useApp();
  const [query, setQuery] = useState('');
  const [type, setType] = useState('');
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const children = useMemo(() => {
    const map = new Map<string | null, Node[]>();
    project.nodes.forEach(n => {
      const list = map.get(n.parentId) || [];
      list.push(n);
      map.set(n.parentId, list);
    });
    return map;
  }, [project.nodes]);
  const visible = (n: Node) =>
    (!type || n.typeId === type) &&
    (!query ||
      nodeLabel(project, n).toLowerCase().includes(query.toLowerCase()) ||
      allFields(project, n.typeId).some(f =>
        String(n.values[f.id] ?? '')
          .toLowerCase()
          .includes(query.toLowerCase()),
      ));
  const branch = (parent: string | null, depth = 0): React.ReactNode =>
    (children.get(parent) || []).map(n => {
      const kids = children.get(n.id) || [];
      const show = visible(n);
      return (
        <div key={n.id}>
          {show && (
            <div
              className={`tree-row ${selection?.kind === 'node' && selection.id === n.id ? 'selected' : ''}`}
              style={{ paddingLeft: 8 + depth * 18 }}
            >
              <button
                className="twist"
                onClick={() =>
                  setCollapsed(c => {
                    const x = new Set(c);
                    if (x.has(n.id)) x.delete(n.id);
                    else x.add(n.id);
                    return x;
                  })
                }
              >
                {kids.length ? (collapsed.has(n.id) ? '▸' : '▾') : ''}
              </button>
              <span className="dot" style={{ background: getSchema(project, n.typeId)?.color }} />
              <button className="tree-label" onClick={() => onSelect({ kind: 'node', id: n.id })}>
                {nodeLabel(project, n)}
              </button>
              <small>{getSchema(project, n.typeId)?.name}</small>
              <button
                className="mini"
                aria-label={`Añadir nodo dentro de ${nodeLabel(project, n)}`}
                onClick={event => {
                  const rect = event.currentTarget.getBoundingClientRect();
                  onAdd(n.id, { x: rect.right, y: rect.bottom + 4 });
                }}
              >
                ＋
              </button>
            </div>
          )}
          {!collapsed.has(n.id) && branch(n.id, depth + 1)}
        </div>
      );
    });
  return (
    <aside className="sidebar">
      <div className="panel-head">
        <h2>Estructura</h2>
        <div className="spacer" />
        <button
          className="icon-btn"
          aria-label="Añadir nodo raíz"
          onClick={event => {
            const rect = event.currentTarget.getBoundingClientRect();
            onAdd(null, { x: rect.right, y: rect.bottom + 4 });
          }}
        >
          ＋
        </button>
      </div>
      <div className="filters">
        <input placeholder="Buscar nodos…" value={query} onChange={e => setQuery(e.target.value)} />
        <select value={type} onChange={e => setType(e.target.value)}>
          <option value="">Todos los tipos</option>
          {project.schemas
            .filter(s => s.kind === 'entity')
            .map(s => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
        </select>
      </div>
      <div className="tree">
        {project.nodes.length ? branch(null) : <p className="empty-copy">Crea tipos y añade tu primer nodo.</p>}
      </div>
    </aside>
  );
}
