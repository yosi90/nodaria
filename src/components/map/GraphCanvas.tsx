import { Network } from 'lucide-react';
import { createElement, useMemo, useState, type PointerEvent } from 'react';
import { allFields, fieldValue, getNode, getSchema, nodeDepths, nodeLabel } from '../../domain/selectors';
import type { FieldDefinition, Node, Project, Selection } from '../../domain/types';
import { useApp } from '../../state/AppContext';
import { EmptyState } from '../common/EmptyState';
import { typeIcon } from '../common/icon-catalog';
import { TypeIcon } from '../common/icons';

interface TooltipState {
  nodeId: string;
  x: number;
  y: number;
}

const NODE_W = 196;
const NODE_H = 56;
const COL = 270;
const ROW = 96;

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
      ids.forEach((id, index) => result.set(id, { x: 60 + level * COL, y: 50 + index * ROW })),
    );
    return result;
  }, [project]);

  const showTooltip = (nodeId: string, event: PointerEvent<SVGGElement>) =>
    setTooltip({ nodeId, x: event.clientX, y: event.clientY });

  if (!project.nodes.length)
    return (
      <section className="workspace">
        <div className="workspace-toolbar">
          <strong>Vista general</strong>
        </div>
        <EmptyState icon={Network} title="Un lienzo para tu mundo">
          Define tipos de entidad en «Tipos y propiedades» y crea el primer nodo desde el panel de estructura.
        </EmptyState>
      </section>
    );

  const tooltipNode = tooltip ? getNode(project, tooltip.nodeId) : undefined;
  const all = [...positions.values()];
  return (
    <section className="workspace">
      <div className="workspace-toolbar">
        <strong>Vista general</strong>
        <div className="spacer" />
        <span className="badge">{project.nodes.length} nodos</span>
        <span className="badge">{project.relations.length} relaciones</span>
      </div>
      <div className="canvas">
        <svg
          width={Math.max(900, ...all.map(p => p.x + NODE_W + 80))}
          height={Math.max(600, ...all.map(p => p.y + NODE_H + 60))}
          role="group"
          aria-label="Mapa de nodos"
        >
          <defs>
            {project.schemas
              .filter(s => s.kind === 'relationship' && s.directed)
              .map(s => (
                <marker
                  key={s.id}
                  id={`arrow-${s.id}`}
                  viewBox="0 0 10 10"
                  refX="9"
                  refY="5"
                  markerWidth="7"
                  markerHeight="7"
                  orient="auto"
                >
                  <path d="M0,0 L10,5 L0,10 z" fill={s.color} />
                </marker>
              ))}
          </defs>
          {project.nodes
            .filter(node => node.parentId && positions.has(node.parentId))
            .map(node => {
              const parent = positions.get(node.parentId!)!,
                position = positions.get(node.id)!;
              const y1 = parent.y + NODE_H / 2,
                y2 = position.y + NODE_H / 2;
              return (
                <path
                  key={`p-${node.id}`}
                  className="edge"
                  d={`M${parent.x + NODE_W},${y1} C${parent.x + NODE_W + 40},${y1} ${position.x - 40},${y2} ${position.x},${y2}`}
                />
              );
            })}
          {project.relations.map(relation => {
            const source = positions.get(relation.sourceId),
              target = positions.get(relation.targetId),
              schema = getSchema(project, relation.typeId);
            if (!source || !target) return null;
            const sx = source.x + NODE_W / 2,
              tx = target.x + NODE_W / 2,
              sy = source.y + NODE_H,
              ty = target.y + NODE_H;
            const isSelected = selection?.kind === 'relation' && selection.id === relation.id;
            return (
              <g
                key={relation.id}
                className="relation-line"
                role="button"
                tabIndex={0}
                aria-label={`Relación ${schema?.name ?? ''}`}
                onClick={() => onSelect({ kind: 'relation', id: relation.id })}
                onKeyDown={event => event.key === 'Enter' && onSelect({ kind: 'relation', id: relation.id })}
              >
                <path
                  className={`edge relation ${schema?.relationStyle || ''}`}
                  style={{
                    stroke: schema?.color,
                    strokeWidth: isSelected ? 3.4 : undefined,
                  }}
                  markerEnd={schema?.directed ? `url(#arrow-${schema.id})` : undefined}
                  d={`M${sx},${sy} Q${(sx + tx) / 2},${Math.max(sy, ty) + 60} ${tx},${ty}`}
                />
                <text x={(sx + tx) / 2} y={Math.max(sy, ty) + 30} textAnchor="middle">
                  {schema?.name}
                </text>
              </g>
            );
          })}
          {project.nodes.map(node => {
            const position = positions.get(node.id)!,
              schema = getSchema(project, node.typeId);
            const label = nodeLabel(project, node);
            const isSelected = selection?.kind === 'node' && selection.id === node.id;
            return (
              <g
                key={node.id}
                transform={`translate(${position.x} ${position.y})`}
                className={`svg-node ${isSelected ? 'selected' : ''}`}
                role="button"
                tabIndex={0}
                aria-label={`${label}, ${schema?.name ?? 'sin tipo'}`}
                aria-pressed={isSelected}
                onClick={() => onSelect({ kind: 'node', id: node.id })}
                onKeyDown={event => event.key === 'Enter' && onSelect({ kind: 'node', id: node.id })}
                onPointerEnter={event => showTooltip(node.id, event)}
                onPointerMove={event => showTooltip(node.id, event)}
                onPointerLeave={() => setTooltip(null)}
              >
                <rect className="node-card" width={NODE_W} height={NODE_H} rx="12" />
                <rect x="12" y="15" width="26" height="26" rx="7" fill={schema?.color} opacity="0.18" />
                {createElement(typeIcon(schema?.icon), {
                  x: 18,
                  y: 21,
                  width: 14,
                  height: 14,
                  color: schema?.color,
                  strokeWidth: 2.2,
                })}
                <text className="node-title" x="48" y="25">
                  {label.length > 20 ? `${label.slice(0, 19)}…` : label}
                </text>
                <text className="node-type" x="48" y="41">
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
        <TypeIcon icon={schema?.icon} color={schema?.color} />
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
        .map(id => getNode(project, id))
        .filter((item): item is Node => Boolean(item))
        .map(item => nodeLabel(project, item))
        .join(', ') || '—'
    );
  if (Array.isArray(value)) return value.join(', ') || '—';
  return value === undefined || value === null || value === '' ? '—' : String(value);
}
