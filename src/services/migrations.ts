import { PROJECT_FORMAT_VERSION } from '../domain/constants';
import { createView, uid } from '../domain/factories';
import { allFields } from '../domain/selectors';
import type { FieldValue, Project } from '../domain/types';

/*
 * Historial de formatos:
 * - v1: aplicación monolítica original (sin `formatVersion`).
 * - v2: migración a React; mismos datos con campos opcionales normalizados (sin `formatVersion`).
 * - v3: los valores de nodos y relaciones se indexan por `FieldDefinition.id` en lugar de por `key`.
 */

type RawProject = Partial<Project> & { formatVersion?: number };

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
      position: n.position && Number.isFinite(n.position.x) && Number.isFinite(n.position.y) ? n.position : null,
      notes: typeof n.notes === 'string' ? n.notes : '',
    })),
    relations: (project.relations || []).map(r => ({ ...r, values: r.values || {}, reverseName: r.reverseName || '' })),
    view: { ...createView(), ...(project.view ?? {}) },
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
