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
  useStore,
  type Edge,
  type NodeChange,
  type OnConnectEnd,
  type OnNodeDrag,
} from '@xyflow/react';
import {
  Crosshair,
  GitBranch,
  LayoutGrid,
  Map as MapIcon,
  Network,
  Orbit,
  Palette,
  Route,
  Scaling,
  SlidersHorizontal,
  Sparkles,
  Tag,
  LocateFixed,
  Database,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState, type MouseEvent } from 'react';
import { allFields, getNode, getSchema, nodeLabel, ownTitle, relationRole } from '../../domain/selectors';
import { usePreferences } from '../../state/preferences';
import { referenceFields, referenceLinks } from '../../domain/references';
import { passesTagFilter } from '../../domain/tagFilter';
import {
  impliedKinship,
  isImpliedKinship,
  kinshipConflicts,
  kinshipRoles,
  kinshipStructureLink,
  kinshipTerm,
} from '../../domain/kinship';
import { isIncomplete } from '../../domain/health';
import { viewForLayout, viewAfterIsolation } from '../../domain/layoutFilters';
import { resolveStructure, structureLinks } from '../../domain/structure';
import type { FieldDefinition, LayoutMode, Position, Project, Selection, Relation } from '../../domain/types';
import { useApp } from '../../state/AppContext';
import { useProjectAccess } from '../../state/groups';
import { useNavigation } from '../../state/navigation';
import { pointAnchor, type Anchor } from '../common/anchor';
import { Button, IconButton } from '../common/Button';
import { EmptyState } from '../common/EmptyState';
import { useToast } from '../common/toasts';
import { FloatingEdge, type FloatingEdgeType } from './FloatingEdge';
import { CanvasSettingsContext } from './canvasSettings';
import { FallingPins, type FallingPin } from './FallingPins';
import { ExportMenu } from './ExportMenu';
import { FamilyLinks } from './FamilyLinks';
import { MapClusters, type MapCluster } from './MapClusters';
import { MapImageLayer } from './MapImageLayer';
import { MapImageMenu, MapScaleControl } from './MapImageMenu';
import { MapTray, TRAY_DRAG_TYPE } from './MapTray';
import { cardContent, cardHeight } from './cardLines';
import { edgeSlots } from './edgeSlots';
import { autoLayout, familyUnits, genealogyStructure, NODE_H, NODE_W, type Link } from './layout';
import { LegendPanel } from './LegendPanel';
import { PathPanel, type PathQuery } from './PathPanel';
import { pathPairs, shortestPath } from '../../domain/paths';
import { betweenness } from '../../domain/centrality';
import { communityIndex } from '../../domain/communities';
import { COLORS } from '../../domain/constants';
import { LensMenu } from './LensMenu';
import { imageClasses, nodePortrait } from '../../domain/portrait';
import { NodeCard, type CardNode } from './NodeCard';
import { forceFrameAfterMove, forceFrameKey } from './forceFrame';
import {
  databaseLinks,
  databaseTypes,
  engineLabel,
  engineOf,
  isDatabaseType,
  isEmbeddedType,
  projectEngines,
  tableTypes,
} from '../../domain/database';

/** Qué es el nodo en su base, para la cabecera de la tarjeta (solo si no es una tabla corriente). */
function containerOf(p: Project, typeId: string): string | undefined {
  if (isEmbeddedType(p, typeId)) return 'subdocumento';
  return undefined;
}
import { ForeignKeyEdge, type ForeignKeyEdgeType } from './ForeignKeyEdge';
import { tableCardColumns, tableHeight, tableWidth } from './tableCard';
import { sqlScript } from '../../domain/sqlScript';
import { openDb2Export } from '../layout/openDialogs';
import { vocabulary } from '../../domain/projectKinds';
import { fileSafeName } from '../../domain/text';
import { downloadText } from '../../services/files';
import { openSchemaDefinition } from '../layout/schemaNavigation';
import { BulkBar } from '../table/BulkBar';
import { useRemoveNodes } from '../table/useRemoveNodes';
import { isTypingTarget } from '../common/keyboard';

const nodeTypes = { card: NodeCard };
const fitViewOptions = { padding: 0.2, maxZoom: 1 };
const proOptions = { hideAttribution: true };
/** Por encima de este tamaño las aristas dejan de esquivar tarjetas: el coste crece con nodos × relaciones. */
const AVOID_OBSTACLES_LIMIT = 200;
/** Lado del marcador compacto sobre la imagen del mapa. */
const MARKER = 44;
const edgeTypes = { floating: FloatingEdge, foreignKey: ForeignKeyEdge };

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
  {
    mode: 'image',
    label: 'Mapa',
    icon: MapIcon,
    hint: 'Tu imagen de fondo (un plano o mapa) con los nodos colocados a mano sobre ella',
  },
  {
    mode: 'database',
    label: 'Base de datos',
    icon: Database,
    hint: 'Las tablas, colecciones y etiquetas de tus bases (SQL Server, Db2 for i, MongoDB, Firestore, Neo4j) con sus campos y referencias, en un solo diagrama; los demás nodos, debajo',
  },
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

