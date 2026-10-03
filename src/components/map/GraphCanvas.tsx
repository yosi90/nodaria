import { useMemo, useState, type PointerEvent } from 'react';
import { allFields, fieldValue, getNode, getSchema, nodeDepths, nodeLabel } from '../../domain/selectors';
import type { FieldDefinition, Node, Project, Selection } from '../../domain/types';
import { useApp } from '../../state/AppContext';

interface TooltipState {
  nodeId: string;
  x: number;
  y: number;
}

export function GraphCanvas({
  selection,
  onSelect,
}: {
  selection: Selection;
  onSelect: (selection: Selection) => void;
}) {
  const { project } = useApp();
  const [tooltip, setTooltip] = useState<TooltipState | null>(null);
  const positions = useMemo(() => {
    const result = new Map<string, { x: number; y: number }>();
    const levels = new Map<number, string[]>();
    const depths = nodeDepths(project);
    project.nodes.forEach(node => {
      const level = depths.get(node.id) ?? 0;
      levels.set(level, [...(levels.get(level) || []), node.id]);
    });
    levels.forEach((ids, level) =>
      ids.forEach((id, index) => result.set(id, { x: 70 + level * 260, y: 55 + index * 105 })),
    );
    return result;
  }, [project]);

  const showTooltip = (nodeId: string, event: PointerEvent<SVGGElement>) =>
    setTooltip({ nodeId, x: event.clientX, y: event.clientY });

  if (!project.nodes.length)
    return (
      <section className="workspace">
        <div className="empty-state">
          <div>
            <h2>Un lienzo para tus ideas</h2>
            <p>Define un tipo de entidad y crea el primer nodo desde el panel izquierdo.</p>
          </div>
        </div>
      </section>
    );

  const tooltipNode = tooltip ? project.nodes.find(node => node.id === tooltip.nodeId) : undefined;
  return (
    <section className="workspace">
      <div className="workspace-toolbar">
        <strong>Vista general</strong>
        <div className="spacer" />
        <span>
          {project.nodes.length} nodos · {project.relations.length} relaciones
        </span>
      </div>
      <div className="canvas">
        <svg
          width={Math.max(900, ...[...positions.values()].map(position => position.x + 240))}
          height={Math.max(650, ...[...positions.values()].map(position => position.y + 100))}
        >
          {project.nodes
            .filter(node => node.parentId && positions.has(node.parentId))
            .map(node => {
              const parent = positions.get(node.parentId!)!,
                position = positions.get(node.id)!;
              return (
                <path
                  key={`p-${node.id}`}
                  className="edge"
                  d={`M${parent.x + 170},${parent.y + 28} C${parent.x + 220},${parent.y + 28} ${position.x - 50},${position.y + 28} ${position.x},${position.y + 28}`}
                />
              );
            })}
          {project.relations.map(relation => {
            const source = positions.get(relation.sourceId),
              target = positions.get(relation.targetId),
              schema = getSchema(project, relation.typeId);
            if (!source || !target) return null;
            return (
              <g
                key={relation.id}
                onClick={() => onSelect({ kind: 'relation', id: relation.id })}
                className="relation-line"
              >
                <path
                  className={`edge relation ${schema?.relationStyle || ''}`}
                  d={`M${source.x + 85},${source.y + 58} Q${(source.x + target.x) / 2},${Math.min(source.y, target.y) - 35} ${target.x + 85},${target.y + 58}`}
                />
                <text x={(source.x + target.x) / 2 + 85} y={(source.y + target.y) / 2 - 10}>
                  {schema?.name}
                </text>
              </g>
            );
          })}
          {project.nodes.map(node => {
            const position = positions.get(node.id)!,
              schema = getSchema(project, node.typeId);
            return (
              <g
                key={node.id}
                transform={`translate(${position.x} ${position.y})`}
                className={`svg-node ${selection?.kind === 'node' && selection.id === node.id ? 'selected' : ''}`}
                onClick={() => onSelect({ kind: 'node', id: node.id })}
                onPointerEnter={event => showTooltip(node.id, event)}
                onPointerMove={event => showTooltip(node.id, event)}
                onPointerLeave={() => setTooltip(null)}
              >
                <rect width="170" height="58" />
                <rect className="type-band" width="6" height="58" fill={schema?.color} />
                <text x="18" y="25">
                  {nodeLabel(project, node).slice(0, 22)}
                </text>
                <text className="type-text" x="18" y="43">
                  {schema?.name}
                </text>
              </g>
            );
          })}
        </svg>
      </div>
      {tooltipNode && <NodeTooltip project={project} node={tooltipNode} x={tooltip!.x} y={tooltip!.y} />}
    </section>
  );
}

function NodeTooltip({ project, node, x, y }: { project: Project; node: Node; x: number; y: number }) {
  const fields = allFields(project, node.typeId);
  const schema = getSchema(project, node.typeId);
  return (
    <div
      className="node-tooltip"
      style={{
        left: Math.max(8, Math.min(x + 14, window.innerWidth - 310)),
        top: Math.max(8, Math.min(y + 14, window.innerHeight - 280)),
      }}
      role="tooltip"
    >
      <header>
        <span className="type-dot" style={{ background: schema?.color }} />
        <div>
          <strong>{nodeLabel(project, node)}</strong>
          <small>{schema?.name}</small>
        </div>
      </header>
      <div className="node-tooltip-fields">
        {fields.length ? (
          fields.map(field => (
            <div key={field.id}>
              <span>{field.label}</span>
              <strong>{formatValue(project, field, node, fields)}</strong>
            </div>
          ))
        ) : (
          <p>Este nodo no tiene atributos definidos.</p>
        )}
      </div>
    </div>
  );
}

function formatValue(project: Project, field: FieldDefinition, node: Node, fields: FieldDefinition[]) {
  const value = fieldValue(field, node.values, fields);
  if (field.type === 'boolean') return value ? 'Sí' : 'No';
  if (field.type === 'nodeRef') {
    const target = typeof value === 'string' ? getNode(project, value) : undefined;
    return target ? nodeLabel(project, target) : '—';
  }
  if (field.type === 'nodeRefs' && Array.isArray(value))
    return (
      value
        .map(id => project.nodes.find(item => item.id === id))
        .filter((item): item is Node => Boolean(item))
        .map(item => nodeLabel(project, item))
        .join(', ') || '—'
    );
  if (Array.isArray(value)) return value.join(', ') || '—';
  return value === undefined || value === null || value === '' ? '—' : String(value);
}
