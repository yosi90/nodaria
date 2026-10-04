import {
  Background,
  BackgroundVariant,
  ConnectionMode,
  Controls,
  MarkerType,
  MiniMap,
  Panel,
  ReactFlow,
  ReactFlowProvider,
  useReactFlow,
  type Edge,
  type NodeChange,
  type OnConnectEnd,
  type OnNodeDrag,
} from '@xyflow/react';
import { Crosshair, GitBranch, LayoutGrid, Network, Orbit, SlidersHorizontal, Sparkles, Tag } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState, type MouseEvent } from 'react';
import { allFields, getNode, getSchema, nodeLabel, ownTitle, relationRole } from '../../domain/selectors';
import { referenceFields, referenceLinks } from '../../domain/references';
import { kinshipStructureLink, kinshipTerm } from '../../domain/kinship';
import { resolveStructure, structureLinks } from '../../domain/structure';
import type { LayoutMode, Position, Project, Selection, Relation } from '../../domain/types';
import { useApp } from '../../state/AppContext';
import { pointAnchor, type Anchor } from '../common/anchor';
import { Button, IconButton } from '../common/Button';
import { EmptyState } from '../common/EmptyState';
import { useToast } from '../common/toasts';
import { FloatingEdge, type FloatingEdgeType } from './FloatingEdge';
import { CanvasSettingsContext } from './canvasSettings';
import { FamilyLinks } from './FamilyLinks';
import { autoLayout, familyUnits, genealogyStructure, NODE_H, NODE_W, type Link } from './layout';
import { LegendPanel } from './LegendPanel';
import { LensMenu } from './LensMenu';
import { isImageValue } from './images';
import { NodeCard, type CardNode } from './NodeCard';

const nodeTypes = { card: NodeCard };
const fitViewOptions = { padding: 0.2, maxZoom: 1 };
const proOptions = { hideAttribution: true };
/** Por encima de este tamaño las aristas dejan de esquivar tarjetas: el coste crece con nodos × relaciones. */
const AVOID_OBSTACLES_LIMIT = 200;
const edgeTypes = { floating: FloatingEdge };

const LAYOUTS: { mode: LayoutMode; label: string; icon: typeof Network; hint: string }[] = [
  { mode: 'tree', label: 'Jerárquica', icon: LayoutGrid, hint: 'Columnas según la estructura elegida' },
  {
    mode: 'genealogy',
    label: 'Genealogía',
    icon: GitBranch,
    hint: 'Generaciones en filas, de arriba abajo, según el parentesco (padres arriba, hijos debajo)',
  },
  {
    mode: 'force',
    label: 'Fuerzas',
    icon: Sparkles,
    hint: 'Los nodos relacionados se acercan; los fijados con chincheta no se mueven',
  },
  { mode: 'radial', label: 'Radial', icon: Orbit, hint: 'Anillos alrededor del nodo seleccionado' },
];

interface FlowCanvasProps {
  selection: Selection;
  onSelect: (selection: Selection) => void;
  /** Doble clic en el lienzo: crear un nodo raíz en esa posición. */
  onAddNode: (anchor: Anchor, position: Position) => void;
  /** Conexión arrastrada de un nodo a otro. */
  onConnectNodes: (sourceId: string, targetId: string, anchor: Anchor) => void;
  /** Cambia cuando hay que centrar la selección en el lienzo. */
  revealKey: number;
}

export function FlowCanvas(props: FlowCanvasProps) {
  return (
    <ReactFlowProvider>
      <Canvas {...props} />
    </ReactFlowProvider>
  );
}

