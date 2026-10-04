import { PROJECT_FORMAT_VERSION } from '../domain/constants';
import { createView, uid } from '../domain/factories';
import { DEFAULT_DERIVED, defaultKinship } from '../domain/kinship';
import { allFields } from '../domain/selectors';
import type { FieldValue, LayoutMode, Node, Position, Project } from '../domain/types';

/*
 * Historial de formatos:
 * - v1: aplicación monolítica original (sin `formatVersion`).
 * - v2: migración a React; mismos datos con campos opcionales normalizados (sin `formatVersion`).
 * - v3: los valores de nodos y relaciones se indexan por `FieldDefinition.id` en lugar de por `key`.
 */

type RawNode = Omit<Node, 'positions'> & { positions?: Node['positions']; position?: Position | null };
type RawProject = Partial<Omit<Project, 'nodes'>> & { formatVersion?: number; nodes?: RawNode[] };

const steps: Record<number, (project: Project) => Project> = {
  2: valuesByFieldId,
};

/** Convierte cualquier versión conocida de un proyecto al formato actual. */
export function migrateProject(raw: RawProject): Project {
  let project = normalizeProject(raw);
  for (let version = raw.formatVersion ?? 2; version < PROJECT_FORMAT_VERSION; version++) {
    project = steps[version]?.(project) ?? project;
  }
  return { ...project, formatVersion: PROJECT_FORMAT_VERSION };
}

const validPosition = (pos: unknown): pos is Position =>
  typeof pos === 'object' &&
  pos !== null &&
  Number.isFinite((pos as Position).x) &&
  Number.isFinite((pos as Position).y);

/**
 * Posiciones fijadas por disposición. Hasta v3 había una sola posición por nodo (`position`), que se
 * conserva en la disposición que estaba activa al migrar.
 */
function positionsOf(n: RawNode, layout: LayoutMode): Node['positions'] {
  const result: Node['positions'] = {};
  Object.entries(n.positions ?? {}).forEach(([mode, pos]) => {
    if (validPosition(pos)) result[mode as LayoutMode] = pos;
  });
  if (!n.positions && validPosition(n.position)) result[layout] = n.position;
  return result;
}

/** Rellena los campos opcionales que las versiones antiguas podían omitir. */
function normalizeProject(project: RawProject): Project {
  const stamp = new Date().toISOString();
  return {
    formatVersion: project.formatVersion ?? 2,
    id: project.id || uid('project'),
    name: project.name || 'Proyecto importado',
    createdAt: project.createdAt || stamp,
    updatedAt: project.updatedAt || stamp,
    schemas: (project.schemas || []).map(s => ({
      ...s,
      isAbstract: s.isAbstract || false,
      icon: s.icon || (s.kind === 'relationship' ? 'link' : 'circle'),
      parentTypeId: s.parentTypeId || null,
      description: s.description || '',
      fields: (s.fields || []).map(f =>
        'ref' in f
          ? f
          : {
              ...f,
              description: f.description || '',
              options: f.options || [],
              referenceTypeIds: f.referenceTypeIds || [],
              formula: f.formula || '',
            },
      ),
      allowedChildTypeIds: s.allowedChildTypeIds || [],
      sourceTypeIds: s.sourceTypeIds || [],
      targetTypeIds: s.targetTypeIds || [],
      directed: s.directed || false,
      relationStyle: s.relationStyle || 'normal',
      structural: s.structural || false,
      parentEnd: s.parentEnd || 'target',
      inverseName: s.inverseName || '',
      reciprocal: s.reciprocal || false,
      genealogical: s.genealogical || false,
    })),
    fieldLibrary: (project.fieldLibrary || []).map(f => ({
      ...f,
      description: f.description || '',
      options: f.options || [],
      referenceTypeIds: f.referenceTypeIds || [],
      formula: f.formula || '',
    })),
    nodes: (project.nodes || []).map(n => ({
      ...n,
      parentId: n.parentId || null,
      values: n.values || {},
      positions: positionsOf(n, project.view?.layout ?? 'tree'),
      notes: typeof n.notes === 'string' ? n.notes : '',
    })),
    relations: (project.relations || []).map(r => ({
      ...r,
      values: r.values || {},
      reverseName: r.reverseName || '',
      kinshipId: r.kinshipId ?? null,
      kinshipNeutral: r.kinshipNeutral || false,
    })),
    kinship: project.kinship?.length
      ? project.kinship.map(t => ({
          ...t,
          lineage: t.lineage || false,
          couple: t.couple ?? ['pareja', 'conyuge'].includes(t.id),
          derived: t.derived === undefined ? (DEFAULT_DERIVED[t.id] ?? null) : t.derived,
        }))
      : defaultKinship(),
    view: { ...createView(), ...(project.view ?? {}) },
    lenses: (project.lenses || []).map(l => ({
      ...l,
      view: { ...createView(), ...(l.view ?? {}) },
      positions: l.positions ?? null,
    })),
  };
}

/** v2 → v3: reindexa los valores por id de campo. Las claves sin campo conocido se conservan tal cual. */
function valuesByFieldId(project: Project): Project {
  const remap = (typeId: string, values: Record<string, FieldValue>) => {
    const fields = allFields(project, typeId);
    const ids = new Set(fields.map(f => f.id));
    const next: Record<string, FieldValue> = {};
    Object.entries(values).forEach(([key, value]) => {
      const field = ids.has(key) ? undefined : fields.find(f => f.key === key);
      next[field ? field.id : key] = value;
    });
    return next;
  };
  return {
    ...project,
    nodes: project.nodes.map(n => ({ ...n, values: remap(n.typeId, n.values) })),
    relations: project.relations.map(r => ({ ...r, values: remap(r.typeId, r.values) })),
  };
}
