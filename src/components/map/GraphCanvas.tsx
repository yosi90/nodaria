import { Network } from 'lucide-react';
import { createElement, useMemo, useState, type PointerEvent } from 'react';
import {
  allFields,
  fieldValue,
  getNode,
  getSchema,
  nodeDepths,
  nodeLabel,
  ownTitle,
  relationLabel,
} from '../../domain/selectors';
import type { FieldDefinition, Node, Project, Selection } from '../../domain/types';
import { useApp } from '../../state/AppContext';
import { EmptyState } from '../common/EmptyState';
import { typeIcon } from '../common/icon-catalog';
import { TypeIcon } from '../common/icons';
import { bendFor, routeRelation, type Box } from './edgeGeometry';

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

  // Relaciones agrupadas por par de nodos (sin importar el sentido) para separar las paralelas.
  const parallel = useMemo(() => {
    const groups = new Map<string, string[]>();
    project.relations.forEach(r => {
      const key = [r.sourceId, r.targetId].sort().join('|');
      groups.set(key, [...(groups.get(key) ?? []), r.id]);
    });
    const result = new Map<string, { index: number; count: number }>();
    groups.forEach(ids => ids.forEach((id, index) => result.set(id, { index, count: ids.length })));
    return result;
  }, [project.relations]);

  const boxes = useMemo(() => {
    const result = new Map<string, Box>();
    positions.forEach((p, id) => result.set(id, { ...p, width: NODE_W, height: NODE_H }));
    return result;
  }, [positions]);
  const obstacles = useMemo(() => [...boxes.values()], [boxes]);

  // Rutas de las relaciones y límites del contenido (curvas y etiquetas incluidas) para dimensionar el lienzo.
  const layout = useMemo(() => {
    const routes = new Map<string, ReturnType<typeof routeRelation> & { label: string; named: boolean }>();
    project.relations.forEach(relation => {
      const a = boxes.get(relation.sourceId);
      const b = boxes.get(relation.targetId);
      if (!a || !b) return;
      const { index, count } = parallel.get(relation.id) ?? { index: 0, count: 1 };
      const forward = relation.sourceId < relation.targetId;
      const distance = Math.hypot(b.x - a.x, b.y - a.y);
      const route = routeRelation(a, b, bendFor(index, count, distance), obstacles, forward ? a : b, forward ? b : a);
      const label = relationLabel(project, relation);
      routes.set(relation.id, { ...route, label, named: ownTitle(project, relation) !== undefined });
    });
    const xs: number[] = [];
    const ys: number[] = [];
    obstacles.forEach(o => {
      xs.push(o.x, o.x + o.width);
      ys.push(o.y, o.y + o.height);
    });
    routes.forEach(r => {
      // El punto de control acota la curva; la etiqueta se estima a ~7 px por carácter.
      xs.push(r.start.x, r.end.x, (r.start.x + r.control.x) / 2, (r.end.x + r.control.x) / 2);
      ys.push(r.start.y, r.end.y, (r.start.y + r.control.y) / 2, (r.end.y + r.control.y) / 2);
      const w = r.label.length * 7 + 8;
      const x0 = r.anchor === 'start' ? r.labelPos.x : r.anchor === 'end' ? r.labelPos.x - w : r.labelPos.x - w / 2;
      xs.push(x0, x0 + w);
      ys.push(r.labelPos.y - 14, r.labelPos.y + 6);
    });
    const margin = 40;
    const offsetX = margin - Math.min(0, ...xs);
    const offsetY = margin - Math.min(0, ...ys);
    return {
      routes,
      offsetX,
      offsetY,
      width: Math.max(900, Math.max(...xs) + offsetX + margin),
      height: Math.max(600, Math.max(...ys) + offsetY + margin),
    };
  }, [boxes, obstacles, parallel, project]);

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
  return (
    <section className="workspace">
      <div className="workspace-toolbar">
        <strong>Vista general</strong>
        <div className="spacer" />
        <span className="badge">{project.nodes.length} nodos</span>
        <span className="badge">{project.relations.length} relaciones</span>
      </div>
      <div className="canvas">
        <svg width={layout.width} height={layout.height} role="group" aria-label="Mapa de nodos">
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
          <g transform={`translate(${layout.offsetX} ${layout.offsetY})`}>
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
              const path = layout.routes.get(relation.id);
              if (!path) return null;
              const schema = getSchema(project, relation.typeId);
              const { label, named } = path;
              const isSelected = selection?.kind === 'relation' && selection.id === relation.id;
              return (
                <g
                  key={relation.id}
                  className="relation-line"
                  role="button"
                  tabIndex={0}
                  aria-label={named ? `${label} (${schema?.name ?? 'relación'})` : `Relación ${label}`}
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
                    d={path.d}
                  />
                  <path className="edge-hit" d={path.d} />
                  <text
                    x={path.labelPos.x + (path.anchor === 'start' ? 6 : path.anchor === 'end' ? -6 : 0)}
                    y={path.labelPos.y + (path.anchor === 'middle' ? -6 : 4)}
                    textAnchor={path.anchor}
                    className={named ? 'named' : ''}
                  >
                    <title>{named ? `${label} · ${schema?.name ?? ''}` : label}</title>
                    {label}
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
          </g>
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