/** Vecinos a `depth` saltos de `start` siguiendo las conexiones visibles. */
function neighborhood(start: string, links: Link[], depth: number) {
  const adjacency = new Map<string, string[]>();
  links.forEach(({ a, b }) => {
    adjacency.set(a, [...(adjacency.get(a) ?? []), b]);
    adjacency.set(b, [...(adjacency.get(b) ?? []), a]);
  });
  const seen = new Set([start]);
  let frontier = [start];
  for (let i = 0; i < depth && frontier.length; i++) {
    const next: string[] = [];
    frontier.forEach(id =>
      (adjacency.get(id) ?? []).forEach(n => {
        if (!seen.has(n)) {
          seen.add(n);
          next.push(n);
        }
      }),
    );
    frontier = next;
  }
  return seen;
}

function isIncomplete(project: Project, typeId: string, values: Record<string, unknown>) {
  return allFields(project, typeId).some(f => {
    if (!f.required || f.type === 'computed') return false;
    const v = values[f.id];
    return v === undefined || v === null || v === '' || (Array.isArray(v) && !v.length);
  });
}

function Canvas({ selection, onSelect, onAddNode, onConnectNodes, revealKey }: FlowCanvasProps) {
  const { project, dispatch } = useApp();
  const toast = useToast();
  const flow = useReactFlow();
  const { view } = project;
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [overrides, setOverrides] = useState<Record<string, Position>>({});
  const [legendOpen, setLegendOpen] = useState(false);
  const selectedNodeId = selection?.kind === 'node' ? selection.id : null;
  const structure = resolveStructure(project, view.structureId);

  // Conexiones visibles: relaciones no ocultas y, si procede, la jerarquía "Dentro de".
  const hiddenRelations = useMemo(() => new Set(view.hiddenRelationTypeIds), [view.hiddenRelationTypeIds]);
  const hiddenEntities = useMemo(() => new Set(view.hiddenEntityTypeIds), [view.hiddenEntityTypeIds]);
  const hiddenReferences = useMemo(() => new Set(view.hiddenReferenceFieldIds), [view.hiddenReferenceFieldIds]);
  const refLinks = useMemo(
    () => referenceLinks(project).filter(l => !hiddenReferences.has(l.fieldId)),
    [project, hiddenReferences],
  );
  const refFields = useMemo(() => new Map(referenceFields(project).map(r => [r.field.id, r])), [project]);
  const links = useMemo<Link[]>(() => {
    const result: Link[] = project.relations
      .filter(r => !hiddenRelations.has(r.typeId))
      .map(r => ({ a: r.sourceId, b: r.targetId }));
    if (view.showHierarchy) structureLinks(project, null).forEach(l => result.push({ a: l.parentId, b: l.childId }));
    refLinks.forEach(l => result.push({ a: l.sourceId, b: l.targetId }));
    return result;
  }, [project, hiddenRelations, view.showHierarchy, refLinks]);

  // Nodos con posición manual: la disposición por fuerzas los respeta y acomoda el resto alrededor.
  const fixed = useMemo(
    () =>
      new Map(project.nodes.filter(n => n.positions[view.layout]).map(n => [n.id, n.positions[view.layout]!] as const)),
    [project.nodes, view.layout],
  );
  // La disposición automática solo depende de la forma del grafo, no de los valores de los nodos.
  const layoutKey = JSON.stringify([
    view.layout,
    structure.id,
    view.layout === 'radial' ? selectedNodeId : null,
    view.layout === 'force' ? [...fixed] : null,
    view.layout === 'genealogy' ? structureLinks(project, genealogyStructure(project, structure.id)) : null,
    project.nodes.map(n => [n.id, n.typeId, n.parentId]),
    links,
    // Cambiar el tipo o el parentesco de una relación altera la estructura sin cambiar sus extremos.
    structureLinks(project, structure.id),
  ]);
  const autoPositions = useMemo(
    () => autoLayout(project, view.layout, structure.id, links, selectedNodeId, fixed),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- la clave resume todas las entradas relevantes
    [layoutKey],
  );

  // Al navegar a un elemento (árbol, conexiones, buscador) se centra en el lienzo.
  useEffect(() => {
    if (!revealKey || !selection) return;
    const ids =
      selection.kind === 'node'
        ? [selection.id]
        : (() => {
            const r = project.relations.find(x => x.id === selection.id);
            return r ? [r.sourceId, r.targetId] : [];
          })();
    if (!ids.length) return;
    const timer = window.setTimeout(
      () => flow.fitView({ nodes: ids.map(id => ({ id })), padding: 0.6, maxZoom: 1, duration: 350 }),
      // El inspector puede estar abriéndose y cambiando el ancho del lienzo.
      160,
    );
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- solo cuando se pide centrar
  }, [revealKey]);

  // Al cambiar de disposición o de estructura, se vuelve a encuadrar el conjunto.
  useEffect(() => {
    const timer = window.setTimeout(() => flow.fitView({ padding: 0.2, maxZoom: 1, duration: 350 }), 60);
    return () => window.clearTimeout(timer);
  }, [view.layout, structure.id, view.focusDepth, view.hiddenEntityTypeIds, flow]);

  const visibleIds = useMemo(() => {
    let ids = new Set(project.nodes.filter(n => !hiddenEntities.has(n.typeId)).map(n => n.id));
    if (view.focusDepth > 0 && selectedNodeId && ids.has(selectedNodeId)) {
      const near = neighborhood(selectedNodeId, links, view.focusDepth);
      ids = new Set([...ids].filter(id => near.has(id)));
    }
    return ids;
  }, [project.nodes, hiddenEntities, view.focusDepth, selectedNodeId, links]);

  const settings = useMemo(
    () => ({ avoidObstacles: project.nodes.length <= AVOID_OBSTACLES_LIMIT }),
    [project.nodes.length],
  );
  const container = useRef<HTMLElement>(null);

  const nodes = useMemo<CardNode[]>(() => {
    const degree = new Map<string, number>();
    project.relations.forEach(r => {
      degree.set(r.sourceId, (degree.get(r.sourceId) ?? 0) + 1);
      degree.set(r.targetId, (degree.get(r.targetId) ?? 0) + 1);
    });
    return project.nodes
      .filter(n => visibleIds.has(n.id))
      .map(n => {
        const schema = getSchema(project, n.typeId);
        return {
          id: n.id,
          type: 'card',
          position: overrides[n.id] ?? n.positions[view.layout] ?? autoPositions.get(n.id) ?? { x: 0, y: 0 },
          width: NODE_W,
          height: NODE_H,
          selected: selectedNodeId === n.id,
          data: {
            label: nodeLabel(project, n),
            typeName: schema?.name ?? 'Sin tipo',
            color: schema?.color ?? '#888',
            icon: schema?.icon ?? 'circle',
            degree: degree.get(n.id) ?? 0,
            incomplete: isIncomplete(project, n.typeId, n.values),
            pinned: Boolean(n.positions[view.layout]),
            image:
              allFields(project, n.typeId)
                .filter(f => f.type === 'image')
                .map(f => n.values[f.id])
                .find(isImageValue) ?? null,
          },
        };
      });
  }, [project, view.layout, visibleIds, overrides, autoPositions, selectedNodeId]);

  const edges = useMemo<FloatingEdgeType[]>(() => {
    const result: FloatingEdgeType[] = [];
    if (view.showHierarchy)
      structureLinks(project, null).forEach(l => {
        if (!visibleIds.has(l.parentId) || !visibleIds.has(l.childId)) return;
        result.push({
          id: `h-${l.childId}`,
          type: 'floating',
          source: l.parentId,
          target: l.childId,
          selectable: false,
          data: { kind: 'hierarchy', index: 0, count: 1 },
        });
      });
    const pairs = new Map<string, string[]>();
    // En Genealogía, progenitores y parejas se dibujan como conectores de familia, no como flechas.
    const genealogyId = view.layout === 'genealogy' ? genealogyStructure(project, structure.id) : null;
    const asFamily = (r: Relation) =>
      r.typeId === genealogyId &&
      Boolean(kinshipStructureLink(project, r) || kinshipTerm(project, r.kinshipId)?.couple);
    const shown = project.relations.filter(
      r => !hiddenRelations.has(r.typeId) && visibleIds.has(r.sourceId) && visibleIds.has(r.targetId) && !asFamily(r),
    );
    const shownRefs = refLinks.filter(l => visibleIds.has(l.sourceId) && visibleIds.has(l.targetId));
    const refId = (l: (typeof shownRefs)[number]) => `ref-${l.fieldId}-${l.sourceId}-${l.targetId}`;
    shown.forEach(r => {
      const key = [r.sourceId, r.targetId].sort().join('|');
      pairs.set(key, [...(pairs.get(key) ?? []), r.id]);
    });
    shownRefs.forEach(l => {
      const key = [l.sourceId, l.targetId].sort().join('|');
      pairs.set(key, [...(pairs.get(key) ?? []), refId(l)]);
    });
    // Aristas que salen del mismo nodo: sus etiquetas se reparten a lo largo de la línea para no solaparse.
    const bySource = new Map<string, string[]>();
    shown.forEach(r => bySource.set(r.sourceId, [...(bySource.get(r.sourceId) ?? []), r.id]));
    const labelT = (sourceId: string, id: string) => {
      const siblings = bySource.get(sourceId) ?? [id];
      if (siblings.length < 2) return 0.5;
      const i = siblings.indexOf(id);
      return 0.3 + (0.4 * i) / (siblings.length - 1);
    };
    shownRefs.forEach(l => {
      const field = refFields.get(l.fieldId);
      const targetSchema = getSchema(project, getNode(project, l.targetId)?.typeId ?? '');
      const group = pairs.get([l.sourceId, l.targetId].sort().join('|')) ?? [refId(l)];
      result.push({
        id: refId(l),
        type: 'floating',
        source: l.sourceId,
        target: l.targetId,
        selectable: false,
        data: {
          kind: 'reference',
          label: field?.name ?? 'Referencia',
          named: false,
          color: targetSchema?.color ?? '#888',
          index: group.indexOf(refId(l)),
          count: group.length,
          onSelect: () => onSelect({ kind: 'node', id: l.sourceId }),
        },
      });
    });
    shown.forEach(r => {
      const schema = getSchema(project, r.typeId);
      const group = pairs.get([r.sourceId, r.targetId].sort().join('|')) ?? [r.id];
      const color = schema?.color ?? '#888';
      result.push({
        id: r.id,
        type: 'floating',
        source: r.sourceId,
        target: r.targetId,
        selected: selection?.kind === 'relation' && selection.id === r.id,
        markerEnd: schema?.directed ? { type: MarkerType.ArrowClosed, color, width: 16, height: 16 } : undefined,
        markerStart:
          schema?.directed && (schema.reciprocal || schema.genealogical)
            ? { type: MarkerType.ArrowClosed, color, width: 16, height: 16 }
            : undefined,
        data: {
          kind: 'relation',
          label: relationRole(project, r, 'source'),
          labelFromTarget: relationRole(project, r, 'target'),
          named: ownTitle(project, r) !== undefined,
          color,
          relationStyle: schema?.relationStyle,
          index: group.indexOf(r.id),
          count: group.length,
          labelT: labelT(r.sourceId, r.id),
          straight: view.layout === 'genealogy' && schema?.genealogical && Boolean(kinshipStructureLink(project, r)),
          onSelect: () => onSelect({ kind: 'relation', id: r.id }),
        },
      });
    });
    return result;
  }, [
    project,
    view.showHierarchy,
    view.layout,
    structure.id,
    visibleIds,
    hiddenRelations,
    selection,
    onSelect,
    refLinks,
    refFields,
  ]);

  // Conectores de familia (solo en Genealogía): siguen a los nodos mientras se arrastran.
  const family = useMemo(() => {
    if (view.layout !== 'genealogy') return null;
    const genealogyId = genealogyStructure(project, structure.id);
    const schema = genealogyId ? getSchema(project, genealogyId) : undefined;
    if (!schema?.genealogical || hiddenRelations.has(schema.id)) return null;
    const positions = new Map(nodes.map(n => [n.id, n.position]));
    const units = familyUnits(project, genealogyId)
      .map(u => ({
        parents: u.parents.filter(id => positions.has(id)),
        children: u.children.filter(id => positions.has(id)),
      }))
      .filter(u => u.parents.length);
    return { units, positions, color: schema.color };
  }, [view.layout, project, structure.id, hiddenRelations, nodes]);

  // Al pasar el ratón por un nodo se atenúa lo que no sea vecino. Se hace sobre el DOM, sin
  // volver a renderizar los componentes: con cientos de nodos y miles de aristas eso costaría casi un segundo.
  useEffect(() => {
    const root = container.current;
    if (!root) return;
    const near = hoveredId ? neighborhood(hoveredId, links, 1) : null;
    const ends = new Map(edges.map(e => [e.id, [e.source, e.target]]));
    root.querySelectorAll<HTMLElement>('.react-flow__node').forEach(el => {
      el.classList.toggle('dimmed', Boolean(near && !near.has(el.dataset.id ?? '')));
    });
    root.querySelectorAll<SVGElement>('.family-link').forEach(el => {
      const members = (el.dataset.members ?? '').split(',');
      el.classList.toggle('dimmed', Boolean(hoveredId && !members.includes(hoveredId)));
    });
    root.querySelectorAll<HTMLElement>('.react-flow__edge, .edge-label').forEach(el => {
      const id = el.dataset.id ?? el.dataset.edge ?? '';
      const [a, b] = ends.get(id) ?? [];
      el.classList.toggle('dimmed', Boolean(hoveredId && a !== hoveredId && b !== hoveredId));
      el.classList.toggle('lit', Boolean(hoveredId && (a === hoveredId || b === hoveredId)));
      // En una relación bidireccional, al pasar por un nodo se oculta la punta de su lado:
      // la flecha que queda apunta al otro extremo, como el nombre que se muestra.
      if (el.dataset.id) {
        const path = el.querySelector('path.react-flow__edge-path');
        const reciprocal = Boolean(path?.getAttribute('marker-start') && path?.getAttribute('marker-end'));
        el.classList.toggle('hide-start', reciprocal && hoveredId === a);
        el.classList.toggle('hide-end', reciprocal && hoveredId === b && a !== b);
      }
      // El texto de la arista es el papel del otro extremo respecto al nodo bajo el puntero.
      if (el.dataset.edge) {
        const fromTarget = hoveredId === a && b !== a;
        el.textContent = fromTarget ? (el.dataset.roleTarget ?? '') : (el.dataset.roleSource ?? '');
      }
    });
  }, [hoveredId, links, edges]);

  const onNodeClick = useCallback((_: unknown, n: { id: string }) => onSelect({ kind: 'node', id: n.id }), [onSelect]);
  const onEdgeClick = useCallback(
    (_: unknown, e: Edge) => e.data?.kind === 'relation' && onSelect({ kind: 'relation', id: e.id }),
    [onSelect],
  );
  const onPaneClick = useCallback(() => onSelect(null), [onSelect]);
  const onNodeMouseEnter = useCallback((_: unknown, n: { id: string }) => setHoveredId(n.id), []);
  const onNodeMouseLeave = useCallback(() => setHoveredId(null), []);
  const minimapColor = useCallback((n: { data: Record<string, unknown> }) => String(n.data.color ?? '#888'), []);

  const onNodesChange = useCallback((changes: NodeChange<CardNode>[]) => {
    const moved: Record<string, Position> = {};
    changes.forEach(c => {
      if (c.type === 'position' && c.position) moved[c.id] = c.position;
    });
    if (Object.keys(moved).length) setOverrides(current => ({ ...current, ...moved }));
  }, []);

  const onNodeDragStop: OnNodeDrag<CardNode> = useCallback(
    (_, __, dragged) => {
      const positions: Record<string, Position> = {};
      dragged.forEach(n => (positions[n.id] = n.position));
      dispatch({ type: 'move-nodes', positions });
      setOverrides({});
    },
    [dispatch],
  );

  const onConnectEnd: OnConnectEnd = useCallback(
    (event, state) => {
      const from = state.fromNode?.id;
      const to = state.toNode?.id;
      if (!state.isValid || !from || !to || from === to) return;
      const point = 'clientX' in event ? event : event.changedTouches[0];
      onConnectNodes(from, to, pointAnchor(point.clientX, point.clientY));
    },
    [onConnectNodes],
  );

  const onDoubleClick = (event: MouseEvent<HTMLDivElement>) => {
    if (!(event.target as Element).closest('.react-flow__pane')) return;
    const p = flow.screenToFlowPosition({ x: event.clientX, y: event.clientY });
    onAddNode(pointAnchor(event.clientX, event.clientY), { x: p.x - NODE_W / 2, y: p.y - NODE_H / 2 });
  };

  const resetPositions = () => {
    const positions: Record<string, null> = {};
    project.nodes.forEach(n => (positions[n.id] = null));
    toast({ message: 'Posiciones de esta disposición restablecidas a la automática', undoable: true });
    dispatch({ type: 'move-nodes', positions });
    window.setTimeout(() => flow.fitView({ padding: 0.2, duration: 300 }), 50);
  };

  const setView = (patch: Partial<Project['view']>) => dispatch({ type: 'update-view', view: patch });
  const pinnedCount = project.nodes.filter(n => n.positions[view.layout]).length;
  const selectedNode = selectedNodeId ? getNode(project, selectedNodeId) : undefined;

  if (!project.nodes.length)
    return (
      <section className="workspace">
        <EmptyState icon={Network} title="Un lienzo para tu mundo">
          Aquí verás tus personajes, lugares y todo lo que los une. Primero define en «Tipos» qué clase de cosas existen
          (Personaje, Ciudad, Deidad…) y en «Relaciones» cómo se conectan; después crea el primer nodo con el botón «+»
          de la estructura o con doble clic aquí. Para aprender los atajos, pulsa «?».
        </EmptyState>
        <div className="react-flow-empty" onDoubleClick={onDoubleClick} />
      </section>
    );

  return (
    <CanvasSettingsContext.Provider value={settings}>
      <section ref={container} className="workspace flow" data-labels={view.edgeLabels} onDoubleClick={onDoubleClick}>
        <div className="workspace-toolbar flow-toolbar">
          <LensMenu />
          <div className="segmented labeled" role="group" aria-label="Disposición">
            <span className="segmented-label">Disposición</span>
            {LAYOUTS.map(({ mode, label, icon: Icon, hint }) => (
              <button
                key={mode}
                type="button"
                aria-pressed={view.layout === mode}
                aria-disabled={mode === 'radial' && !selectedNode ? true : undefined}
                className={mode === 'radial' && !selectedNode ? 'looks-disabled' : undefined}
                data-tooltip={
                  mode === 'radial' && !selectedNode
                    ? 'Vista radial: coloca un nodo en el centro y el resto en anillos según los saltos de distancia. Selecciona primero un nodo para centrarla en él.'
                    : hint
                }
                data-tooltip-wide
                onClick={() => {
                  if (mode === 'radial' && !selectedNode) {
                    toast({ message: 'Selecciona un nodo para centrar en él la vista radial.' });
                    return;
                  }
                  setView({ layout: mode });
                }}
              >
                <Icon size={14} aria-hidden />
                <span className="label">{label}</span>
              </button>
            ))}
          </div>
          <div className="segmented labeled" role="group" aria-label="Modo foco">
            <span
              className="segmented-label"
              title="Con un nodo seleccionado, muestra solo lo que está a 1, 2 o 3 saltos"
            >
              Foco
            </span>
            <button
              type="button"
              aria-pressed={view.focusDepth === 0}
              title="Mostrar todos los nodos"
              onClick={() => setView({ focusDepth: 0 })}
            >
              <Crosshair size={14} aria-hidden />
              <span className="label">Todo</span>
            </button>
            {[1, 2, 3].map(depth => (
              <button
                key={depth}
                type="button"
                aria-pressed={view.focusDepth === depth}
                disabled={!selectedNode}
                title={
                  selectedNode
                    ? `Solo los nodos a ${depth} ${depth === 1 ? 'salto' : 'saltos'} de «${nodeLabel(project, selectedNode)}»`
                    : 'Selecciona un nodo para usar el modo foco'
                }
                onClick={() => setView({ focusDepth: depth })}
              >
                {depth}
              </button>
            ))}
          </div>
          <Button
            size="sm"
            variant="ghost"
            disabled={!pinnedCount}
            title="Soltar todos los nodos fijados"
            onClick={resetPositions}
          >
            Recolocar{pinnedCount ? ` (${pinnedCount})` : ''}
          </Button>
          <IconButton
            icon={Tag}
            label={
              view.edgeLabels === 'always'
                ? 'Etiquetas: siempre (pulsa para mostrarlas solo al pasar el ratón)'
                : view.edgeLabels === 'hover'
                  ? 'Etiquetas: al pasar el ratón (pulsa para ocultarlas)'
                  : 'Etiquetas: ocultas (pulsa para mostrarlas siempre)'
            }
            active={view.edgeLabels !== 'always'}
            onClick={() =>
              setView({
                edgeLabels: view.edgeLabels === 'always' ? 'hover' : view.edgeLabels === 'hover' ? 'never' : 'always',
              })
            }
          />
          <IconButton
            icon={SlidersHorizontal}
            label="Leyenda y filtros"
            active={legendOpen}
            onClick={() => setLegendOpen(v => !v)}
          />
          <span className="flow-counts">
            <span className="badge">
              {nodes.length}
              {nodes.length !== project.nodes.length ? ` de ${project.nodes.length}` : ''} nodos
            </span>
            <span className="badge">{edges.filter(e => e.data?.kind === 'relation').length} relaciones</span>
          </span>
        </div>
        <ReactFlow
          nodes={nodes}
          edges={edges as Edge[]}
          nodeTypes={nodeTypes}
          edgeTypes={edgeTypes}
          onNodesChange={onNodesChange}
          onNodeDragStop={onNodeDragStop}
          onNodeClick={onNodeClick}
          onEdgeClick={onEdgeClick}
          onPaneClick={onPaneClick}
          onNodeMouseEnter={onNodeMouseEnter}
          onNodeMouseLeave={onNodeMouseLeave}
          onConnectEnd={onConnectEnd}
          connectionMode={ConnectionMode.Loose}
          connectionRadius={30}
          fitView
          fitViewOptions={fitViewOptions}
          minZoom={0.1}
          maxZoom={2.5}
          zoomOnDoubleClick={false}
          selectNodesOnDrag={false}
          nodesConnectable
          elevateNodesOnSelect
          deleteKeyCode={null}
          multiSelectionKeyCode={null}
          proOptions={proOptions}
        >
          <Background variant={BackgroundVariant.Dots} gap={22} size={1.2} color="var(--canvas-dot)" />
          {family && <FamilyLinks units={family.units} positions={family.positions} color={family.color} />}
          {legendOpen && (
            <Panel position="top-right">
              <LegendPanel onClose={() => setLegendOpen(false)} />
            </Panel>
          )}
          <Controls position="bottom-left" showInteractive={false} />
          <MiniMap
            position="bottom-right"
            style={{ width: 150, height: 100 }}
            pannable
            zoomable
            nodeColor={minimapColor}
            nodeStrokeWidth={0}
            maskColor="var(--scrim)"
          />
        </ReactFlow>
      </section>
    </CanvasSettingsContext.Provider>
  );
}
