import { removeNodes } from './operations';
import { schemaDescendants } from './selectors';
import type { FieldValue, Project } from './types';

/*
 * Qué sale de un proyecto al hacerlo público (docs/roadmaps/ROADMAP_COMUNIDAD.md). Publicar sube una copia
 * de solo lectura; quien publica deja fuera lo que no quiere enseñar. Nunca salen la agenda (tareas,
 * entregas y asignaciones de trabajo), las conversaciones con la IA ni los comentarios del grupo: estos dos
 * últimos ni siquiera viven en el proyecto.
 */

export interface PublicationOptions {
  /** Las notas libres de las fichas (por defecto, fuera). */
  notes: boolean;
  /** Las imágenes de las fichas y el fondo del mapa. */
  images: boolean;
  /** Tipos de entidad o de relación que no se publican (con sus subtipos). */
  excludedTypeIds: string[];
}

export const DEFAULT_PUBLICATION_OPTIONS: PublicationOptions = { notes: false, images: true, excludedTypeIds: [] };

const isImage = (value: FieldValue) => typeof value === 'string' && value.startsWith('data:image/');

function withoutImages(values: Record<string, FieldValue>) {
  if (!Object.values(values).some(isImage)) return values;
  return Object.fromEntries(Object.entries(values).filter(([, value]) => !isImage(value)));
}

/** Los tipos que no se publican: los elegidos y los que heredan de ellos. */
export function excludedTypes(p: Project, typeIds: string[]) {
  const excluded = new Set<string>();
  for (const id of typeIds) {
    if (!p.schemas.some(s => s.id === id)) continue;
    excluded.add(id);
    for (const sub of schemaDescendants(p, id)) excluded.add(sub);
  }
  return excluded;
}

/**
 * La copia que se publica. Los nodos de un tipo excluido desaparecen como al borrarlos (sus relaciones y
 * las referencias a ellos se van, y sus hijos suben al ancestro que queda); el esquema se conserva entero
 * para que el resto se lea igual.
 */
export function publicationSnapshot(p: Project, options: PublicationOptions): Project {
  const excluded = excludedTypes(p, options.excludedTypeIds);
  const removed = new Set(p.nodes.filter(n => excluded.has(n.typeId)).map(n => n.id));
  let project = removeNodes({ ...p, agenda: [] }, removed);
  project = { ...project, relations: project.relations.filter(r => !excluded.has(r.typeId)) };
  if (!options.notes) project = { ...project, nodes: project.nodes.map(n => (n.notes ? { ...n, notes: '' } : n)) };
  if (!options.images) {
    project = {
      ...project,
      mapImage: null,
      nodes: project.nodes.map(n => ({ ...n, values: withoutImages(n.values) })),
      relations: project.relations.map(r => ({ ...r, values: withoutImages(r.values) })),
    };
  }
  return project;
}

/** Lo que se va a publicar, para enseñarlo antes de confirmar. */
export function publicationSummary(p: Project, options: PublicationOptions) {
  const snapshot = publicationSnapshot(p, options);
  return {
    nodes: snapshot.nodes.length,
    relations: snapshot.relations.length,
    leftOutNodes: p.nodes.length - snapshot.nodes.length,
    notes: options.notes ? snapshot.nodes.filter(n => n.notes.trim()).length : 0,
    hiddenNotes: options.notes ? 0 : p.nodes.filter(n => n.notes.trim()).length,
    agenda: p.agenda.length,
  };
}