function Canvas({ selection, onSelect, onAddNode, onConnectNodes, revealKey }: FlowCanvasProps) {
  const { project, dispatch } = useApp();
  const { canEdit } = useProjectAccess();
  const toast = useToast();
  const flow = useReactFlow();
  const { view } = project;
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [overrides, setOverrides] = useState<Record<string, Position>>({});
  // Posiciones visibles antes y después de un arrastre en Fuerzas. No convierten el resto en anclajes.
  const [forceFrames, setForceFrames] = useState<Map<string, Map<string, Position>>>(() => new Map());
  const { preferences, setPreference } = usePreferences();
  // Cada disposición recuerda (por proyecto, en este navegador) sus filtros y si la leyenda está abierta.
  const remembered = preferences.layouts[project.id]?.[view.layout];
  const [legendOpen, setLegendOpen] = useState(() => remembered?.legendOpen ?? view.layout === 'genealogy');
  useEffect(() => {
    setLegendOpen(preferences.layouts[project.id]?.[view.layout]?.legendOpen ?? view.layout === 'genealogy');
    // eslint-disable-next-line react-hooks/exhaustive-deps -- solo al cambiar de proyecto
  }, [project.id]);
  const genealogySchemas = useMemo(
    () => project.schemas.filter(s => s.kind === 'relationship' && s.genealogical),
    [project.schemas],
  );
  const selectedNodeId = selection?.kind === 'node' ? selection.id : null;
  // Nodo aislado: el foco se fija en él (no sigue a la selección) y solo se ven sus vecinos.
  const { isolated, clearIsolation, getMapViewport, rememberMapViewport, setView: navigate } = useNavigation();
  const [savedViewport] = useState(() => getMapViewport(project.id));
  const isolatedNode = isolated ? getNode(project, isolated.nodeId) : undefined;
  const focusId = isolatedNode ? isolatedNode.id : view.focusDepth > 0 ? selectedNodeId : null;
  const focusDepth = isolatedNode ? Math.max(1, view.focusDepth) : view.focusDepth;
  const structure = resolveStructure(project, view.structureId);
  const frameKey = JSON.stringify([
    view.layout,
    structure.id,
    view.focusDepth,
    view.hiddenEntityTypeIds,
    view.tagFilter,
    isolated?.nodeId ?? null,
  ]);
  const lastFrameKey = useRef(savedViewport?.frameKey);
  const lastRevealKey = useRef(savedViewport?.revealKey ?? 0);
  const lastImage = useRef(savedViewport ? { layout: savedViewport.layout, image: savedViewport.mapImage } : null);

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
  // Camino entre dos nodos: mientras está abierto, el lienzo atenúa todo lo que no forme parte de él.
  const [pathQuery, setPathQuery] = useState<PathQuery | null>(null);
  const path = useMemo(
    () => (pathQuery?.from && pathQuery.to ? shortestPath(links, pathQuery.from, pathQuery.to) : undefined),
    [pathQuery, links],
  );

  // Nodos con posición manual: la disposición por fuerzas los respeta y acomoda el resto alrededor.
  const fixed = useMemo(
    () =>
      new Map(project.nodes.filter(n => n.positions[view.layout]).map(n => [n.id, n.positions[view.layout]!] as const)),
    [project.nodes, view.layout],
  );
  // Las disposiciones separan las filas según la tarjeta más alta del proyecto.
  const maxCardHeight = useMemo(
    () => Math.max(NODE_H, ...project.nodes.map(n => cardHeight(cardContent(project, n).lines.length))),
    [project],
  );
  // Selección múltiple (Ctrl/Cmd+clic o Mayús+arrastre): las tarjetas marcadas se mueven juntas y la
  // barra opera con todas. Con menos de dos manda la selección normal, la del inspector.
  const [picked, setPicked] = useState<string[]>([]);
  const visibleIds = useMemo(() => {
    let ids = new Set(
      project.nodes
        .filter(n => !hiddenEntities.has(n.typeId) && passesTagFilter(project, n, view.tagFilter))
        .map(n => n.id),
    );
    if (focusId && focusDepth > 0 && ids.has(focusId)) {
      const near = neighborhood(focusId, links, focusDepth);
      ids = new Set([...ids].filter(id => near.has(id)));
    }
    return ids;
  }, [project, hiddenEntities, view.tagFilter, focusDepth, focusId, links]);

  const pickedSet = useMemo(() => new Set(picked.filter(id => visibleIds.has(id))), [picked, visibleIds]);
  const multi = pickedSet.size >= 2;
  const pickedFields = useMemo(() => {
    const byId = new Map<string, FieldDefinition>();
    for (const id of pickedSet) {
      const node = getNode(project, id);
      if (node) allFields(project, node.typeId).forEach(f => byId.set(f.id, f));
    }
    return [...byId.values()];
  }, [project, pickedSet]);

  // La disposición solo cuenta lo visible: un nodo oculto no reserva sitio ni separa a los demás, y al
  // mostrar u ocultar tipos (o cambiar el foco) todo se redistribuye con lo que queda.
  const layoutProject = useMemo<Project>(
    () => ({
      ...project,
      nodes: project.nodes.filter(n => visibleIds.has(n.id)),
      relations: project.relations.filter(r => visibleIds.has(r.sourceId) && visibleIds.has(r.targetId)),
    }),
    [project, visibleIds],
  );
  const layoutLinks = useMemo(() => links.filter(l => visibleIds.has(l.a) && visibleIds.has(l.b)), [links, visibleIds]);
  // La disposición automática solo depende de la forma del grafo, no de los valores de los nodos.
  const layoutShapeKey = JSON.stringify([
    project.id,
    view.layout,
    structure.id,
    view.layout === 'radial' ? selectedNodeId : null,
    view.layout === 'image' ? (project.mapImage?.height ?? 0) * (project.mapImage?.scale ?? 1) : null,
    view.layout === 'genealogy' ? structureLinks(layoutProject, genealogyStructure(layoutProject, structure.id)) : null,
    maxCardHeight,
    view.layout === 'tree' ? view.looseNearLinks : null,
    layoutProject.nodes.map(n => [n.id, n.typeId, n.parentId]),
    layoutLinks,
    // Cambiar el tipo o el parentesco de una relación altera la estructura sin cambiar sus extremos.
    structureLinks(layoutProject, structure.id),
  ]);
  const layoutKey =
    view.layout === 'force'
      ? forceFrameKey(layoutShapeKey, fixed)
      : JSON.stringify([layoutShapeKey, view.layout === 'image' ? [...fixed] : null]);
  const autoPositions = useMemo(
    () =>
      (view.layout === 'force' ? forceFrames.get(layoutKey) : undefined) ??
      autoLayout(layoutProject, view.layout, structure.id, layoutLinks, selectedNodeId, fixed, maxCardHeight, {
        looseNearLinks: view.looseNearLinks,
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- la clave resume todas las entradas relevantes
    [layoutKey, forceFrames],
  );
  const rememberForceFrame = useCallback((key: string, positions: Map<string, Position>) => {
    setForceFrames(current => {
      const next = new Map(current);
      next.delete(key);
      next.set(key, positions);
      // Memoria visual de esta sesión, acotada igual que el historial de ediciones.
      if (next.size > 100) next.delete(next.keys().next().value!);
      return next;
    });
  }, []);
  // Disposición «Base de datos»: los nodos de tipos tabla se dibujan como tablas y sus referencias a
  // otras tablas como claves foráneas (`src/domain/database.ts`).
  // La disposición «Base de datos» es común a todos los motores (SQL Server, Db2 for i, MongoDB, Firestore, Neo4j).
  const hasTables = useMemo(() => databaseTypes(project).length > 0, [project]);
  const databaseMode = view.layout === 'database';
  const keyLinks = useMemo(() => (databaseMode ? databaseLinks(project) : []), [databaseMode, project]);
  // Con más de un motor, cada tarjeta dice el suyo.
  const mixedEngines = useMemo(() => projectEngines(project).size > 1, [project]);
  const keyFields = useMemo(() => {
    const result = new Map<string, Set<string>>();
    keyLinks.forEach(l => result.set(l.sourceId, (result.get(l.sourceId) ?? new Set()).add(l.fieldId)));
    return result;
  }, [keyLinks]);

  // Al navegar a un elemento (árbol, conexiones, buscador) se centra en el lienzo.
  useEffect(() => {
    if (lastRevealKey.current === revealKey) return;
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
      () => {
        lastRevealKey.current = revealKey;
        void flow.fitView({ nodes: ids.map(id => ({ id })), padding: 0.6, maxZoom: 1, duration: 350 });
      },
      // El inspector puede estar abriéndose y cambiando el ancho del lienzo.
      160,
    );
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- solo cuando se pide centrar
  }, [revealKey]);

  // En «Mapa», al entrar o al cambiar la imagen se encuadran la imagen y la bandeja de nodos sin colocar.
  useEffect(() => {
    if (lastImage.current?.layout === view.layout && lastImage.current.image === project.mapImage) return;
    if (view.layout !== 'image' || !project.mapImage) {
      lastImage.current = null;
      return;
    }
    const { width, height, scale } = project.mapImage;
    const timer = window.setTimeout(() => {
      lastImage.current = { layout: view.layout, image: project.mapImage };
      void flow.fitBounds(
        { x: 0, y: 0, width: width * scale, height: height * scale + 220 },
        { padding: 0.04, duration: 350 },
      );
    }, 80);
    return () => window.clearTimeout(timer);
  }, [view.layout, project.mapImage, flow]);

  // Al cambiar de disposición o de estructura, se vuelve a encuadrar el conjunto.
  useEffect(() => {
    if (lastFrameKey.current === frameKey) return;
    const timer = window.setTimeout(() => {
      lastFrameKey.current = frameKey;
      void flow.fitView({ padding: 0.2, maxZoom: 1, duration: 350 });
    }, 60);
    return () => window.clearTimeout(timer);
  }, [frameKey, flow]);

  const settings = useMemo(
    () => ({ avoidObstacles: project.nodes.length <= AVOID_OBSTACLES_LIMIT }),
    [project.nodes.length],
  );
  const container = useRef<HTMLElement>(null);
  const pointerPosition = useRef<{ x: number; y: number } | null>(null);
  const syncHover = useCallback(() => {
    const point = pointerPosition.current;
    const root = container.current;
    const target = point ? document.elementFromPoint(point.x, point.y) : null;
    const node = target && root?.contains(target) ? target.closest<HTMLElement>('.react-flow__node') : null;
    setHoveredId(node?.dataset.id ?? null);
  }, []);
  // Chinchetas arrancadas que caen por el lienzo.
  const [fallingPins, setFallingPins] = useState<FallingPin[]>([]);
  const [bounds, setBounds] = useState({ width: 0, height: 0 });
  useEffect(() => {
    const el = container.current;
    if (!el) return;
    const measure = () => setBounds({ width: el.clientWidth, height: el.clientHeight });
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  const unpin = useCallback(
    (id: string, origin: { x: number; y: number }) => {
      const rect = container.current?.getBoundingClientRect();
      if (rect)
        setFallingPins(pins => [
          ...pins,
          { id: Date.now() + Math.random(), x: origin.x - rect.left - 15, y: origin.y - rect.top - 19 },
        ]);
      dispatch({ type: 'move-nodes', positions: { [id]: null } });
    },
    [dispatch],
  );

  // Zoom actual (en cuantos de 0,05 por debajo de 0,7) para agrupar marcadores que se amontonan al alejar.
  const zoomBucket = useStore(s =>
    view.layout === 'image' && s.transform[2] < 0.7 ? Math.max(0.05, Math.round(s.transform[2] * 20) / 20) : 1,
  );
  const clusters = useMemo<MapCluster[]>(() => {
    if (view.layout !== 'image' || zoomBucket >= 0.7) return [];
    // Agrupación por distancia en pantalla: cada marcador se une al grupo cuyo centro tenga a menos
    // de ~36 px (en coordenadas del lienzo, 36 / zoom). Al alejar, el radio crece y solo puede agrupar más.
    const radius = 36 / zoomBucket;
    const placed = project.nodes
      .filter(n => n.positions.image && visibleIds.has(n.id))
      .map(n => ({ n, x: n.positions.image!.x + MARKER / 2, y: n.positions.image!.y + MARKER / 2 }))
      .sort((p, q) => p.x - q.x || p.y - q.y || p.n.id.localeCompare(q.n.id));
    const groups: { x: number; y: number; items: typeof placed }[] = [];
    placed.forEach(item => {
      let best: (typeof groups)[number] | null = null;
      let bestDistance = radius;
      groups.forEach(g => {
        const d = Math.hypot(g.x - item.x, g.y - item.y);
        if (d < bestDistance) {
          best = g;
          bestDistance = d;
        }
      });
      if (best) {
        const g: (typeof groups)[number] = best;
        g.items.push(item);
        g.x = g.items.reduce((s, i) => s + i.x, 0) / g.items.length;
        g.y = g.items.reduce((s, i) => s + i.y, 0) / g.items.length;
      } else groups.push({ x: item.x, y: item.y, items: [item] });
    });
    return groups
      .filter(g => g.items.length > 1)
      .map(g => ({
        id: g.items.map(i => i.n.id).join('|'),
        x: g.x,
        y: g.y,
        members: g.items.map(i => ({
          id: i.n.id,
          label: nodeLabel(project, i.n),
          color: getSchema(project, i.n.typeId)?.color ?? '#888',
        })),
      }));
  }, [view.layout, zoomBucket, project, visibleIds]);
  const clustered = useMemo(() => new Set(clusters.flatMap(c => c.members.map(m => m.id))), [clusters]);

  // Sobre la imagen del mapa los nodos colocados son marcadores; el que está bajo el ratón se expande.
  const hoverOnMap = view.layout === 'image' ? hoveredId : null;
  // Escala de cada tarjeta según su intermediación (si está activado): entre 0,85 y 1,25.
  const scaleOf = useMemo(() => {
    if (!view.sizeByCentrality) return () => undefined;
    const score = betweenness(links);
    const max = Math.max(1, ...score.values());
    return (id: string) => 0.85 + 0.4 * Math.sqrt((score.get(id) ?? 0) / max);
  }, [view.sizeByCentrality, links]);
  // Color de cada tarjeta por comunidad (si está activado), sobre los vínculos visibles.
  const communityColor = useMemo(() => {
    if (!view.colorByCommunity) return () => undefined;
    const index = communityIndex(links);
    return (id: string) => {
      const i = index.get(id);
      return i === undefined ? undefined : COLORS[i % COLORS.length];
    };
  }, [view.colorByCommunity, links]);
  const nodes = useMemo<CardNode[]>(() => {
    const degree = new Map<string, number>();
    const compactIds = new Set(
      view.layout === 'image' ? project.nodes.filter(n => n.positions.image).map(n => n.id) : [],
    );
    // Caja de la tarjeta expandida (centrada en el marcador), para apartar a los marcadores que tape.
    const hovered = hoverOnMap && compactIds.has(hoverOnMap) ? project.nodes.find(n => n.id === hoverOnMap) : undefined;
    const hoveredPos = hovered ? (overrides[hovered.id] ?? hovered.positions.image!) : null;
    const hoveredH = hovered ? cardHeight(cardContent(project, hovered).lines.length) : 0;
    const expandOffset = { x: -(NODE_W - MARKER) / 2, y: -(hoveredH - MARKER) / 2 };
    const expandedBox = hoveredPos
      ? {
          x: hoveredPos.x + expandOffset.x - 10,
          y: hoveredPos.y + expandOffset.y - 10,
          w: NODE_W + 20,
          h: hoveredH + 20,
        }
      : null;
    const pushAway = (pos: Position): { x: number; y: number } | undefined => {
      if (!expandedBox) return undefined;
      const overlaps =
        pos.x < expandedBox.x + expandedBox.w &&
        pos.x + MARKER > expandedBox.x &&
        pos.y < expandedBox.y + expandedBox.h &&
        pos.y + MARKER > expandedBox.y;
      if (!overlaps) return undefined;
      const moves = [
        { x: expandedBox.x + expandedBox.w - pos.x, y: 0 },
        { x: expandedBox.x - (pos.x + MARKER), y: 0 },
        { x: 0, y: expandedBox.y + expandedBox.h - pos.y },
        { x: 0, y: expandedBox.y - (pos.y + MARKER) },
      ];
      return moves.reduce((best, m) => (Math.hypot(m.x, m.y) < Math.hypot(best.x, best.y) ? m : best));
    };
    project.relations.forEach(r => {
      degree.set(r.sourceId, (degree.get(r.sourceId) ?? 0) + 1);
      degree.set(r.targetId, (degree.get(r.targetId) ?? 0) + 1);
    });
    return project.nodes
      .filter(n => visibleIds.has(n.id) && (view.layout !== 'image' || n.positions.image))
      .map(n => {
        const schema = getSchema(project, n.typeId);
        const content = cardContent(project, n);
        const portrait = nodePortrait(project, n);
        const position = overrides[n.id] ?? n.positions[view.layout] ?? autoPositions.get(n.id) ?? { x: 0, y: 0 };
        const table =
          databaseMode && isDatabaseType(project, n.typeId)
            ? tableCardColumns(project, n, keyFields.get(n.id))
            : undefined;
        const engine = table ? engineOf(project, n.typeId) : null;
        const compact = compactIds.has(n.id);
        const expanded = compact && n.id === hoverOnMap;
        const fullHeight = cardHeight(content.lines.length);
        return {
          id: n.id,
          type: 'card',
          position,
          hidden: clustered.has(n.id) || undefined,
          width: table ? tableWidth(table.some(c => c.description)) : compact && !expanded ? MARKER : NODE_W,
          height: table ? tableHeight(table.length) : compact && !expanded ? MARKER : fullHeight,
          selected: pickedSet.size ? pickedSet.has(n.id) : selectedNodeId === n.id,
          data: {
            compact,
            expanded,
            cardHeight: fullHeight,
            offset: expanded ? expandOffset : compact ? pushAway(position) : undefined,
            label: nodeLabel(project, n),
            typeName: schema?.name ?? 'Sin tipo',
            color: communityColor(n.id) ?? schema?.color ?? '#888',
            icon: schema?.icon ?? 'circle',
            degree: degree.get(n.id) ?? 0,
            incomplete: isIncomplete(project, n),
            scale: scaleOf(n.id),
            pinned: Boolean(n.positions[view.layout]),
            onUnpin: (origin: { x: number; y: number }) => unpin(n.id, origin),
            image: portrait?.src ?? null,
            imageClass: portrait ? imageClasses(portrait) : undefined,
            badges: content.badges,
            lines: content.lines,
            table,
            // El motor en la cabecera: siempre si no es SQL Server, y en todas si el proyecto mezcla motores.
            engineTag: engine && (mixedEngines || engine !== 'sqlserver') ? engineLabel(engine) : undefined,
            container: engine ? containerOf(project, n.typeId) : undefined,
          },
        };
      });
  }, [
    project,
    view.layout,
    visibleIds,
    overrides,
    autoPositions,
    databaseMode,
    keyFields,
    mixedEngines,
    selectedNodeId,
    pickedSet,
    unpin,
    hoverOnMap,
    clustered,
    scaleOf,
    communityColor,
  ]);

  const edges = useMemo<(FloatingEdgeType | ForeignKeyEdgeType)[]>(() => {
    const result: (FloatingEdgeType | ForeignKeyEdgeType)[] = [];
    // Pares con alguna relación visible (o referencia): «Dentro de» sobra entre ellos si así se pide.
    const related = new Set<string>();
    if (view.hierarchyOnlyIfUnrelated) {
      project.relations
        .filter(r => !hiddenRelations.has(r.typeId))
        .forEach(r => related.add([r.sourceId, r.targetId].sort().join('|')));
      refLinks.forEach(l => related.add([l.sourceId, l.targetId].sort().join('|')));
    }
    if (view.showHierarchy)
      structureLinks(project, null).forEach(l => {
        if (!visibleIds.has(l.parentId) || !visibleIds.has(l.childId)) return;
        if (related.has([l.parentId, l.childId].sort().join('|'))) return;
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
    // En Genealogía, el parentesco se dibuja con conectores ortogonales (FamilyLinks), no como flechas.
    const genealogyId = view.layout === 'genealogy' ? genealogyStructure(project, structure.id) : null;
    const asFamily = (r: Relation) => r.typeId === genealogyId && getSchema(project, r.typeId)?.genealogical === true;
    const shown = project.relations.filter(
      r => !hiddenRelations.has(r.typeId) && visibleIds.has(r.sourceId) && visibleIds.has(r.targetId) && !asFamily(r),
    );
    const refId = (l: { fieldId: string; sourceId: string; targetId: string }) =>
      `ref-${l.fieldId}-${l.sourceId}-${l.targetId}`;
    // En «Base de datos», las referencias entre tablas se dibujan de fila a fila, como claves foráneas.
    const keyIds = new Set(keyLinks.map(refId));
    const visibleRefs = refLinks.filter(l => visibleIds.has(l.sourceId) && visibleIds.has(l.targetId));
    const shownRefs = visibleRefs.filter(l => !keyIds.has(refId(l)));
    const rows = new Map<string, string[]>();
    // La fila de un campo en su tarjeta; sin campo, la clave: la PK simple en SQL, el `_id` en MongoDB, o la cabecera.
    const rowOf = (nodeId: string, fieldId: string | null) => {
      const node = getNode(project, nodeId);
      const typeId = node?.typeId ?? '';
      if (!rows.has(typeId)) rows.set(typeId, node ? tableCardColumns(project, node).map(c => c.id) : []);
      const ids = rows.get(typeId)!;
      return fieldId ? ids.indexOf(fieldId) : ids[0] === '_id' ? 0 : -1;
    };
    const lanes = new Map<string, number>();
    const visibleRefIds = new Set(visibleRefs.map(refId));
    keyLinks
      .filter(k => visibleRefIds.has(refId(k)))
      .forEach(k => {
        const lane = lanes.get(k.targetId) ?? 0;
        lanes.set(k.targetId, lane + 1);
        const color = getSchema(project, getNode(project, k.targetId)?.typeId ?? '')?.color ?? '#888';
        // Cardinalidad: una FK UNIQUE (o que es por sí sola la clave primaria) es uno a uno; con nulos, opcional.
        const sourceNode = getNode(project, k.sourceId);
        const sourceColumns = sourceNode ? tableCardColumns(project, sourceNode) : [];
        const fk = sourceColumns.find(c => c.id === k.fieldId);
        const soleKey = Boolean(fk?.primaryKey) && sourceColumns.filter(c => c.primaryKey).length === 1;
        result.push({
          id: refId(k),
          type: 'foreignKey',
          source: k.sourceId,
          target: k.targetId,
          selectable: false,
          data: {
            kind: 'foreignKey',
            label: refFields.get(k.fieldId)?.name ?? 'Clave foránea',
            color,
            oneToOne: Boolean(fk?.unique) || soleKey,
            optional: Boolean(fk?.nullable) && !fk?.primaryKey,
            // Entre bases distintas la referencia la guarda la aplicación: se dibuja discontinua.
            crossEngine: k.crossEngine,
            sourceRow: rowOf(k.sourceId, k.fieldId),
            targetRow: rowOf(k.targetId, k.targetFieldId),
            // Alterna a un lado y otro del centro: 0, 1, −1, 2, −2…
            lane: lane % 2 ? (lane + 1) / 2 : -lane / 2,
          },
        });
      });
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
    view.hierarchyOnlyIfUnrelated,
    view.layout,
    structure.id,
    visibleIds,
    hiddenRelations,
    selection,
    onSelect,
    refLinks,
    refFields,
    keyLinks,
  ]);

  // Conectores de familia (solo en Genealogía): siguen a los nodos mientras se arrastran.
  const family = useMemo(() => {
    if (view.layout !== 'genealogy') return null;
    const genealogyId = genealogyStructure(project, structure.id);
    const schema = genealogyId ? getSchema(project, genealogyId) : undefined;
    if (!schema?.genealogical || hiddenRelations.has(schema.id)) return null;
    const positions = new Map(nodes.map(n => [n.id, { ...n.position, h: n.height }]));
    const units = familyUnits(project, genealogyId)
      .map(u => ({
        parents: u.parents.filter(id => positions.has(id)),
        children: u.children.filter(id => positions.has(id)),
      }))
      .filter(u => u.parents.length);
    // Parentesco que no forma familia ni se deduce del árbol (abuelos, tíos, primos y hermanos con
    // progenitores comunes se sobreentienden y no se dibujan).
    const implied = impliedKinship(project, schema.id);
    const conflicts = new Set(kinshipConflicts(project, schema.id).map(c => c.relation.id));
    const links = project.relations
      .filter(
        r =>
          r.typeId === genealogyId &&
          positions.has(r.sourceId) &&
          positions.has(r.targetId) &&
          !kinshipStructureLink(project, r) &&
          !kinshipTerm(project, r.kinshipId)?.couple &&
          !isImpliedKinship(implied, r, project),
      )
      .map(r => {
        const roles = kinshipRoles(project, r);
        const label = !roles ? '' : roles.source === roles.target ? roles.source : `${roles.source} · ${roles.target}`;
        return { key: r.id, a: r.sourceId, b: r.targetId, label, conflict: conflicts.has(r.id) };
      });
    return { units, links, positions, color: schema.color };
  }, [view.layout, project, structure.id, hiddenRelations, nodes]);

  // Lado y desplazamiento de cada extremo según las posiciones actuales (también durante el arrastre).
  const routedEdges = useMemo(() => {
    const boxes = new Map(
      nodes.map(n => [
        n.id,
        { x: n.position.x, y: n.position.y, width: n.width ?? NODE_W, height: n.height ?? NODE_H },
      ]),
    );
    const slots = edgeSlots(
      boxes,
      edges.filter(e => e.type === 'floating'),
    );
    return edges.map(e => (e.type === 'floating' ? { ...e, data: { ...e.data!, ends: slots.get(e.id) } } : e));
  }, [nodes, edges]);

  // Al pasar el ratón por un nodo se atenúa lo que no sea vecino. Se hace sobre el DOM, sin
  // volver a renderizar los componentes: con cientos de nodos y miles de aristas eso costaría casi un segundo.
  // El nodo seleccionado se queda resaltado igual, salvo mientras se ve un camino o se pasa por otro nodo.
  useEffect(() => {
    const root = container.current;
    if (!root) return;
    const lit = hoveredId ?? (path ? null : selectedNodeId);
    const pathNodes = !lit && path ? new Set(path) : null;
    const pairs = pathNodes && path ? pathPairs(path) : null;
    const near = lit ? neighborhood(lit, links, 1) : pathNodes;
    const ends = new Map(edges.map(e => [e.id, [e.source, e.target]]));
    root.querySelectorAll<HTMLElement>('.react-flow__node').forEach(el => {
      el.classList.toggle('dimmed', Boolean(near && !near.has(el.dataset.id ?? '')));
    });
    root.querySelectorAll<SVGElement>('.family-link, .family-kin').forEach(el => {
      const members = (el.dataset.members ?? '').split(',');
      el.classList.toggle(
        'dimmed',
        Boolean((lit && !members.includes(lit)) || (pathNodes && !members.some(m => pathNodes.has(m)))),
      );
    });
    root.querySelectorAll<HTMLElement>('.react-flow__edge, .edge-label').forEach(el => {
      const id = el.dataset.id ?? el.dataset.edge ?? '';
      const [a, b] = ends.get(id) ?? [];
      const onPath = Boolean(pairs && pairs.has(`${a}|${b}`));
      el.classList.toggle('dimmed', Boolean((lit && a !== lit && b !== lit) || (pairs && !onPath)));
      el.classList.toggle('lit', Boolean((lit && (a === lit || b === lit)) || onPath));
      // En una relación bidireccional, al pasar por un nodo se oculta la punta de su lado:
      // la flecha que queda apunta al otro extremo, como el nombre que se muestra.
      if (el.dataset.id) {
        const path = el.querySelector('path.react-flow__edge-path');
        const reciprocal = Boolean(path?.getAttribute('marker-start') && path?.getAttribute('marker-end'));
        el.classList.toggle('hide-start', reciprocal && lit === a);
        el.classList.toggle('hide-end', reciprocal && lit === b && a !== b);
      }
      // El texto de la arista es el papel del otro extremo respecto al nodo bajo el puntero.
      if (el.dataset.edge) {
        const fromTarget = lit === a && b !== a;
        el.textContent = fromTarget ? (el.dataset.roleTarget ?? '') : (el.dataset.roleSource ?? '');
      }
    });
  }, [hoveredId, selectedNodeId, links, edges, nodes, path]);

  const clickTimer = useRef<number | null>(null);
  useEffect(
    () => () => {
      if (clickTimer.current !== null) window.clearTimeout(clickTimer.current);
    },
    [],
  );
  const onNodeClick = useCallback(
    (event: MouseEvent, n: { id: string }) => {
      if (clickTimer.current !== null) window.clearTimeout(clickTimer.current);
      // Con Ctrl/Cmd el clic marca o desmarca la tarjeta sin cambiar el inspector; la primera vez
      // parte del nodo que ya estaba seleccionado.
      if (event.ctrlKey || event.metaKey) {
        setPicked(current => {
          const base = current.length ? current : selectedNodeId && selectedNodeId !== n.id ? [selectedNodeId] : [];
          return base.includes(n.id) ? base.filter(id => id !== n.id) : [...base, n.id];
        });
        return;
      }
      setPicked([]);
      // Abrir el inspector en el primer clic puede desplazar la tarjeta antes del segundo.
      clickTimer.current = window.setTimeout(() => onSelect({ kind: 'node', id: n.id }), 220);
    },
    [onSelect, selectedNodeId],
  );
  const onEdgeClick = useCallback(
    (_: unknown, e: Edge) => e.data?.kind === 'relation' && onSelect({ kind: 'relation', id: e.id }),
    [onSelect],
  );
  const onPaneClick = useCallback(() => {
    setPicked([]);
    onSelect(null);
  }, [onSelect]);
  const onNodeMouseEnter = useCallback((_: unknown, n: { id: string }) => setHoveredId(n.id), []);
  const onNodeMouseLeave = useCallback(() => setHoveredId(null), []);
  const minimapColor = useCallback((n: { data: Record<string, unknown> }) => String(n.data.color ?? '#888'), []);

  // Durante el recuadro (Mayús+arrastre) React Flow avisa de qué tarjetas quedan dentro; fuera de él sus
  // cambios de selección se ignoran: la selección la llevan el inspector y el Ctrl+clic.
  const boxSelecting = useRef(false);
  const onNodesChange = useCallback((changes: NodeChange<CardNode>[]) => {
    const moved: Record<string, Position> = {};
    const selects: { id: string; selected: boolean }[] = [];
    changes.forEach(c => {
      if (c.type === 'position' && c.position) moved[c.id] = c.position;
      if (c.type === 'select' && boxSelecting.current) selects.push(c);
    });
    if (Object.keys(moved).length) setOverrides(current => ({ ...current, ...moved }));
    if (selects.length)
      setPicked(current => {
        const next = new Set(current);
        selects.forEach(c => (c.selected ? next.add(c.id) : next.delete(c.id)));
        return [...next];
      });
  }, []);
  const removeNodes = useRemoveNodes();
  useEffect(() => {
    if (!pickedSet.size) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (isTypingTarget(event.target)) return;
      if (event.key === 'Escape') setPicked([]);
      else if (multi && (event.key === 'Delete' || event.key === 'Backspace')) {
        // Antes que el atajo del mapa, que borraría solo el nodo del inspector.
        event.preventDefault();
        event.stopPropagation();
        void removeNodes([...pickedSet]).then(done => done && setPicked([]));
      }
    };
    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, [multi, pickedSet, removeNodes]);

  const onNodeDragStop: OnNodeDrag<CardNode> = useCallback(
    (_, __, dragged) => {
      const positions: Record<string, Position> = {};
      dragged.forEach(n => (positions[n.id] = n.position));
      if (view.layout === 'force') {
        const frame = forceFrameAfterMove(
          layoutShapeKey,
          project,
          positions,
          new Map(flow.getNodes().map(n => [n.id, { ...n.position }])),
        );
        rememberForceFrame(frame.key, frame.positions);
      }
      dispatch({ type: 'move-nodes', positions });
      setOverrides({});
    },
    [dispatch, view.layout, project, flow, layoutShapeKey, rememberForceFrame],
  );
  const onNodeDragStart: OnNodeDrag<CardNode> = useCallback(() => {
    if (view.layout === 'force')
      rememberForceFrame(layoutKey, new Map(flow.getNodes().map(n => [n.id, { ...n.position }])));
  }, [view.layout, layoutKey, flow, rememberForceFrame]);

  // Un nodo puede moverse bajo un puntero inmóvil al liberar una chincheta, sin emitir mouseleave.
  useEffect(() => {
    const frame = requestAnimationFrame(syncHover);
    return () => cancelAnimationFrame(frame);
  }, [nodes, syncHover]);

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
    if (!(event.target as Element).closest('.react-flow__pane, .react-flow-empty')) return;
    if (!project.nodes.length) {
      onAddNode(pointAnchor(event.clientX, event.clientY), { x: 0, y: 0 });
      return;
    }
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

  // Al cambiar de disposición, los filtros de la actual se guardan en el proyecto y se aplican los de la
  // nueva (`src/domain/layoutFilters.ts`); la leyenda se recuerda por disposición en este navegador.
  const switchLayout = (mode: LayoutMode) => {
    if (mode === view.layout) return;
    const mine = preferences.layouts[project.id] ?? {};
    const nextLegend = mine[mode]?.legendOpen ?? mode === 'genealogy';
    setPreference('layouts', {
      ...preferences.layouts,
      [project.id]: { ...mine, [view.layout]: { legendOpen }, [mode]: { legendOpen: nextLegend } },
    });
    setLegendOpen(nextLegend);
    setView(viewForLayout(project, mode));
  };
  // Un tipo de relación genealógico nuevo (o uno ya existente al abrir el proyecto por primera vez)
  // se oculta una sola vez por defecto fuera de Genealogía: el parentesco es extenso y ensucia las
  // vistas donde no aporta. Si el usuario lo vuelve a mostrar, se respeta.
  useEffect(() => {
    if (view.layout === 'genealogy') return;
    const done = preferences.autoHiddenKinship[project.id] ?? [];
    const pending = genealogySchemas.map(s => s.id).filter(id => !done.includes(id));
    if (!pending.length) return;
    setPreference('autoHiddenKinship', { ...preferences.autoHiddenKinship, [project.id]: [...done, ...pending] });
    const toHide = pending.filter(id => !view.hiddenRelationTypeIds.includes(id));
    if (toHide.length) setView({ hiddenRelationTypeIds: [...view.hiddenRelationTypeIds, ...toHide] });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- solo cuando aparece un tipo genealógico nuevo
  }, [genealogySchemas, view.layout, project.id]);
  // Abrir o cerrar la leyenda se recuerda para la disposición actual.
  useEffect(() => {
    const mine = preferences.layouts[project.id] ?? {};
    if (mine[view.layout]?.legendOpen === legendOpen) return;
    setPreference('layouts', { ...preferences.layouts, [project.id]: { ...mine, [view.layout]: { legendOpen } } });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- solo reacciona a la leyenda
  }, [view.layout, legendOpen]);
  const pinnedCount = project.nodes.filter(n => n.positions[view.layout]).length;
  const selectedNode = selectedNodeId ? getNode(project, selectedNodeId) : undefined;

  if (!project.nodes.length)
    return (
      <section className="workspace empty-canvas">
        <EmptyState icon={Network} title="Un lienzo para tu proyecto">
          Aquí verás tus nodos y sus conexiones. Primero define en «Tipos» qué elementos quieres representar (
          {vocabulary(project.kind).entities}) y en «Relaciones» cómo se conectan; después crea el primer nodo con el
          botón «+» de la estructura o con doble clic aquí. Para aprender los atajos, pulsa «?».
        </EmptyState>
        <div className="react-flow-empty" onDoubleClick={onDoubleClick} />
      </section>
    );

  return (
    <CanvasSettingsContext.Provider value={settings}>
      <section
        ref={container}
        className={`workspace flow ${view.layout === 'image' ? 'with-tray' : ''}`}
        data-tour="canvas"
        data-labels={view.edgeLabels}
        onDoubleClick={onDoubleClick}
        onPointerMove={event => {
          pointerPosition.current = { x: event.clientX, y: event.clientY };
          syncHover();
        }}
        onPointerLeave={() => {
          pointerPosition.current = null;
          setHoveredId(null);
        }}
      >
        <div className="workspace-toolbar flow-toolbar">
          <LensMenu />
          <div className="segmented labeled" role="group" aria-label="Disposición" data-tour="layouts">
            <span className="segmented-label">Disposición</span>
            {LAYOUTS.map(({ mode, label, icon: Icon, hint }) => (
              <button
                key={mode}
                type="button"
                aria-pressed={view.layout === mode}
                aria-disabled={
                  (mode === 'radial' && !selectedNode) ||
                  (mode === 'genealogy' && !genealogySchemas.length) ||
                  (mode === 'database' && !hasTables)
                    ? true
                    : undefined
                }
                className={
                  (mode === 'radial' && !selectedNode) ||
                  (mode === 'genealogy' && !genealogySchemas.length) ||
                  (mode === 'database' && !hasTables)
                    ? 'looks-disabled'
                    : undefined
                }
                data-tooltip={
                  mode === 'radial' && !selectedNode
                    ? 'Vista radial: coloca un nodo en el centro y el resto en anillos según los saltos de distancia. Selecciona primero un nodo para centrarla en él.'
                    : mode === 'genealogy' && !genealogySchemas.length
                      ? 'Genealogía: generaciones en filas según el parentesco. Define primero un tipo de relación marcado como «Genealógica» en «Relaciones».'
                      : mode === 'database' && !hasTables
                        ? 'Base de datos: dibuja las tablas, colecciones y etiquetas de los tipos que tienen una base de datos. Elige primero la base de un tipo en «Tipos».'
                        : hint
                }
                data-tooltip-wide
                onClick={() => {
                  if (mode === 'radial' && !selectedNode) {
                    toast({ message: 'Selecciona un nodo para centrar en él la vista radial.' });
                    return;
                  }
                  if (mode === 'genealogy' && !genealogySchemas.length) {
                    toast({ message: 'Define primero un tipo de relación genealógico en «Relaciones».' });
                    return;
                  }
                  if (mode === 'database' && !hasTables) {
                    toast({
                      message:
                        'Elige primero en «Tipos» la base de datos de algún tipo (SQL Server, Db2 for i, MongoDB, Firestore o Neo4j).',
                    });
                    return;
                  }
                  switchLayout(mode);
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
              title="Con un nodo seleccionado (o aislado), muestra solo lo que está a 1, 2 o 3 saltos"
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
          {isolatedNode && (
            <span className="isolate-chip" role="status">
              <LocateFixed size={14} aria-hidden />
              <span>
                Aislado: <strong>{nodeLabel(project, isolatedNode)}</strong> · {focusDepth}{' '}
                {focusDepth === 1 ? 'salto' : 'saltos'}
              </span>
              <button
                type="button"
                onClick={() => {
                  const previous = isolated!.previousLayout;
                  clearIsolation();
                  const patch = viewAfterIsolation(project, previous);
                  if (Object.keys(patch).length) setView(patch);
                }}
              >
                Salir
              </button>
            </span>
          )}
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
            icon={Palette}
            label={
              view.colorByCommunity
                ? 'Color por comunidad: activado (cada grupo de nodos muy conectados entre sí lleva un color)'
                : 'Color por comunidad: desactivado (los nodos van por el color de su tipo)'
            }
            active={view.colorByCommunity}
            onClick={() => setView({ colorByCommunity: !view.colorByCommunity })}
          />
          <IconButton
            icon={Scaling}
            label={
              view.sizeByCentrality
                ? 'Tamaño por centralidad: activado (los nodos que unen grupos se ven más grandes)'
                : 'Tamaño por centralidad: desactivado'
            }
            active={view.sizeByCentrality}
            onClick={() => setView({ sizeByCentrality: !view.sizeByCentrality })}
          />
          <IconButton
            icon={Route}
            label="Camino entre dos nodos"
            active={pathQuery !== null}
            onClick={() => setPathQuery(q => (q ? null : { from: selectedNodeId, to: null }))}
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
        <FallingPins
          pins={fallingPins}
          bounds={bounds}
          onDone={id => setFallingPins(pins => pins.filter(p => p.id !== id))}
        />
        <ReactFlow
          nodes={nodes}
          edges={routedEdges as Edge[]}
          nodeTypes={nodeTypes}
          edgeTypes={edgeTypes}
          onNodesChange={onNodesChange}
          onNodeDragStart={onNodeDragStart}
          onNodeDragStop={onNodeDragStop}
          onNodeClick={onNodeClick}
          onNodeDoubleClick={(_, n) => {
            if (clickTimer.current !== null) window.clearTimeout(clickTimer.current);
            const node = getNode(project, n.id);
            const type = node && getSchema(project, node.typeId);
            if (type) openSchemaDefinition(type.id, type.kind, navigate);
          }}
          onEdgeClick={onEdgeClick}
          onPaneClick={onPaneClick}
          onNodeMouseEnter={onNodeMouseEnter}
          onNodeMouseLeave={onNodeMouseLeave}
          onConnectEnd={onConnectEnd}
          onSelectionStart={() => {
            boxSelecting.current = true;
            setPicked([]);
          }}
          onSelectionEnd={() => {
            // Los últimos cambios del recuadro llegan justo después de soltar.
            requestAnimationFrame(() => (boxSelecting.current = false));
          }}
          connectionMode={ConnectionMode.Loose}
          connectionRadius={30}
          defaultViewport={savedViewport?.viewport}
          fitView={!savedViewport}
          fitViewOptions={fitViewOptions}
          minZoom={0.1}
          maxZoom={2.5}
          onInit={instance =>
            container.current?.style.setProperty('--inv-zoom', String(1 / instance.getViewport().zoom))
          }
          onMove={(_, viewport) => {
            requestAnimationFrame(syncHover);
            container.current?.style.setProperty('--inv-zoom', String(1 / viewport.zoom));
            rememberMapViewport(project.id, {
              viewport,
              revealKey,
              frameKey,
              layout: view.layout,
              mapImage: project.mapImage,
            });
          }}
          onDragOver={event => {
            if (event.dataTransfer.types.includes(TRAY_DRAG_TYPE)) {
              event.preventDefault();
              event.dataTransfer.dropEffect = 'move';
            }
          }}
          onDrop={event => {
            const id = event.dataTransfer.getData(TRAY_DRAG_TYPE);
            if (!id) return;
            event.preventDefault();
            const p = flow.screenToFlowPosition({ x: event.clientX, y: event.clientY });
            dispatch({ type: 'move-nodes', positions: { [id]: { x: p.x - MARKER / 2, y: p.y - MARKER / 2 } } });
            onSelect({ kind: 'node', id });
          }}
          zoomOnDoubleClick={false}
          selectNodesOnDrag={false}
          nodesConnectable={canEdit}
          nodesDraggable={canEdit}
          elevateNodesOnSelect
          deleteKeyCode={null}
          multiSelectionKeyCode={null}
          proOptions={proOptions}
        >
          <Background variant={BackgroundVariant.Dots} gap={22} size={1.2} color="var(--canvas-dot)" />
          {view.layout === 'image' && project.mapImage && <MapImageLayer image={project.mapImage} />}
          {clusters.length > 0 && (
            <MapClusters
              clusters={clusters}
              zoom={zoomBucket}
              onSelect={id => onSelect({ kind: 'node', id })}
              onZoomTo={c => {
                const r = 80;
                flow.fitBounds(
                  { x: c.x - r, y: c.y - r, width: 2 * r, height: 2 * r },
                  { padding: 0.2, duration: 400 },
                );
              }}
            />
          )}
          {family && (
            <FamilyLinks
              units={family.units}
              links={family.links}
              positions={family.positions}
              color={family.color}
              onSelect={id => onSelect({ kind: 'relation', id })}
            />
          )}
          {legendOpen && (
            <Panel position="top-right">
              <LegendPanel onClose={() => setLegendOpen(false)} />
            </Panel>
          )}
          {multi && (
            <Panel position="top-center" className="canvas-bulk">
              <BulkBar ids={[...pickedSet]} fields={pickedFields} onDone={() => setPicked([])} />
            </Panel>
          )}
          <Panel position="top-left" className="canvas-tools">
            <div className="canvas-tools-row">
              {view.layout === 'image' && <MapImageMenu />}
              <ExportMenu
                name={project.name}
                container={() => container.current}
                scripts={[
                  ...(tableTypes(project, 'sqlserver').length
                    ? [
                        {
                          label: 'Script SQL Server (.sql)',
                          onSelect: () =>
                            downloadText(
                              `${fileSafeName(project.name, 'proyecto')}.sql`,
                              sqlScript(project),
                              'application/sql',
                            ),
                        },
                      ]
                    : []),
                  ...(tableTypes(project, 'db2i').length
                    ? [
                        {
                          label: 'Db2 for i: script y fuentes…',
                          onSelect: openDb2Export,
                        },
                      ]
                    : []),
                ]}
              />
            </div>
            {pathQuery && (
              <PathPanel
                query={pathQuery}
                path={path}
                onChange={setPathQuery}
                onPick={id => onSelect({ kind: 'node', id })}
                onClose={() => setPathQuery(null)}
              />
            )}
          </Panel>
          {view.layout === 'image' && project.mapImage && (
            <Panel position="bottom-right" className="map-scale-panel">
              <MapScaleControl />
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
        {view.layout === 'image' && (
          <MapTray
            project={project}
            nodes={project.nodes.filter(n => visibleIds.has(n.id) && !n.positions.image)}
            selectedId={selectedNodeId}
            onSelect={id => onSelect({ kind: 'node', id })}
          />
        )}
      </section>
    </CanvasSettingsContext.Provider>
  );
}
